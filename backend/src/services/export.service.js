import { attachProfiles } from '../lib/profiles.js'
import { compact, deleteOne, getById, insertOne, rpc, runList, sanitizeSearch, updateOne } from '../lib/query.js'
import { unwrap } from '../utils/dbError.js'
import { AppError } from '../utils/AppError.js'
import { assertTransition, nextStatuses } from './workflow.service.js'

// =============================================================================
// Export batches
// =============================================================================
const BATCH_SELECT =
  '*, sales_order:sales_orders(id, order_number, product_name, quantity_kg, destination_country, destination_port, status, ' +
  'customer:customers(id, company_name, customer_code)), ' +
  'lots:export_batch_lots(id, lot_id, warehouse_id, quantity_kg, released_at, ' +
  'lot:coffee_lots(id, lot_code, origin, grade, processing_method, status), warehouse:warehouses(id, code, name)), ' +
  'shipments(id, shipment_number, status)'

export async function listBatches(db, q) {
  const result = await runList(
    db.from('export_batches').select(BATCH_SELECT, { count: 'exact' }),
    {
      ...q,
      eq: { status: q.status, sales_order_id: q.sales_order_id },
      searchColumns: ['batch_number', 'notes', 'destination_country', 'destination_port'],
      range: { column: 'created_at', from: q.from, to: q.to },
    },
    'Loading export batches'
  )
  await attachProfiles(db, result.rows, [['export_manager_id', 'export_manager']])
  return result
}

export async function getBatch(db, id, role) {
  const batch = await getById(db, 'export_batches', id, BATCH_SELECT, 'Export batch')
  await attachProfiles(db, batch, [['export_manager_id', 'export_manager']])
  const documents = unwrap(
    await db
      .from('documents')
      .select('id, title, document_type, file_name, file_url, created_at')
      .eq('related_type', 'export_batch')
      .eq('related_id', id)
      .order('created_at', { ascending: false }),
    'Loading documents'
  )
  return {
    ...batch,
    documents,
    next_statuses: role ? (await nextStatuses(db, role, 'export_batch', batch.status)).map((t) => t.to_status) : undefined,
  }
}

/** Orders accepted by Export with how much is still unallocated. */
export async function eligibleOrders(db) {
  const orders = unwrap(
    await db
      .from('sales_orders')
      .select('id, order_number, product_name, origin, grade, processing_method, quantity_kg, destination_country, destination_port, status, requested_ship_date, customer:customers(id, company_name, customer_code)')
      .in('status', ['export_accepted', 'processing'])
      .order('created_at', { ascending: true }),
    'Loading accepted orders'
  )
  if (!orders.length) return []
  const batches = unwrap(
    await db
      .from('export_batches')
      .select('sales_order_id, total_quantity_kg')
      .in('sales_order_id', orders.map((o) => o.id))
      .neq('status', 'cancelled'),
    'Loading batches'
  )
  const allocated = new Map()
  for (const b of batches) allocated.set(b.sales_order_id, (allocated.get(b.sales_order_id) ?? 0) + Number(b.total_quantity_kg))
  return orders
    .map((o) => ({ ...o, allocated_kg: allocated.get(o.id) ?? 0, remaining_kg: Number(o.quantity_kg) - (allocated.get(o.id) ?? 0) }))
    .filter((o) => o.remaining_kg > 0)
}

/**
 * Stock that can be allocated: quality-approved lots with quantity on hand,
 * per warehouse, with their latest quality decision.
 */
export async function availableStock(db, { origin, grade, search } = {}) {
  let q = db
    .from('inventory')
    .select('id, lot_id, warehouse_id, quantity_kg, bag_count, lot:coffee_lots!inner(id, lot_code, origin, grade, processing_method, status), warehouse:warehouses(id, code, name, location)')
    .gt('quantity_kg', 0)
    .in('lot.status', ['in_warehouse', 'reserved'])
  if (origin) q = q.ilike('lot.origin', `%${sanitizeSearch(origin)}%`)
  if (grade) q = q.ilike('lot.grade', `%${sanitizeSearch(grade)}%`)
  const term = sanitizeSearch(search)
  if (term) q = q.or(`lot_code.ilike.*${term}*,origin.ilike.*${term}*`, { referencedTable: 'lot' })
  const rows = unwrap(await q.order('quantity_kg', { ascending: false }), 'Loading available stock')
  if (!rows.length) return []

  const inspections = unwrap(
    await db
      .from('quality_inspections')
      .select('lot_id, approval_status, final_grade, cup_score, approved_at, created_at')
      .in('lot_id', [...new Set(rows.map((r) => r.lot_id))])
      .neq('approval_status', 'pending')
      .order('approved_at', { ascending: false, nullsFirst: false }),
    'Loading quality decisions'
  )
  const latest = new Map()
  for (const i of inspections) if (!latest.has(i.lot_id)) latest.set(i.lot_id, i)
  return rows.map((r) => ({
    ...r,
    quality: latest.get(r.lot_id) ?? null,
    exportable: latest.get(r.lot_id)?.approval_status === 'approved',
  }))
}

export async function createBatch(db, auth, body) {
  const batch = await rpc(
    db,
    'create_export_batch',
    { p_sales_order_id: body.sales_order_id, p_allocations: body.allocations, p_notes: body.notes ?? null },
    'Creating export batch'
  )
  return getBatch(db, batch.id, auth.role)
}

export async function updateBatch(db, auth, id, body) {
  await updateOne(db, 'export_batches', id, body, 'id', 'Export batch')
  return getBatch(db, id, auth.role)
}

