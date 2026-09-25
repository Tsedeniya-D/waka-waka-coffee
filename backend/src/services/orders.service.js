import { attachProfiles } from '../lib/profiles.js'
import { compact, deleteOne, getById, insertOne, rpc, runList, updateOne } from '../lib/query.js'
import { unwrap } from '../utils/dbError.js'
import { AppError } from '../utils/AppError.js'
import { assertAssignee } from './customers.service.js'
import { assertTransition, nextStatuses } from './workflow.service.js'

const SELECT = '*, customer:customers(id, customer_code, company_name, country, destination_port), quote:quote_requests(id, reference_number)'
const EDITABLE = ['draft', 'confirmed']

export async function list(db, q) {
  const result = await runList(
    db.from('sales_orders').select(SELECT, { count: 'exact' }),
    {
      ...q,
      eq: {
        status: q.status,
        customer_id: q.customer_id,
        sales_person_id: q.sales_person_id,
        quote_request_id: q.quote_request_id,
      },
      searchColumns: ['order_number', 'product_name', 'origin', 'destination_country', 'destination_port'],
      range: { column: 'created_at', from: q.from, to: q.to },
    },
    'Loading sales orders'
  )
  await attachProfiles(db, result.rows, [['sales_person_id', 'sales_person'], ['export_accepted_by', 'accepted_by']])
  return result
}

export async function get(db, id, role) {
  const order = await getById(db, 'sales_orders', id, SELECT, 'Sales order')
  const [items, batches, documents] = await Promise.all([
    db.from('sales_order_items').select('*').eq('sales_order_id', id).order('created_at'),
    db
      .from('export_batches')
      .select('id, batch_number, status, total_quantity_kg, created_at, shipments(id, shipment_number, status, estimated_arrival)')
      .eq('sales_order_id', id)
      .order('created_at'),
    db
      .from('documents')
      .select('id, title, document_type, file_name, file_url, created_at')
      .eq('related_type', 'sales_order')
      .eq('related_id', id)
      .order('created_at', { ascending: false }),
  ])
  await attachProfiles(db, order, [['sales_person_id', 'sales_person'], ['export_accepted_by', 'accepted_by']])
  const batchRows = unwrap(batches, 'Loading export batches')
  return {
    ...order,
    items: unwrap(items, 'Loading order items'),
    export_batches: batchRows,
    documents: unwrap(documents, 'Loading documents'),
    allocated_kg: batchRows.filter((b) => b.status !== 'cancelled').reduce((s, b) => s + Number(b.total_quantity_kg), 0),
    next_statuses: role ? (await nextStatuses(db, role, 'sales_order', order.status)).map((t) => t.to_status) : undefined,
  }
}

async function assertActiveCustomer(db, customerId) {
  if (!customerId) return
  const customer = unwrap(
    await db.from('customers').select('id, status').eq('id', customerId).maybeSingle(),
    'Checking customer'
  )
  if (!customer) throw AppError.badRequest('Select an existing customer.')
  if (customer.status !== 'active') throw AppError.conflict('The selected customer is inactive.')
}

export async function create(db, body, auth) {
  await assertActiveCustomer(db, body.customer_id)
  await assertAssignee(db, body.sales_person_id)
  const row = await insertOne(db, 'sales_orders', compact({ ...body, sales_person_id: body.sales_person_id ?? auth.userId }), 'id', 'sales order')
  return get(db, row.id, auth.role)
}

async function assertEditable(db, id) {
  const order = await getById(db, 'sales_orders', id, 'id, status, order_number', 'Sales order')
  if (!EDITABLE.includes(order.status)) {
    throw AppError.conflict(`Order ${order.order_number} can only be edited while it is a draft or confirmed.`)
  }
  return order
}

export async function update(db, id, body, auth) {
  const commercial = Object.keys(body).some((k) => k !== 'customer_notes')
  if (commercial) await assertEditable(db, id)
  await assertActiveCustomer(db, body.customer_id)
  await assertAssignee(db, body.sales_person_id)
  await updateOne(db, 'sales_orders', id, compact(body), 'id', 'Sales order')
  return get(db, id, auth.role)
}

/**
 * Generic status change. Sending to Export and accepting go through the
 * existing database RPCs (which validate and notify); everything else is
 * checked against workflow_transitions here and again by the database.
 */
export async function setStatus(db, auth, id, { status, reason }) {
  if (status === 'sent_to_export') return sendToExport(db, auth, id)
  if (status === 'export_accepted') return acceptOrder(db, auth, id)

  const order = await getById(db, 'sales_orders', id, 'id, status, order_number', 'Sales order')
  await assertTransition(db, auth.role, 'sales_order', order.status, status)
  if (status === 'cancelled') {
    const batches = unwrap(
      await db.from('export_batches').select('id').eq('sales_order_id', id).neq('status', 'cancelled').limit(1),
      'Checking export batches'
    )
    if (batches.length) throw AppError.conflict('Cancel the export batch for this order first.')
  }
  const values = { status }
  if (status === 'cancelled') values.cancellation_reason = reason ?? null
  await updateOne(db, 'sales_orders', id, values, 'id', 'Sales order')
  return get(db, id, auth.role)
}

export async function sendToExport(db, auth, id) {
  await rpc(db, 'send_order_to_export', { p_order_id: id }, 'Sending order to Export')
  return get(db, id, auth.role)
}

export async function acceptOrder(db, auth, id) {
  await rpc(db, 'accept_export_order', { p_order_id: id }, 'Accepting export order')
  return get(db, id, auth.role)
}

// --- items -----------------------------------------------------------------------
export async function addItem(db, auth, id, body) {
  await assertEditable(db, id)
  await insertOne(db, 'sales_order_items', { ...compact(body), sales_order_id: id }, 'id', 'order item')
  return get(db, id, auth.role)
}

export async function updateItem(db, auth, id, itemId, body) {
  await assertEditable(db, id)
  const rows = unwrap(
    await db.from('sales_order_items').update(compact(body)).eq('id', itemId).eq('sales_order_id', id).select('id'),
    'Updating order item'
  )
  if (!rows.length) throw AppError.notFound('Order item not found.')
  return get(db, id, auth.role)
}

export async function removeItem(db, auth, id, itemId) {
  await assertEditable(db, id)
  const rows = unwrap(
    await db.from('sales_order_items').delete().eq('id', itemId).eq('sales_order_id', id).select('id'),
    'Removing order item'
  )
  if (!rows.length) throw AppError.notFound('Order item not found.')
  return get(db, id, auth.role)
}

export async function remove(db, id) {
  const order = await getById(db, 'sales_orders', id, 'id, status', 'Sales order')
  if (!['draft', 'cancelled'].includes(order.status)) {
    throw AppError.conflict('Only draft or cancelled orders can be deleted.')
  }
  return deleteOne(db, 'sales_orders', id, 'Sales order')
}
