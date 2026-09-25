/**
 * End-to-end business workflow through the real API, database triggers and
 * RLS. Opt-in because it creates data:
 *
 *   RUN_E2E=1 TEST_ADMIN_EMAIL=... TEST_ADMIN_PASSWORD=... npm run test:e2e
 *
 * Requires the 20260925* migrations to be applied. Employees created here are
 * deactivated at the end.
 */
import { test, describe, before, after } from 'node:test'
import assert from 'node:assert/strict'
import request from 'supertest'
import { createApp } from '../../src/app.js'
import { env } from '../../src/config/env.js'

const adminEmail = process.env.TEST_ADMIN_EMAIL
const adminPassword = process.env.TEST_ADMIN_PASSWORD
const skip =
  process.env.RUN_E2E !== '1' || !adminEmail || !adminPassword
    ? 'set RUN_E2E=1, TEST_ADMIN_EMAIL and TEST_ADMIN_PASSWORD to run'
    : false

const app = createApp()
const api = '/api/v1'
const stamp = Date.now().toString(36)
const PASSWORD = 'Waka#e2e2026'
const tokens = {}
const users = {}
const ctx = {}

const as = (who) => ({ Authorization: `Bearer ${tokens[who]}` })
const get = (who, path) => request(app).get(api + path).set(as(who))
const post = (who, path, body) => request(app).post(api + path).set(as(who)).send(body)
const patch = (who, path, body) => request(app).patch(api + path).set(as(who)).send(body)

function ok(res, status = 200) {
  assert.equal(res.status, status, `${res.req?.method} ${res.req?.path} -> ${res.status} ${JSON.stringify(res.body)}`)
  return res.body.data
}

async function login(email, password = PASSWORD) {
  return request(app).post(`${api}/auth/login`).send({ email, password })
}

