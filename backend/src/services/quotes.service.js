import { attachProfiles } from '../lib/profiles.js'
import { compact, deleteMany, deleteOne, getById, insertOne, rpc, runList, updateOne } from '../lib/query.js'
import { unwrap } from '../utils/dbError.js'
import { AppError } from '../utils/AppError.js'
import { assertAssignee } from './customers.service.js'
import { assertTransition, nextStatuses } from './workflow.service.js'

const SELECT =
  '*, customer:customers(id, customer_code, company_name, country), assigned:profiles(id, full_name), ' +
  'orders:sales_orders(id, order_number, status)'

export function list(db, q) {
  return runList(
    db.from('quote_requests').select(SELECT, { count: 'exact' }),
    {
      ...q,
      eq: { status: q.status, assigned_to: q.assigned_to, customer_id: q.customer_id },
      searchColumns: ['reference_number', 'full_name', 'company', 'email', 'country', 'product_name', 'region_name'],
      range: { column: 'created_at', from: q.from, to: q.to },
    },
    'Loading quote requests'
  )
}

export async function get(db, id, role) {
  const quote = await getById(db, 'quote_requests', id, SELECT, 'Quote request')
  const [items, documents] = await Promise.all([
    db.from('quote_items').select('*').eq('quote_request_id', id).order('sort_order').order('created_at'),
    db
      .from('documents')
      .select('id, title, document_type, file_name, file_url, is_public, created_at')
      .eq('related_type', 'quote_request')
      .eq('related_id', id)
      .order('created_at', { ascending: false }),
  ])
  const itemRows = unwrap(items, 'Loading quote items')
  const priced = itemRows.filter((i) => i.unit_price != null)
  return {
    ...quote,
    items: itemRows,
    documents: unwrap(documents, 'Loading documents'),
    quotation_total: priced.length ? priced.reduce((s, i) => s + Number(i.unit_price) * Number(i.quantity_kg), 0) : null,
    next_statuses: role ? (await nextStatuses(db, role, 'quote_request', quote.status)).map((t) => t.to_status) : undefined,
  }
}

/** Quote recorded by Sales (phone / e-mail enquiry). */
export async function create(db, body, auth) {
  const { link_customer: link, ...values } = body
  const row = await insertOne(db, 'quote_requests', compact({ ...values, status: 'new', assigned_to: auth.userId }), 'id', 'quote request')
  if (link && !values.customer_id) {
    await rpc(db, 'link_request_customer', { p_request_type: 'quote_request', p_request_id: row.id }, 'Linking customer')
  }
  return get(db, row.id, auth.role)
}

export async function update(db, id, body, auth) {
  const current = await getById(db, 'quote_requests', id, 'id, status', 'Quote request')
  if (current.status === 'converted') {
    throw AppError.conflict('This quote was converted to a sales order and can no longer be edited.')
  }
  await updateOne(db, 'quote_requests', id, compact(body), 'id', 'Quote request')
  return get(db, id, auth.role)
}

export async function setStatus(db, auth, id, { status, reason }) {
  const current = await getById(db, 'quote_requests', id, 'id, status, admin_notes', 'Quote request')
  await assertTransition(db, auth.role, 'quote_request', current.status, status)
  const values = { status }
  if (reason) values.admin_notes = [current.admin_notes, `${status}: ${reason}`].filter(Boolean).join('\n')
  await updateOne(db, 'quote_requests', id, values, 'id', 'Quote request')
  return get(db, id, auth.role)
}

export async function assign(db, auth, id, assignedTo) {
  await assertAssignee(db, assignedTo)
  await updateOne(db, 'quote_requests', id, { assigned_to: assignedTo }, 'id', 'Quote request')
  return get(db, id, auth.role)
}

export async function linkCustomer(db, auth, id) {
  await getById(db, 'quote_requests', id, 'id', 'Quote request')
  await rpc(db, 'link_request_customer', { p_request_type: 'quote_request', p_request_id: id }, 'Linking customer')
  return get(db, id, auth.role)
}

/** Accepted quote -> draft sales order (atomic in the database). */
export async function convert(db, id) {
  return rpc(db, 'convert_quote_to_order', { p_quote_id: id }, 'Converting quote')
}

// --- items ---------------------------------------------------------------------
async function assertEditableQuote(db, id) {
  const quote = await getById(db, 'quote_requests', id, 'id, status', 'Quote request')
  if (['converted', 'rejected'].includes(quote.status)) {
    throw AppError.conflict(`Quote items cannot change once the quote is ${quote.status}.`)
  }
}

export async function addItem(db, auth, id, body) {
  await assertEditableQuote(db, id)
  await insertOne(db, 'quote_items', { ...compact(body), quote_request_id: id }, 'id', 'quote item')
  return get(db, id, auth.role)
}

export async function updateItem(db, auth, id, itemId, body) {
  await assertEditableQuote(db, id)
  const rows = unwrap(
    await db.from('quote_items').update(compact(body)).eq('id', itemId).eq('quote_request_id', id).select('id'),
    'Updating quote item'
  )
  if (!rows.length) throw AppError.notFound('Quote item not found.')
  return get(db, id, auth.role)
}

export async function removeItem(db, auth, id, itemId) {
  await assertEditableQuote(db, id)
  const rows = unwrap(
    await db.from('quote_items').delete().eq('id', itemId).eq('quote_request_id', id).select('id'),
    'Removing quote item'
  )
  if (!rows.length) throw AppError.notFound('Quote item not found.')
  return get(db, id, auth.role)
}

export async function remove(db, id) {
  const orders = unwrap(await db.from('sales_orders').select('id').eq('quote_request_id', id).limit(1), 'Checking orders')
  if (orders.length) throw AppError.conflict('This quote has a sales order and cannot be deleted.')
  return deleteOne(db, 'quote_requests', id, 'Quote request')
}

export async function removeMany(db, ids) {
  const orders = unwrap(await db.from('sales_orders').select('quote_request_id').in('quote_request_id', ids), 'Checking orders')
  const blocked = new Set(orders.map((o) => o.quote_request_id))
  const deletable = ids.filter((i) => !blocked.has(i))
  const deleted = deletable.length ? await deleteMany(db, 'quote_requests', deletable, 'quote requests') : []
  return { deleted, skipped: ids.filter((i) => blocked.has(i)) }
}

export { attachProfiles }
