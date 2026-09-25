import { createResourceService } from '../lib/resource.js'
import { attachProfiles } from '../lib/profiles.js'
import { deleteMany, deleteOne, getById, runList, updateOne } from '../lib/query.js'
import { canonicalRole } from '../config/permissions.js'
import { unwrap } from '../utils/dbError.js'
import { AppError } from '../utils/AppError.js'

/** The person something is assigned to must be an active member of `roles`. */
export async function assertAssignee(db, userId, roles = ['sales', 'admin', 'super_admin']) {
  if (!userId) return
  const person = unwrap(
    await db.from('profiles').select('id, role, is_active, full_name').eq('id', userId).maybeSingle(),
    'Checking assignee'
  )
  if (!person || !person.is_active || !roles.includes(canonicalRole(person.role))) {
    throw AppError.badRequest('Assign the record to an active Sales employee.')
  }
}

// -----------------------------------------------------------------------------
// Customers
// -----------------------------------------------------------------------------
const CUSTOMER_SELECT = '*, assigned:profiles(id, full_name)'

const customers = createResourceService({
  table: 'customers',
  label: 'Customer',
  select: CUSTOMER_SELECT,
  searchColumns: ['company_name', 'customer_code', 'contact_person', 'email', 'country', 'city'],
  filters: (q) => ({ status: q.status, source: q.source, country: q.country, assigned_to: q.assigned_to }),
  dateColumn: 'created_at',
})

export const listCustomers = customers.list

export async function getCustomer(db, id) {
  const customer = await customers.get(db, id)
  await attachProfiles(db, customer, [['created_by', 'creator']])
  const [quotes, samples, orders] = await Promise.all([
    db
      .from('quote_requests')
      .select('id, reference_number, product_name, quantity_kg, status, created_at')
      .eq('customer_id', id)
      .order('created_at', { ascending: false }),
    db
      .from('sample_requests')
      .select('id, reference_number, product_name, sample_quantity, status, created_at, tracking_number')
      .eq('customer_id', id)
      .order('created_at', { ascending: false }),
    db
      .from('sales_orders')
      .select('id, order_number, product_name, quantity_kg, unit_price, currency, status, created_at')
      .eq('customer_id', id)
      .order('created_at', { ascending: false }),
  ])
  const orderRows = unwrap(orders, 'Loading order history')
  return {
    ...customer,
    quote_history: unwrap(quotes, 'Loading quote history'),
    sample_history: unwrap(samples, 'Loading sample history'),
    order_history: orderRows,
    totals: {
      orders: orderRows.length,
      ordered_kg: orderRows.filter((o) => o.status !== 'cancelled').reduce((s, o) => s + Number(o.quantity_kg), 0),
    },
  }
}

export async function createCustomer(db, body, auth) {
  await assertAssignee(db, body.assigned_to)
  const row = await customers.create(db, { ...body, source: 'Manual', created_by: auth.userId })
  return getCustomer(db, row.id)
}

/** `source` is never overwritten: it records how the customer first arrived. */
export async function updateCustomer(db, id, body) {
  await assertAssignee(db, body.assigned_to)
  await customers.update(db, id, body)
  return getCustomer(db, id)
}

function referencedError(err) {
  if (err?.code === '23503') {
    return AppError.conflict('This customer has quotes, samples or orders and cannot be deleted. Mark it inactive instead.')
  }
  return err
}

export async function deleteCustomer(db, id) {
  try {
    await deleteOne(db, 'customers', id, 'Customer')
  } catch (err) {
    throw referencedError(err)
  }
}

export async function deleteCustomers(db, ids) {
  try {
    return await deleteMany(db, 'customers', ids, 'customers')
  } catch (err) {
    throw referencedError(err)
  }
}

// -----------------------------------------------------------------------------
// Contact messages
// -----------------------------------------------------------------------------
export async function listContacts(db, q) {
  let status = q.status
  if (status?.includes('new') && !status.includes('unread')) status = [...status, 'unread']
  const result = await runList(
    db.from('contact_messages').select('*, assigned:profiles(id, full_name)', { count: 'exact' }),
    {
      ...q,
      eq: { status },
      searchColumns: ['name', 'email', 'company', 'subject', 'message', 'country'],
      range: { column: 'created_at', from: q.from, to: q.to },
    },
    'Loading messages'
  )
  // Legacy rows used "unread"; present one vocabulary to the UI.
  for (const r of result.rows) if (r.status === 'unread') r.status = 'new'
  return result
}

export async function getContact(db, id) {
  const row = await getById(db, 'contact_messages', id, '*, assigned:profiles(id, full_name)', 'Message')
  if (row.status === 'unread') row.status = 'new'
  return row
}

export async function updateContact(db, id, body) {
  await assertAssignee(db, body.assigned_to)
  await updateOne(db, 'contact_messages', id, body, 'id', 'Message')
  return getContact(db, id)
}

export const deleteContact = (db, id) => deleteOne(db, 'contact_messages', id, 'Message')

// -----------------------------------------------------------------------------
// Newsletter subscribers
// -----------------------------------------------------------------------------
export function listSubscribers(db, q) {
  return runList(
    db.from('newsletter_subscribers').select('*', { count: 'exact' }),
    { ...q, sort: q.sort ?? '-subscribed_at', eq: { is_active: q.active }, searchColumns: ['email'] },
    'Loading subscribers'
  )
}

export function updateSubscriber(db, id, { is_active }) {
  return updateOne(
    db,
    'newsletter_subscribers',
    id,
    { is_active, unsubscribed_at: is_active ? null : new Date().toISOString() },
    '*',
    'Subscriber'
  )
}

export const deleteSubscriber = (db, id) => deleteOne(db, 'newsletter_subscribers', id, 'Subscriber')
