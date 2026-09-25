import { createResourceService } from '../lib/resource.js'
import { attachProfiles } from '../lib/profiles.js'
import { getById } from '../lib/query.js'
import { unwrap } from '../utils/dbError.js'
import { AppError } from '../utils/AppError.js'

const SELECT =
  '*, collection:collection_records(id, collection_code, collection_date, quantity_kg, farmer_id, farm_id), ' +
  'supplier:suppliers(id, supplier_code, name)'

const base = createResourceService({
  table: 'coffee_lots',
  label: 'Coffee lot',
  select: SELECT,
  searchColumns: ['lot_code', 'origin', 'grade', 'processing_method'],
  filters: (q) => ({ status: q.status, collection_id: q.collection_id, supplier_id: q.supplier_id, origin: q.origin }),
})

export const list = base.list

export async function get(db, id) {
  const lot = await base.get(db, id)
  const [inspections, inventory, receipts, allocations] = await Promise.all([
    db
      .from('quality_inspections')
      .select('id, inspection_date, sample_type, result, approval_status, final_grade, cup_score, moisture, inspector_id, approved_at')
      .eq('lot_id', id)
      .order('inspection_date', { ascending: false }),
    db
      .from('inventory')
      .select('id, quantity_kg, status, bag_count, received_date, warehouse:warehouses(id, code, name)')
      .eq('lot_id', id),
    db.from('inventory_transactions').select('quantity_kg').eq('lot_id', id).in('transaction_type', ['receipt', 'in']),
    db
      .from('export_batch_lots')
      .select('id, quantity_kg, released_at, warehouse_id, batch:export_batches(id, batch_number, status)')
      .eq('lot_id', id),
  ])
  const inspectionRows = unwrap(inspections, 'Loading inspections')
  await attachProfiles(db, inspectionRows, [['inspector_id', 'inspector']])
  const received = unwrap(receipts, 'Loading receipts').reduce((s, r) => s + Number(r.quantity_kg), 0)
  const stock = unwrap(inventory, 'Loading stock')
  return {
    ...lot,
    inspections: inspectionRows,
    inventory: stock,
    allocations: unwrap(allocations, 'Loading export allocations'),
    received_kg: received,
    unreceived_kg: Math.max(Number(lot.quantity_kg) - received, 0),
    on_hand_kg: stock.reduce((s, r) => s + Number(r.quantity_kg), 0),
  }
}

export async function create(db, body) {
  // Status, supplier and origin come from the collection (database trigger).
  const row = await base.create(db, body)
  return get(db, row.id)
}

/** Quantity / processing / grade are corrections allowed only before quality approval. */
export async function update(db, id, body) {
  const current = await getById(db, 'coffee_lots', id, 'id, status', 'Coffee lot')
  const correction = ['quantity_kg', 'processing_method', 'grade', 'origin'].some((k) => body[k] !== undefined)
  if (correction && current.status !== 'pending_quality') {
    throw AppError.conflict('Only notes can be edited after the lot has been through quality control.')
  }
  await base.update(db, id, body)
  return get(db, id)
}

export async function remove(db, id) {
  const lot = await getById(db, 'coffee_lots', id, 'id, status', 'Coffee lot')
  if (!['pending_quality', 'rejected'].includes(lot.status)) {
    throw AppError.conflict('Only lots that never entered stock can be deleted.')
  }
  return base.remove(db, id)
}
