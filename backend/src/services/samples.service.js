import { compact, deleteMany, deleteOne, getById, insertOne, rpc, runList, updateOne } from '../lib/query.js'
import { unwrap } from '../utils/dbError.js'
import { AppError } from '../utils/AppError.js'
import { assertAssignee } from './customers.service.js'
import { assertTransition, nextStatuses } from './workflow.service.js'

/**
 * Sample requests are their own workflow (review -> prepare -> dispatch ->
 * deliver). They never turn into sales orders.
 */
const SELECT = '*, customer:customers(id, customer_code, company_name, country), assigned:profiles(id, full_name)'

export function list(db, q) {
  return runList(
    db.from('sample_requests').select(SELECT, { count: 'exact' }),
    {
      ...q,
      eq: { status: q.status, assigned_to: q.assigned_to, customer_id: q.customer_id },
      searchColumns: ['reference_number', 'full_name', 'company', 'email', 'country', 'product_name', 'tracking_number'],
      range: { column: 'created_at', from: q.from, to: q.to },
    },
    'Loading sample requests'
  )
}

export async function get(db, id, role) {
  const sample = await getById(db, 'sample_requests', id, SELECT, 'Sample request')
  const documents = unwrap(
    await db
      .from('documents')
      .select('id, title, document_type, file_name, file_url, created_at')
      .eq('related_type', 'sample_request')
      .eq('related_id', id)
      .order('created_at', { ascending: false }),
    'Loading documents'
  )
  return {
    ...sample,
    documents,
    next_statuses: role ? (await nextStatuses(db, role, 'sample_request', sample.status)).map((t) => t.to_status) : undefined,
  }
}

export async function create(db, body, auth) {
  const { link_customer: link, ...values } = body
  const row = await insertOne(db, 'sample_requests', compact({ ...values, status: 'new', assigned_to: auth.userId }), 'id', 'sample request')
  if (link && !values.customer_id) {
    await rpc(db, 'link_request_customer', { p_request_type: 'sample_request', p_request_id: row.id }, 'Linking customer')
  }
  return get(db, row.id, auth.role)
}

export async function update(db, id, body, auth) {
  const current = await getById(db, 'sample_requests', id, 'id, status', 'Sample request')
  if (['completed', 'cancelled'].includes(current.status) && Object.keys(body).some((k) => k !== 'admin_notes')) {
    throw AppError.conflict(`This sample request is ${current.status}; only internal notes can change.`)
  }
  await updateOne(db, 'sample_requests', id, compact(body), 'id', 'Sample request')
  return get(db, id, auth.role)
}

/** Dispatch requires courier + tracking number (also enforced by the database). */
export async function setStatus(db, auth, id, { status, reason, courier, tracking_number }) {
  const current = await getById(db, 'sample_requests', id, 'id, status, admin_notes, courier, tracking_number', 'Sample request')
  await assertTransition(db, auth.role, 'sample_request', current.status, status)
  const values = compact({ status, courier, tracking_number })
  if (status === 'dispatched' && (!(values.courier ?? current.courier) || !(values.tracking_number ?? current.tracking_number))) {
    throw AppError.badRequest('Enter the courier and tracking number before dispatching the sample.')
  }
  if (reason) values.admin_notes = [current.admin_notes, `${status}: ${reason}`].filter(Boolean).join('\n')
  await updateOne(db, 'sample_requests', id, values, 'id', 'Sample request')
  return get(db, id, auth.role)
}

export async function assign(db, auth, id, assignedTo) {
  await assertAssignee(db, assignedTo)
  await updateOne(db, 'sample_requests', id, { assigned_to: assignedTo }, 'id', 'Sample request')
  return get(db, id, auth.role)
}

export async function linkCustomer(db, auth, id) {
  await getById(db, 'sample_requests', id, 'id', 'Sample request')
  await rpc(db, 'link_request_customer', { p_request_type: 'sample_request', p_request_id: id }, 'Linking customer')
  return get(db, id, auth.role)
}

export const remove = (db, id) => deleteOne(db, 'sample_requests', id, 'Sample request')
export async function removeMany(db, ids) {
  return { deleted: await deleteMany(db, 'sample_requests', ids, 'sample requests'), skipped: [] }
}
