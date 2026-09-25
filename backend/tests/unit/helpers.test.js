import { test } from 'node:test'
import assert from 'node:assert/strict'
import { fromDbError } from '../../src/utils/dbError.js'
import { sanitizeSearch, compact } from '../../src/lib/query.js'
import { fileExtension, safeFileName } from '../../src/middleware/upload.js'
import { canAttach } from '../../src/services/documents.service.js'
import { slugify } from '../../src/services/catalog.service.js'
import { canAccessModule, modulesForRole } from '../../src/config/permissions.js'
import { collectionUpdate, lotCreate } from '../../src/validators/sourcing.validators.js'
import { orderUpdate, sampleStatusBody } from '../../src/validators/sales.validators.js'
import { shipmentCreate, batchCreate } from '../../src/validators/export.validators.js'
import { contactMessageBody, quoteRequestBody } from '../../src/validators/public.validators.js'
import { createUserBody } from '../../src/validators/users.validators.js'

// --- database error mapping ----------------------------------------------------
test('workflow SQLSTATEs map to user-facing HTTP errors', () => {
  assert.deepEqual(
    [fromDbError({ code: 'P0400', message: 'a' }).status, fromDbError({ code: 'P0403', message: 'b' }).status,
     fromDbError({ code: 'P0404', message: 'c' }).status, fromDbError({ code: 'P0409', message: 'd' }).status,
     fromDbError({ code: 'P0429', message: 'e' }).status],
    [400, 403, 404, 409, 429]
  )
  const e = fromDbError({ code: 'P0409', message: 'Only 500 kg of lot LOT-2026-0001 is in stock.' })
  assert.equal(e.message, 'Only 500 kg of lot LOT-2026-0001 is in stock.')
  assert.equal(e.code, 'CONFLICT')
})

test('missing schema objects report SCHEMA_OUTDATED instead of a generic 500', () => {
  for (const code of ['PGRST202', 'PGRST205', 'PGRST204', '42P01', '42703']) {
    const e = fromDbError({ code, message: 'relation "public.x" does not exist' })
    assert.equal(e.status, 503)
    assert.equal(e.code, 'SCHEMA_OUTDATED')
    assert.match(e.message, /migrations/)
  }
})

// --- query helpers -----------------------------------------------------------------
test('search terms cannot inject PostgREST filter syntax', () => {
  assert.equal(sanitizeSearch('guji),status.eq.draft,(x'), 'guji status.eq.draft x')
  assert.equal(sanitizeSearch('a*b%c"d\'e:f'), 'a b c d e f')
  assert.equal(sanitizeSearch(undefined), '')
  assert.equal(sanitizeSearch('x'.repeat(300)).length, 100)
})

test('compact drops undefined but keeps null (clearing a column)', () => {
  assert.deepEqual(compact({ a: 1, b: undefined, c: null }), { a: 1, c: null })
})

// --- uploads -----------------------------------------------------------------------
test('file names are sanitised for storage paths', () => {
  assert.equal(fileExtension('Invoice.PDF'), 'pdf')
  assert.equal(safeFileName('../../etc/passwd'), 'passwd')
  assert.equal(safeFileName('Commercial invoice (final).pdf'), 'Commercial-invoice-final.pdf')
  assert.ok(!safeFileName('a/b\\c.pdf').includes('/'))
})

// --- permissions -----------------------------------------------------------------------
test('every department has a (role-filtered) dashboard; public users have none', () => {
  for (const role of ['admin', 'sales', 'export_manager', 'procurement', 'quality', 'warehouse']) {
    assert.ok(canAccessModule(role, 'dashboard'), role)
  }
  assert.ok(!modulesForRole('user').includes('dashboard'))
})

test('document attachment rules follow departments', () => {
  assert.ok(canAttach('export_manager', 'shipment'))
  assert.ok(canAttach('sales', 'quote_request'))
  assert.ok(!canAttach('sales', 'shipment'))
  assert.ok(canAttach('quality', 'coffee_lot'))
  assert.ok(!canAttach('quality', 'sales_order'))
  assert.ok(!canAttach('sales', 'general'))
  assert.ok(canAttach('admin', 'general'))
})

test('slugify produces URL-safe slugs', () => {
  assert.equal(slugify('Yirgacheffe G1 — Washed!'), 'yirgacheffe-g1-washed')
  assert.equal(slugify('Café Limu'), 'cafe-limu')
})

// --- validators ---------------------------------------------------------------------------
test('PATCH schemas never inject defaults for omitted fields', () => {
  const parsed = collectionUpdate.parse({ notes: 'moisture ok' })
  assert.deepEqual(parsed, { notes: 'moisture ok' })
  assert.deepEqual(orderUpdate.parse({ customer_notes: 'x' }), { customer_notes: 'x' })
})

test('quantities must be positive and bodies strict', () => {
  assert.throws(() => lotCreate.parse({ collection_id: crypto.randomUUID(), quantity_kg: 0 }))
  assert.throws(() => lotCreate.parse({ collection_id: crypto.randomUUID(), quantity_kg: 5, status: 'approved' }), /Unrecognized/)
  assert.throws(() => batchCreate.parse({
    sales_order_id: crypto.randomUUID(),
    allocations: [
      { lot_id: '11111111-1111-4111-8111-111111111111', warehouse_id: '22222222-2222-4222-8222-222222222222', quantity_kg: 1 },
      { lot_id: '11111111-1111-4111-8111-111111111111', warehouse_id: '22222222-2222-4222-8222-222222222222', quantity_kg: 2 },
    ],
  }), /only be allocated once/)
})

test('shipment dates and container numbers are validated', () => {
  const batch = crypto.randomUUID()
  assert.throws(() => shipmentCreate.parse({ export_batch_id: batch, shipping_date: '2026-10-10', estimated_arrival: '2026-10-01' }))
  assert.throws(() => shipmentCreate.parse({ export_batch_id: batch, container_number: 'NOT-A-BOX' }))
  assert.equal(shipmentCreate.parse({ export_batch_id: batch, container_number: 'mscu1234567' }).container_number, 'MSCU1234567')
})

test('public forms validate email / required fields and join first + last name', () => {
  assert.throws(() => quoteRequestBody.parse({ full_name: 'A', company: 'B', email: 'x', country: 'DE' }))
  const c = contactMessageBody.parse({ first_name: 'Lena', last_name: 'Buyer', email: 'LENA@Roastery.test', message: 'Hello there, please call.' })
  assert.equal(c.name, 'Lena Buyer')
  assert.equal(c.email, 'lena@roastery.test')
})

test('employee passwords need letters and digits; roles are employee roles only', () => {
  const base = { email: 'a@b.co', full_name: 'Abe Bekele', role: 'sales' }
  assert.throws(() => createUserBody.parse({ ...base, password: 'onlyletters' }))
  assert.throws(() => createUserBody.parse({ ...base, password: 'Passw0rd!', role: 'user' }))
  assert.equal(createUserBody.parse({ ...base, password: 'Passw0rd!' }).role, 'sales')
})

test('sample dispatch payload accepts courier and tracking number', () => {
  const s = sampleStatusBody.parse({ status: 'dispatched', courier: 'DHL', tracking_number: '123' })
  assert.equal(s.courier, 'DHL')
})