/** Manual transitions (ready/approved) and cancellation (which releases stock). */
export async function setBatchStatus(db, auth, id, { status, reason }) {
  const batch = await getById(db, 'export_batches', id, 'id, status', 'Export batch')
  if (status !== 'cancelled') await assertTransition(db, auth.role, 'export_batch', batch.status, status)
  else if (!['preparing', 'ready', 'approved'].includes(batch.status)) {
    throw AppError.conflict(`A ${batch.status} batch cannot be cancelled.`)
  }
  await rpc(db, 'set_export_batch_status', { p_batch_id: id, p_status: status, p_reason: reason ?? null }, 'Updating batch')
  return getBatch(db, id, auth.role)
}

// =============================================================================
// Shipments
// =============================================================================
const SHIPMENT_SELECT =
  '*, export_batch:export_batches(id, batch_number, total_quantity_kg, status, ' +
  'sales_order:sales_orders(id, order_number, product_name, sales_person_id, customer:customers(id, company_name, country)))'

export async function listShipments(db, q) {
  const result = await runList(
    db.from('shipments').select(SHIPMENT_SELECT, { count: 'exact' }),
    {
      ...q,
      eq: { status: q.status, export_batch_id: q.export_batch_id },
      searchColumns: ['shipment_number', 'container_number', 'vessel_name', 'booking_reference', 'bill_of_lading_number', 'destination_country', 'destination_port', 'carrier'],
      range: { column: 'created_at', from: q.from, to: q.to },
    },
    'Loading shipments'
  )
  await attachProfiles(db, result.rows, [['export_manager_id', 'export_manager']])
  return result
}

export async function getShipment(db, id, role) {
  const shipment = await getById(db, 'shipments', id, SHIPMENT_SELECT, 'Shipment')
  const [updates, documents] = await Promise.all([
    db.from('shipment_updates').select('*').eq('shipment_id', id).order('event_time', { ascending: false }),
    db
      .from('documents')
      .select('id, title, document_type, file_name, file_url, mime_type, file_size, is_public, uploaded_by, created_at')
      .eq('related_type', 'shipment')
      .eq('related_id', id)
      .order('created_at', { ascending: false }),
  ])
  const updateRows = unwrap(updates, 'Loading shipment updates')
  const documentRows = unwrap(documents, 'Loading documents')
  await attachProfiles(db, shipment, [['export_manager_id', 'export_manager']])
  await attachProfiles(db, updateRows, [['created_by', 'author']])
  await attachProfiles(db, documentRows, [['uploaded_by', 'uploader']])
  return {
    ...shipment,
    updates: updateRows,
    documents: documentRows,
    next_statuses: role ? (await nextStatuses(db, role, 'shipment', shipment.status)).map((t) => t.to_status) : undefined,
  }
}

/** Ready/approved batches without an active shipment. */
export async function eligibleBatches(db) {
  const batches = unwrap(
    await db
      .from('export_batches')
      .select('id, batch_number, total_quantity_kg, status, destination_country, destination_port, sales_order:sales_orders(id, order_number, product_name, customer:customers(id, company_name)), shipments(id, status)')
      .in('status', ['ready', 'approved'])
      .order('created_at'),
    'Loading batches'
  )
  return batches
    .filter((b) => !(b.shipments ?? []).some((s) => s.status !== 'cancelled'))
    .map(({ shipments: _s, ...b }) => b)
}

export async function createShipment(db, auth, body) {
  const row = await insertOne(db, 'shipments', compact(body), 'id', 'shipment')
  return getShipment(db, row.id, auth.role)
}

export async function updateShipment(db, auth, id, body) {
  const current = await getById(db, 'shipments', id, 'id, status', 'Shipment')
  if (['completed', 'cancelled'].includes(current.status) && Object.keys(body).some((k) => k !== 'notes')) {
    throw AppError.conflict(`This shipment is ${current.status}; only notes can change.`)
  }
  await updateOne(db, 'shipments', id, compact(body), 'id', 'Shipment')
  return getShipment(db, id, auth.role)
}

/**
 * Status changes propagate in the database: departure marks the batch and
 * order shipped, completion completes them, and every change is logged as a
 * tracking event and notified to Sales.
 */
export async function setShipmentStatus(db, auth, id, { status, location, note }) {
  const current = await getById(db, 'shipments', id, 'id, status, vessel_name, container_number', 'Shipment')
  await assertTransition(db, auth.role, 'shipment', current.status, status)
  if (status === 'in_transit' && !current.vessel_name && !current.container_number) {
    throw AppError.badRequest('Record the vessel or container number before marking the shipment as departed.')
  }
  await updateOne(db, 'shipments', id, { status }, 'id', 'Shipment')
  // The database already logs the status change itself; a note or location
  // becomes an additional tracking event.
  if (note || location) {
    await addUpdate(db, auth, id, { description: note ?? `Reported at ${location}`, location })
  }
  return getShipment(db, id, auth.role)
}

export async function addUpdate(db, auth, id, { description, location, event_time }) {
  const shipment = await getById(db, 'shipments', id, 'id, status', 'Shipment')
  await insertOne(
    db,
    'shipment_updates',
    compact({ shipment_id: id, status: shipment.status, description, location, event_time, created_by: auth.userId }),
    'id',
    'shipment update'
  )
  return getShipment(db, id, auth.role)
}

export async function removeShipment(db, id) {
  const shipment = await getById(db, 'shipments', id, 'id, status', 'Shipment')
  if (!['preparing', 'cancelled'].includes(shipment.status)) {
    throw AppError.conflict('Only shipments that are still preparing (or cancelled) can be deleted.')
  }
  return deleteOne(db, 'shipments', id, 'Shipment')
}