describe('Waka Coffee end-to-end workflow', { skip }, () => {
  before(async () => {
    const res = await login(adminEmail, adminPassword)
    tokens.admin = ok(res).session.access_token

    for (const role of ['sales', 'export_manager', 'procurement', 'quality', 'warehouse_officer']) {
      const email = `e2e.${role}.${stamp}@waka.test`
      const created = ok(
        await post('admin', '/users', { email, password: PASSWORD, full_name: `E2E ${role}`, role }),
        201
      )
      users[role] = created
      tokens[role] = ok(await login(email)).session.access_token
    }
  })

  after(async () => {
    if (!tokens.admin) return
    for (const u of Object.values(users)) {
      await patch('admin', `/users/${u.id}/status`, { is_active: false })
    }
  })

  // ---------------------------------------------------------------- auth
  test('invalid login is rejected without revealing which part was wrong', async () => {
    const res = await login(adminEmail, 'definitely-wrong-1')
    assert.equal(res.status, 401)
    assert.equal(res.body.error.code, 'INVALID_CREDENTIALS')
  })

  test('each employee gets their own role permissions and a dashboard', async () => {
    const me = ok(await get('sales', '/auth/me'))
    assert.equal(me.profile.role, 'sales')
    assert.ok(me.permissions.modules.includes('quote_requests'))
    assert.ok(!me.permissions.modules.includes('shipments'))
    const dash = ok(await get('sales', '/dashboard'))
    assert.ok(dash.summary.quotes, 'sales dashboard shows quotes')
    assert.equal(dash.summary.field, undefined, 'sales dashboard hides field data')
    const whDash = ok(await get('warehouse_officer', '/dashboard'))
    assert.ok(whDash.summary.inventory)
    assert.equal(whDash.summary.quotes, undefined)
  })

  test('admin changes an employee role; non-admins cannot', async () => {
    const res = await patch('sales', `/users/${users.quality.id}/role`, { role: 'admin' })
    assert.equal(res.status, 403)
    const changed = ok(await patch('admin', `/users/${users.quality.id}/role`, { role: 'quality_officer' }))
    assert.equal(changed.role, 'quality_officer')
    tokens.quality = ok(await login(users.quality.email)).session.access_token
  })

  // ---------------------------------------------------------------- public website
  test('public forms create records that appear inside the system', async () => {
    const contact = await request(app).post(`${api}/public/contact-messages`).send({
      first_name: 'Lena',
      last_name: 'Buyer',
      email: `lena.${stamp}@roastery.test`,
      message: 'Please send your current Guji offer list.',
    })
    ok(contact, 201)

    const news = ok(await request(app).post(`${api}/public/newsletter`).send({ email: `news.${stamp}@roastery.test` }), 201)
    assert.equal(news.status, 'subscribed')

    const quote = ok(
      await request(app).post(`${api}/public/quote-requests`).send({
        full_name: 'Lena Buyer',
        company: `Roastery ${stamp} GmbH`,
        email: `lena.${stamp}@roastery.test`,
        country: 'Germany',
        destination_port: 'Hamburg',
        product_name: 'Guji Natural G1',
        region_name: 'Guji',
        grade: 'G1',
        processing: 'Natural',
        quantity_kg: 6000,
        certifications: ['Organic'],
        message: 'FOB Djibouti please',
      }),
      201
    )
    assert.match(quote.reference_number, /^WAKA-RFQ-\d{4}-\d{4,}$/)
    ctx.quoteRef = quote.reference_number

    const sample = ok(
      await request(app).post(`${api}/public/sample-requests`).send({
        full_name: 'Lena Buyer',
        company: `Roastery ${stamp} GmbH`,
        email: `lena.${stamp}@roastery.test`,
        country: 'Germany',
        product_name: 'Guji Natural G1',
        sample_quantity: 0.5,
        shipping_address: 'Speicherstadt 1, 20457 Hamburg, Germany',
      }),
      201
    )
    assert.match(sample.reference_number, /^WAKA-SAMPLE-/)
    assert.equal(sample.is_new_customer, false, 'second request from the same email reuses the customer')

    const bad = await request(app).post(`${api}/public/quote-requests`).send({ full_name: 'X', email: 'nope' })
    assert.equal(bad.status, 400)
    assert.equal(bad.body.error.code, 'VALIDATION_ERROR')
  })

  test('sales sees the quote, sample and message; sample never becomes an order', async () => {
    const quotes = ok(await get('sales', `/quote-requests?search=${ctx.quoteRef}`))
    assert.equal(quotes.length, 1)
    ctx.quote = quotes[0]
    assert.ok(ctx.quote.customer_id, 'quote linked to a customer')

    const samples = await get('sales', `/sample-requests?search=${stamp}`)
    ctx.sample = ok(samples)[0]
    assert.ok(ctx.sample)
    const toApproved = ok(await patch('sales', `/sample-requests/${ctx.sample.id}/status`, { status: 'approved' }))
    assert.equal(toApproved.status, 'approved')
    const orders = ok(await get('sales', `/sales-orders?quote_request_id=${ctx.quote.id}`))
    assert.equal(orders.length, 0)

    const msgs = ok(await get('sales', '/contact-messages?search=Guji'))
    assert.ok(msgs.some((m) => m.email === `lena.${stamp}@roastery.test`))
  })

  test('invalid workflow jumps are refused', async () => {
    const res = await patch('sales', `/quote-requests/${ctx.quote.id}/status`, { status: 'converted' })
    assert.equal(res.status, 409)
    const conv = await post('sales', `/quote-requests/${ctx.quote.id}/convert`)
    assert.equal(conv.status, 409)
  })

  test('sales prices the quote, customer accepts, quote converts to a draft order', async () => {
    const detail = ok(await get('sales', `/quote-requests/${ctx.quote.id}`))
    assert.equal(detail.items.length, 1)
    ok(await patch('sales', `/quote-requests/${ctx.quote.id}/items/${detail.items[0].id}`, { unit_price: 7.25 }))
    ok(await patch('sales', `/quote-requests/${ctx.quote.id}`, { incoterm: 'FOB Djibouti', valid_until: '2027-01-31' }))
    ok(await patch('sales', `/quote-requests/${ctx.quote.id}/status`, { status: 'quoted' }))
    ok(await patch('sales', `/quote-requests/${ctx.quote.id}/status`, { status: 'accepted' }))
    const order = ok(await post('sales', `/quote-requests/${ctx.quote.id}/convert`), 201)
    assert.equal(order.status, 'draft')
    assert.equal(Number(order.quantity_kg), 6000)
    assert.equal(Number(order.unit_price), 7.25)
    ctx.order = order
  })

  test('sales sends the order to Export; export manager is notified and accepts; sales is notified', async () => {
    const forbidden = await post('sales', `/sales-orders/${ctx.order.id}/accept`)
    assert.equal(forbidden.status, 403)

    const sent = ok(await post('sales', `/sales-orders/${ctx.order.id}/send-to-export`))
    assert.equal(sent.status, 'sent_to_export')

    const inbox = ok(await get('export_manager', '/notifications?filter=unread'))
    assert.ok(inbox.some((n) => n.type === 'order_sent_to_export' && n.related_id === ctx.order.id), 'export manager notified')

    const locked = await patch('sales', `/sales-orders/${ctx.order.id}`, { quantity_kg: 1 })
    assert.equal(locked.status, 409)

    const accepted = ok(await post('export_manager', `/sales-orders/${ctx.order.id}/accept`))
    assert.equal(accepted.status, 'export_accepted')

    const salesInbox = ok(await get('sales', '/notifications?filter=unread'))
    assert.ok(salesInbox.some((n) => n.type === 'order_export_accepted' && n.related_id === ctx.order.id), 'sales notified')
    const count = ok(await get('sales', '/notifications/unread-count'))
    assert.ok(count.unread >= 1)
  })

  test('field collects coffee and creates a lot within the collected quantity', async () => {
    const supplier = ok(
      await post('procurement', '/suppliers', {
        name: `Guji Union ${stamp}`,
        supplier_type: 'union',
        region: 'Oromia',
        zone: 'Guji',
        woreda: 'Uraga',
        kebele: 'Raro',
      }),
      201
    )
    const farmer = ok(
      await post('procurement', '/farmers', {
        name: `Tadesse ${stamp}`,
        region: 'Oromia',
        zone: 'Guji',
        woreda: 'Uraga',
        kebele: 'Raro',
        supplier_id: supplier.id,
      }),
      201
    )
    const farm = ok(
      await post('procurement', '/farms', {
        farmer_id: farmer.id,
        farm_name: 'Raro Ridge',
        region: 'Oromia',
        zone: 'Guji',
        woreda: 'Uraga',
        kebele: 'Raro',
        altitude_meters: 2150,
      }),
      201
    )
    const collection = ok(
      await post('procurement', '/collections', {
        collection_date: new Date().toISOString().slice(0, 10),
        supplier_id: supplier.id,
        farm_id: farm.id,
        origin: 'Guji',
        region: 'Oromia',
        zone: 'Guji',
        woreda: 'Uraga',
        kebele: 'Raro',
        processing_method: 'natural',
        quantity_kg: 7000,
      }),
      201
    )
    assert.equal(collection.farmer.id, farmer.id, 'farmer derived from farm')
    assert.match(collection.collection_code, /^COL-\d{4}-\d{4,}$/)

    const tooMuch = await post('procurement', '/lots', { collection_id: collection.id, quantity_kg: 9000 })
    assert.equal(tooMuch.status, 409)

    const lot = ok(await post('procurement', '/lots', { collection_id: collection.id, quantity_kg: 6500 }), 201)
    assert.equal(lot.status, 'pending_quality')
    ctx.lot = lot
    ctx.farmer = farmer

    const qualityCannotCreate = await post('quality', '/lots', { collection_id: collection.id, quantity_kg: 1 })
    assert.equal(qualityCannotCreate.status, 403)
  })

  test('quality inspects and approves the lot; field and warehouse are notified', async () => {
    const insp = ok(
      await post('quality', '/quality-inspections', {
        lot_id: ctx.lot.id,
        inspection_date: new Date().toISOString().slice(0, 10),
        moisture: 10.8,
        defect_count: 4,
        cup_score: 88.5,
        final_grade: 'Grade 1',
        result: 'passed',
      }),
      201
    )
    const decided = ok(await post('quality', `/quality-inspections/${insp.id}/decision`, { decision: 'approved' }))
    assert.equal(decided.approval_status, 'approved')
    const lot = ok(await get('quality', `/lots/${ctx.lot.id}`))
    assert.equal(lot.status, 'approved')
    const fieldInbox = ok(await get('procurement', '/notifications'))
    assert.ok(fieldInbox.some((n) => n.type === 'quality_result'))
  })

  test('warehouse receives stock; stock cannot go negative or exceed the lot', async () => {
    const wh = ok(
      await post('warehouse_officer', '/warehouses', { name: `Addis Dry Store ${stamp}`, location: 'Addis Ababa', capacity_kg: 100000 }),
      201
    )
    ctx.warehouse = wh
    const over = await post('warehouse_officer', '/inventory/receive', { lot_id: ctx.lot.id, warehouse_id: wh.id, quantity_kg: 7000 })
    assert.equal(over.status, 409)
    const inv = ok(
      await post('warehouse_officer', '/inventory/receive', {
        lot_id: ctx.lot.id,
        warehouse_id: wh.id,
        quantity_kg: 6500,
        bag_count: 108,
        weight_per_bag_kg: 60,
      }),
      201
    )
    assert.equal(Number(inv.quantity_kg), 6500)
    ctx.inventory = inv
    const neg = await post('warehouse_officer', `/inventory/${inv.id}/adjust`, { delta_kg: -99999, reason: 'test' })
    assert.equal(neg.status, 409)
    const salesCannotMove = await post('sales', `/inventory/${inv.id}/adjust`, { delta_kg: -1, reason: 'nope' })
    assert.equal(salesCannotMove.status, 403)
  })

  test('export manager batches stock for the order and ships it', async () => {
    const stock = ok(await get('export_manager', '/export-batches/available-stock'))
    const line = stock.find((s) => s.lot_id === ctx.lot.id)
    assert.ok(line?.exportable, 'approved lot is exportable')

    const tooMuch = await post('export_manager', '/export-batches', {
      sales_order_id: ctx.order.id,
      allocations: [{ lot_id: ctx.lot.id, warehouse_id: ctx.warehouse.id, quantity_kg: 6600 }],
    })
    assert.equal(tooMuch.status, 409)

    const batch = ok(
      await post('export_manager', '/export-batches', {
        sales_order_id: ctx.order.id,
        allocations: [{ lot_id: ctx.lot.id, warehouse_id: ctx.warehouse.id, quantity_kg: 6000 }],
        notes: 'Container 1',
      }),
      201
    )
    assert.equal(batch.status, 'preparing')
    ctx.batch = batch
    const order = ok(await get('sales', `/sales-orders/${ctx.order.id}`))
    assert.equal(order.status, 'processing')
    const inv = ok(await get('warehouse_officer', `/inventory/${ctx.inventory.id}`))
    assert.equal(Number(inv.quantity_kg), 500, 'allocation deducted from stock')

    const early = await post('export_manager', '/shipments', { export_batch_id: batch.id })
    assert.equal(early.status, 409)
    ok(await patch('export_manager', `/export-batches/${batch.id}/status`, { status: 'ready' }))
    ok(await patch('export_manager', `/export-batches/${batch.id}/status`, { status: 'approved' }))

    const shipment = ok(
      await post('export_manager', '/shipments', {
        export_batch_id: batch.id,
        carrier: 'Maersk',
        vessel_name: 'Maersk Addis',
        container_number: 'MSKU1234565',
        port_of_loading: 'Djibouti',
        shipping_date: '2026-10-01',
        estimated_arrival: '2026-10-28',
      }),
      201
    )
    ctx.shipment = shipment
    assert.equal(shipment.destination_country, 'Germany')
  })

  test('export documents upload to private storage and download via signed link', async () => {
    const pdf = Buffer.from('%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n')
    const res = await request(app)
      .post(`${api}/documents`)
      .set(as('export_manager'))
      .field('title', 'Commercial Invoice')
      .field('document_type', 'commercial_invoice')
      .field('related_type', 'shipment')
      .field('related_id', ctx.shipment.id)
      .attach('file', pdf, { filename: 'invoice.pdf', contentType: 'application/pdf' })
    const doc = ok(res, 201)
    assert.ok(doc.file_path.startsWith(`shipment/${ctx.shipment.id}/`))
    const dl = ok(await get('export_manager', `/documents/${doc.id}/download`))
    assert.match(dl.url, /token=/)

    const fake = await request(app)
      .post(`${api}/documents`)
      .set(as('export_manager'))
      .field('title', 'Fake')
      .field('document_type', 'other')
      .field('related_type', 'shipment')
      .field('related_id', ctx.shipment.id)
      .attach('file', Buffer.from('not a pdf'), { filename: 'fake.pdf', contentType: 'application/pdf' })
    assert.equal(fake.status, 415)

    const salesCannotAttach = await request(app)
      .post(`${api}/documents`)
      .set(as('sales'))
      .field('title', 'x')
      .field('document_type', 'other')
      .field('related_type', 'shipment')
      .field('related_id', ctx.shipment.id)
      .attach('file', pdf, { filename: 'x.pdf', contentType: 'application/pdf' })
    assert.equal(salesCannotAttach.status, 403)

    const salesInbox = ok(await get('sales', '/notifications'))
    assert.ok(salesInbox.some((n) => n.type === 'document_added'))
  })

  test('shipment status drives batch and order to shipped and completed', async () => {
    const jump = await patch('export_manager', `/shipments/${ctx.shipment.id}/status`, { status: 'completed' })
    assert.equal(jump.status, 409)
    ok(await patch('export_manager', `/shipments/${ctx.shipment.id}/status`, { status: 'booked' }))
    ok(await patch('export_manager', `/shipments/${ctx.shipment.id}/status`, { status: 'in_transit', location: 'Djibouti' }))
    let order = ok(await get('sales', `/sales-orders/${ctx.order.id}`))
    assert.equal(order.status, 'shipped')
    ok(await post('export_manager', `/shipments/${ctx.shipment.id}/updates`, { description: 'Transshipped at Jeddah', location: 'Jeddah' }), 201)
    ok(await patch('export_manager', `/shipments/${ctx.shipment.id}/status`, { status: 'arrived' }))
    const done = ok(await patch('export_manager', `/shipments/${ctx.shipment.id}/status`, { status: 'completed' }))
    assert.ok(done.updates.length >= 4, 'tracking history recorded')
    order = ok(await get('sales', `/sales-orders/${ctx.order.id}`))
    assert.equal(order.status, 'completed')
  })

  test('traceability walks from the shipment back to the farmer', async () => {
    const trace = ok(await get('quality', `/traceability/shipments/${ctx.shipment.id}`))
    assert.equal(trace.lots[0].farmer.id, ctx.farmer.id)
    assert.equal(trace.lots[0].farm.farm_name, 'Raro Ridge')
    assert.equal(trace.customer.country, 'Germany')
    const lotTrace = ok(await get('export_manager', `/traceability/lots/${ctx.lot.id}`))
    assert.ok(lotTrace.movements.some((m) => m.transaction_type === 'export_allocation'))
    const salesDenied = await get('sales', `/traceability/lots/${ctx.lot.id}`)
    assert.equal(salesDenied.status, 403)
  })

  test('reports are computed from the database', async () => {
    const report = ok(await get('admin', '/reports/summary'))
    assert.ok(report.orders.count >= 1)
    assert.ok(report.shipments.by_status.completed >= 1)
    const denied = await get('sales', '/reports/summary')
    assert.equal(denied.status, 403)
  })

  test('role restrictions hold for the API and for direct database access', async () => {
    assert.equal((await get('sales', '/shipments')).status, 403)
    assert.equal((await get('warehouse_officer', '/customers')).status, 403)
    assert.equal((await get('procurement', '/sales-orders')).status, 403)
    assert.equal((await request(app).get(`${api}/sales-orders`)).status, 401)
    assert.equal((await request(app).get(`${api}/sales-orders`).set('Authorization', 'Bearer forged.token.value')).status, 401)

    // Bypassing the API with the same token straight against PostgREST.
    const direct = await fetch(`${env.SUPABASE_URL}/rest/v1/sales_orders?id=eq.${ctx.order.id}`, {
      method: 'PATCH',
      headers: {
        apikey: env.SUPABASE_PUBLISHABLE_KEY,
        Authorization: `Bearer ${tokens.sales}`,
        'Content-Type': 'application/json',
        Prefer: 'return=representation',
      },
      body: JSON.stringify({ status: 'draft' }),
    })
    assert.ok(direct.status >= 400, 'direct status rewrite rejected by the database')
    const stock = await fetch(`${env.SUPABASE_URL}/rest/v1/inventory?id=eq.${ctx.inventory.id}`, {
      method: 'PATCH',
      headers: { apikey: env.SUPABASE_PUBLISHABLE_KEY, Authorization: `Bearer ${tokens.warehouse_officer}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ quantity_kg: 999999 }),
    })
    assert.ok(stock.status >= 400, 'direct stock edit rejected by the database')
  })

  test('deactivated employees are locked out immediately', async () => {
    ok(await patch('admin', `/users/${users.warehouse_officer.id}/status`, { is_active: false }))
    const res = await get('warehouse_officer', '/inventory')
    assert.equal(res.status, 403)
    assert.equal(res.body.error.code, 'ACCOUNT_INACTIVE')
    const relog = await login(users.warehouse_officer.email)
    assert.ok([401, 403].includes(relog.status))
  })

  test('refresh then logout revokes the session', async () => {
    const s = ok(await login(users.sales.email)).session
    const refreshed = ok(await request(app).post(`${api}/auth/refresh`).send({ refresh_token: s.refresh_token }))
    const out = await request(app).post(`${api}/auth/logout`).set('Authorization', `Bearer ${refreshed.session.access_token}`)
    assert.equal(out.status, 204)
    const again = await request(app).post(`${api}/auth/refresh`).send({ refresh_token: refreshed.session.refresh_token })
    assert.equal(again.status, 401)
  })
})
