import { createResourceService } from '../lib/resource.js'
import { attachProfiles } from '../lib/profiles.js'
import { getById } from '../lib/query.js'
import { unwrap } from '../utils/dbError.js'
import { AppError } from '../utils/AppError.js'

const SELECT = '*, manager:profiles(id, full_name, role)'

/** Keep the legacy text `status` column in step with `is_active`. */
function withStatus(body) {
  return body.is_active === undefined ? body : { ...body, status: body.is_active ? 'active' : 'inactive' }
}

const base = createResourceService({
  table: 'warehouses',
  label: 'Warehouse',
  select: SELECT,
  searchColumns: ['name', 'code', 'location', 'contact_person'],
  filters: (q) => ({ is_active: q.status ? q.status === 'active' : undefined }),
  beforeCreate: (_db, body) => withStatus(body),
  beforeUpdate: (_db, _id, body) => withStatus(body),
})

async function stockByWarehouse(db, ids) {
  if (!ids.length) return new Map()
  const rows = unwrap(
    await db.from('inventory').select('warehouse_id, quantity_kg').in('warehouse_id', ids),
    'Loading stock levels'
  )
  const totals = new Map()
  for (const r of rows) totals.set(r.warehouse_id, (totals.get(r.warehouse_id) ?? 0) + Number(r.quantity_kg))
  return totals
}

async function assertManager(db, managerId) {
  if (!managerId) return
  const person = unwrap(
    await db.from('profiles').select('id, is_active').eq('id', managerId).maybeSingle(),
    'Checking responsible employee'
  )
  if (!person || !person.is_active) throw AppError.badRequest('The responsible employee must be an active employee.')
}

export async function list(db, q) {
  const result = await base.list(db, q)
  const stock = await stockByWarehouse(db, result.rows.map((w) => w.id))
  for (const w of result.rows) {
    w.stock_kg = stock.get(w.id) ?? 0
    w.utilisation_pct = w.capacity_kg ? Math.round((1000 * w.stock_kg) / Number(w.capacity_kg)) / 10 : null
  }
  return result
}

export async function get(db, id) {
  const warehouse = await base.get(db, id)
  const [stock, movements] = await Promise.all([
    db
      .from('inventory')
      .select('id, quantity_kg, status, bag_count, received_date, lot:coffee_lots(id, lot_code, origin, grade, status)')
      .eq('warehouse_id', id)
      .gt('quantity_kg', 0)
      .order('received_date', { ascending: false }),
    db
      .from('inventory_transactions')
      .select('id, transaction_type, quantity_kg, balance_after, created_at, notes, performed_by, lot:coffee_lots(id, lot_code)')
      .eq('warehouse_id', id)
      .order('created_at', { ascending: false })
      .limit(50),
  ])
  const stockRows = unwrap(stock, 'Loading warehouse stock')
  const movementRows = unwrap(movements, 'Loading warehouse movements')
  await attachProfiles(db, movementRows, [['performed_by', 'performer']])
  const total = stockRows.reduce((s, r) => s + Number(r.quantity_kg), 0)
  return {
    ...warehouse,
    stock: stockRows,
    movements: movementRows,
    stock_kg: total,
    utilisation_pct: warehouse.capacity_kg ? Math.round((1000 * total) / Number(warehouse.capacity_kg)) / 10 : null,
  }
}

export async function create(db, body, auth) {
  await assertManager(db, body.manager_id)
  const row = await base.create(db, body, auth)
  return get(db, row.id)
}

export async function update(db, id, body, auth) {
  await assertManager(db, body.manager_id)
  if (body.capacity_kg != null) {
    const stock = (await stockByWarehouse(db, [id])).get(id) ?? 0
    if (Number(body.capacity_kg) < stock) {
      throw AppError.conflict(`The warehouse currently holds ${stock} kg; capacity cannot be lower.`)
    }
  }
  await base.update(db, id, body, auth)
  return get(db, id)
}

export async function remove(db, id) {
  const stock = (await stockByWarehouse(db, [id])).get(id) ?? 0
  if (stock > 0) throw AppError.conflict('Move or issue the stock in this warehouse before deleting it.')
  await getById(db, 'warehouses', id, 'id', 'Warehouse')
  return base.remove(db, id)
}
