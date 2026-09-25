import { attachProfiles } from '../lib/profiles.js'
import { getById, rpc, runList, sanitizeSearch, updateOne } from '../lib/query.js'
import { unwrap } from '../utils/dbError.js'

const SELECT =
  '*, lot:coffee_lots(id, lot_code, origin, quantity_kg, processing_method, grade, status), ' +
  'warehouse:warehouses(id, code, name, location)'

async function lotIdsMatching(db, term) {
  const rows = unwrap(
    await db.from('coffee_lots').select('id').or(`lot_code.ilike.*${term}*,origin.ilike.*${term}*,grade.ilike.*${term}*`).limit(500),
    'Searching lots'
  )
  return rows.map((r) => r.id)
}

export async function list(db, q) {
  let query = db.from('inventory').select(SELECT, { count: 'exact' })
  const term = sanitizeSearch(q.search)
  if (term) {
    const ids = await lotIdsMatching(db, term)
    const clauses = [`notes.ilike.*${term}*`, `coffee_type.ilike.*${term}*`]
    if (ids.length) clauses.push(`lot_id.in.(${ids.join(',')})`)
    query = query.or(clauses.join(','))
  }
  if (q.in_stock || q.low_stock) query = query.gt('quantity_kg', 0)
  // bag_count <= par_level_bags compares two columns, which PostgREST cannot
  // filter on; for that filter load all matching rows, filter, then page here.
  const paging = q.low_stock ? { page: 1, limit: 1000 } : {}
  const result = await runList(
    query,
    {
      ...q,
      ...paging,
      search: undefined,
      sort: q.sort ?? '-updated_at',
      eq: { warehouse_id: q.warehouse_id, lot_id: q.lot_id, status: q.status },
      range: { column: 'received_date', from: q.from, to: q.to, dateOnly: true },
    },
    'Loading inventory'
  )
  for (const r of result.rows) {
    r.is_low_stock = r.par_level_bags != null && r.bag_count != null && r.bag_count <= r.par_level_bags && Number(r.quantity_kg) > 0
    r.total_cost = r.unit_cost_per_kg != null ? Number(r.quantity_kg) * Number(r.unit_cost_per_kg) + Number(r.shipping_cost ?? 0) : null
  }
  if (q.low_stock) {
    const low = result.rows.filter((r) => r.is_low_stock)
    const page = q.page ?? 1
    const limit = q.limit ?? 1000
    return { rows: low.slice((page - 1) * limit, page * limit), count: low.length, page, limit }
  }
  return result
}

export async function get(db, id) {
  const row = await getById(db, 'inventory', id, SELECT, 'Inventory record')
  const movements = unwrap(
    await db
      .from('inventory_transactions')
      .select('*')
      .eq('lot_id', row.lot_id)
      .eq('warehouse_id', row.warehouse_id)
      .order('created_at', { ascending: false }),
    'Loading stock movements'
  )
  await attachProfiles(db, movements, [['performed_by', 'performer']])
  return { ...row, movements }
}

export async function transactions(db, q) {
  const result = await runList(
    db
      .from('inventory_transactions')
      .select('*, lot:coffee_lots(id, lot_code, origin), warehouse:warehouses(id, code, name)', { count: 'exact' }),
    {
      ...q,
      search: undefined,
      eq: { lot_id: q.lot_id, warehouse_id: q.warehouse_id, transaction_type: q.transaction_type },
      range: { column: 'created_at', from: q.from, to: q.to },
    },
    'Loading stock movements'
  )
  await attachProfiles(db, result.rows, [['performed_by', 'performer']])
  return result
}

/**
 * Approved lots that still have quantity to receive, for the "Receive coffee"
 * form (quality gate: only approved lots can enter a warehouse).
 */
export async function receivableLots(db) {
  const lots = unwrap(
    await db
      .from('coffee_lots')
      .select('id, lot_code, origin, quantity_kg, grade, processing_method, status')
      .in('status', ['approved', 'in_warehouse', 'reserved', 'shipped'])
      .order('created_at', { ascending: false }),
    'Loading lots'
  )
  if (!lots.length) return []
  const receipts = unwrap(
    await db
      .from('inventory_transactions')
      .select('lot_id, quantity_kg')
      .in('lot_id', lots.map((l) => l.id))
      .in('transaction_type', ['receipt', 'in']),
    'Loading receipts'
  )
  const received = new Map()
  for (const r of receipts) received.set(r.lot_id, (received.get(r.lot_id) ?? 0) + Number(r.quantity_kg))
  return lots
    .map((l) => ({ ...l, received_kg: received.get(l.id) ?? 0, remaining_kg: Number(l.quantity_kg) - (received.get(l.id) ?? 0) }))
    .filter((l) => l.remaining_kg > 0)
}

export async function receive(db, b) {
  const row = await rpc(
    db,
    'inventory_receive',
    {
      p_lot_id: b.lot_id,
      p_warehouse_id: b.warehouse_id,
      p_quantity_kg: b.quantity_kg,
      p_bag_count: b.bag_count ?? null,
      p_weight_per_bag_kg: b.weight_per_bag_kg ?? null,
      p_unit_cost_per_kg: b.unit_cost_per_kg ?? null,
      p_shipping_cost: b.shipping_cost ?? null,
      p_par_level_bags: b.par_level_bags ?? null,
      p_received_date: b.received_date ?? null,
      p_notes: b.notes ?? null,
    },
    'Receiving coffee'
  )
  return get(db, row.id)
}

export async function adjust(db, id, { delta_kg, reason }) {
  await rpc(db, 'inventory_adjust', { p_inventory_id: id, p_delta_kg: delta_kg, p_reason: reason }, 'Adjusting stock')
  return get(db, id)
}

export async function issue(db, id, b) {
  await rpc(
    db,
    'inventory_issue',
    {
      p_inventory_id: id,
      p_quantity_kg: b.quantity_kg,
      p_reason: b.reason,
      p_reference_type: b.reference_type ?? null,
      p_reference_id: b.reference_id ?? null,
    },
    'Issuing stock'
  )
  return get(db, id)
}

export async function transfer(db, id, b) {
  const result = await rpc(
    db,
    'inventory_transfer',
    { p_inventory_id: id, p_to_warehouse_id: b.to_warehouse_id, p_quantity_kg: b.quantity_kg, p_notes: b.notes ?? null },
    'Transferring stock'
  )
  return { from: await get(db, id), to: await get(db, result.to.id) }
}

/** Descriptive fields only; quantity and status change through the ledger. */
export async function updateDetails(db, id, body) {
  await updateOne(db, 'inventory', id, body, 'id', 'Inventory record')
  return get(db, id)
}
