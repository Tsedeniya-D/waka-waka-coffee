import { createResourceService } from '../lib/resource.js'
import { attachProfiles } from '../lib/profiles.js'
import { getById, updateOne } from '../lib/query.js'
import { unwrap } from '../utils/dbError.js'
import { AppError } from '../utils/AppError.js'
import { assertTransition } from './workflow.service.js'

const SELECT =
  '*, supplier:suppliers(id, supplier_code, name), farmer:farmers(id, farmer_code, name), ' +
  'farm:farms(id, farm_code, farm_name), location:locations(id, location_code, name)'

const base = createResourceService({
  table: 'collection_records',
  label: 'Collection',
  select: SELECT,
  searchColumns: ['collection_code', 'origin', 'region', 'zone', 'woreda', 'kebele', 'variety'],
  filters: (q) => ({
    status: q.status,
    supplier_id: q.supplier_id,
    farmer_id: q.farmer_id,
    field_officer_id: q.field_officer_id,
  }),
  dateColumn: 'collection_date',
  dateOnly: true,
})

async function lotTotals(db, collectionId) {
  const lots = unwrap(
    await db
      .from('coffee_lots')
      .select('id, lot_code, quantity_kg, status, grade, processing_method, created_at')
      .eq('collection_id', collectionId)
      .order('created_at'),
    'Loading lots'
  )
  const allocated = lots.reduce((s, l) => s + Number(l.quantity_kg || 0), 0)
  return { lots, allocated }
}

export async function list(db, q) {
  const result = await base.list(db, q)
  await attachProfiles(db, result.rows, [['field_officer_id', 'field_officer']])
  return result
}

export async function get(db, id) {
  const row = await base.get(db, id)
  const { lots, allocated } = await lotTotals(db, id)
  await attachProfiles(db, row, [['field_officer_id', 'field_officer']])
  return { ...row, lots, lotted_kg: allocated, remaining_kg: Math.max(Number(row.quantity_kg) - allocated, 0) }
}

export async function create(db, body) {
  const row = await base.create(db, body)
  return get(db, row.id)
}

/** Once lots exist the source (supplier / farmer / farm) is locked for traceability. */
export async function update(db, id, body) {
  const current = await getById(db, 'collection_records', id, 'id, status, supplier_id', 'Collection')
  if (current.status === 'rejected') {
    throw AppError.conflict('A rejected collection cannot be edited. Reopen it first.')
  }
  const { lots } = await lotTotals(db, id)
  const sourceKeys = ['supplier_id', 'farmer_id', 'farm_id', 'origin']
  if (lots.length && sourceKeys.some((k) => body[k] !== undefined)) {
    throw AppError.conflict('Lots were already created from this collection; its source can no longer change.')
  }
  await base.update(db, id, body)
  return get(db, id)
}

export async function setStatus(db, role, id, { status, reason }) {
  const current = await getById(db, 'collection_records', id, 'id, status, notes', 'Collection')
  await assertTransition(db, role, 'collection', current.status, status)
  if (status === 'rejected') {
    const { lots } = await lotTotals(db, id)
    if (lots.length) throw AppError.conflict('This collection already has lots and cannot be rejected.')
  }
  const notes = reason ? [current.notes, `${status}: ${reason}`].filter(Boolean).join('\n') : undefined
  await updateOne(db, 'collection_records', id, { status, ...(notes ? { notes } : {}) }, 'id', 'Collection')
  return get(db, id)
}

export const remove = base.remove
