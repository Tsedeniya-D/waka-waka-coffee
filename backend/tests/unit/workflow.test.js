import { test } from 'node:test'
import assert from 'node:assert/strict'
import { _setTransitionsForTest, assertTransition, describeTransitions, nextStatuses } from '../../src/services/workflow.service.js'

const rules = [
  { entity: 'sales_order', from_status: 'draft', to_status: 'sent_to_export', roles: ['sales'], is_manual: true, label: 'Send to Export' },
  { entity: 'sales_order', from_status: 'sent_to_export', to_status: 'export_accepted', roles: ['export_manager'], is_manual: true, label: 'Accept order' },
  { entity: 'sales_order', from_status: 'export_accepted', to_status: 'processing', roles: ['export_manager'], is_manual: false, label: 'Batch created' },
  { entity: 'shipment', from_status: 'preparing', to_status: 'booked', roles: ['export_manager'], is_manual: true, label: 'Booked' },
]
_setTransitionsForTest(rules)
const db = {} // not used while the cache is warm

test('allowed transition passes for the owning department', async () => {
  await assert.doesNotReject(assertTransition(db, 'sales', 'sales_order', 'draft', 'sent_to_export'))
  await assert.doesNotReject(assertTransition(db, 'export_manager', 'sales_order', 'sent_to_export', 'export_accepted'))
})

test('admins may perform any manual transition', async () => {
  await assert.doesNotReject(assertTransition(db, 'admin', 'sales_order', 'sent_to_export', 'export_accepted'))
})

test('undefined jump -> 409 INVALID_TRANSITION with allowed options', async () => {
  await assert.rejects(assertTransition(db, 'sales', 'sales_order', 'draft', 'shipped'), (err) => {
    assert.equal(err.status, 409)
    assert.equal(err.code, 'INVALID_TRANSITION')
    assert.deepEqual(err.details.allowed, ['sent_to_export'])
    return true
  })
})

test('system-only transition cannot be chosen manually', async () => {
  await assert.rejects(assertTransition(db, 'admin', 'sales_order', 'export_accepted', 'processing'), { status: 409 })
})

test('wrong department -> 403', async () => {
  await assert.rejects(assertTransition(db, 'sales', 'sales_order', 'sent_to_export', 'export_accepted'), { status: 403 })
})

test('same status is a no-op', async () => {
  await assert.doesNotReject(assertTransition(db, 'sales', 'sales_order', 'draft', 'draft'))
})

test('nextStatuses / describeTransitions only expose manual moves for the role', async () => {
  assert.deepEqual((await nextStatuses(db, 'sales', 'sales_order', 'draft')).map((r) => r.to_status), ['sent_to_export'])
  assert.deepEqual(await nextStatuses(db, 'sales', 'sales_order', 'sent_to_export'), [])
  const described = await describeTransitions(db, 'export_manager')
  assert.ok(described.sales_order.every((t) => t.to_status !== 'processing'))
  assert.equal(described.sales_order.find((t) => t.to_status === 'export_accepted').allowed, true)
  assert.equal(described.sales_order.find((t) => t.to_status === 'sent_to_export').allowed, false)
})
