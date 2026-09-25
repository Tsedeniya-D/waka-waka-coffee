import { createResourceService } from '../lib/resource.js'
import { attachProfiles } from '../lib/profiles.js'
import { getById, runList, sanitizeSearch, updateOne } from '../lib/query.js'
import { unwrap } from '../utils/dbError.js'
import { AppError } from '../utils/AppError.js'
import { isAdminRole } from '../config/permissions.js'

const SELECT = '*, lot:coffee_lots(id, lot_code, origin, quantity_kg, processing_method, grade, status)'

const base = createResourceService({ table: 'quality_inspections', label: 'Inspection', select: SELECT })

/** Search also matches the lot code / origin of the inspected lot. */
export async function list(db, q) {
  const term = sanitizeSearch(q.search)
  let query = db.from('quality_inspections').select(SELECT, { count: 'exact' })
  if (term) {
    const lots = unwrap(
      await db.from('coffee_lots').select('id').or(`lot_code.ilike.*${term}*,origin.ilike.*${term}*`).limit(500),
      'Searching lots'
    )
    const clauses = [`sample_reference.ilike.*${term}*`, `final_grade.ilike.*${term}*`, `screen_size.ilike.*${term}*`]
    if (lots.length) clauses.push(`lot_id.in.(${lots.map((l) => l.id).join(',')})`)
    query = query.or(clauses.join(','))
  }
  const result = await runList(
    query,
    {
      ...q,
      search: undefined,
      eq: { lot_id: q.lot_id, result: q.result, approval_status: q.approval_status, sample_type: q.sample_type },
      range: { column: 'inspection_date', from: q.from, to: q.to, dateOnly: true },
    },
    'Loading inspections'
  )
  await attachProfiles(db, result.rows, [['inspector_id', 'inspector'], ['approved_by', 'approver']])
  return result
}

export async function get(db, id) {
  const row = await base.get(db, id)
  await attachProfiles(db, row, [['inspector_id', 'inspector'], ['approved_by', 'approver']])
  return row
}

export async function create(db, body) {
  const lot = await getById(db, 'coffee_lots', body.lot_id, 'id, status', 'Coffee lot')
  if (['shipped', 'sold'].includes(lot.status)) {
    throw AppError.conflict('Shipped lots cannot be inspected.')
  }
  const row = await base.create(db, { ...body, approval_status: 'pending' })
  return get(db, row.id)
}

export async function update(db, id, body, auth) {
  const current = await getById(db, 'quality_inspections', id, 'id, approval_status', 'Inspection')
  if (current.approval_status !== 'pending' && !isAdminRole(auth.role)) {
    throw AppError.conflict(`This inspection is already ${current.approval_status}; only an administrator can change it.`)
  }
  await base.update(db, id, body)
  return get(db, id)
}

/**
 * Approve or reject. Approval requires a "passed" result; the database then
 * moves the lot to approved/rejected and notifies Field and Warehouse.
 */
export async function decide(db, id, { decision, notes }) {
  const current = await getById(db, 'quality_inspections', id, 'id, approval_status, result, notes', 'Inspection')
  if (current.approval_status !== 'pending') {
    throw AppError.conflict(`This inspection was already ${current.approval_status}.`)
  }
  if (decision === 'approved' && current.result !== 'passed') {
    throw AppError.badRequest('Record a "passed" result before approving the inspection.')
  }
  const values = { approval_status: decision }
  if (notes) values.notes = [current.notes, `${decision === 'approved' ? 'Approved' : 'Rejected'}: ${notes}`].filter(Boolean).join('\n')
  await updateOne(db, 'quality_inspections', id, values, 'id', 'Inspection')
  return get(db, id)
}

/** Administrators can withdraw a decision (e.g. recorded by mistake). */
export async function reopen(db, id) {
  await updateOne(db, 'quality_inspections', id, { approval_status: 'pending' }, 'id', 'Inspection')
  return get(db, id)
}

export const remove = base.remove
export const removeMany = base.removeMany
