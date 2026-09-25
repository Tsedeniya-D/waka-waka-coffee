import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  can,
  canAccessModule,
  canonicalRole,
  isAdminRole,
  isEmployeeRole,
  modulesForRole,
} from '../../src/config/permissions.js'

test('department synonyms normalise to canonical roles', () => {
  assert.equal(canonicalRole('quality'), 'quality_officer')
  assert.equal(canonicalRole('warehouse'), 'warehouse_officer')
  assert.equal(canonicalRole('procurement'), 'field_officer')
  assert.equal(canonicalRole('sales'), 'sales')
  assert.equal(canonicalRole(null), null)
})

test('only admin roles are admins', () => {
  assert.ok(isAdminRole('admin'))
  assert.ok(isAdminRole('super_admin'))
  assert.ok(!isAdminRole('sales'))
  assert.ok(!isAdminRole('export_manager'))
})

test('public "user" role is not an employee', () => {
  assert.ok(!isEmployeeRole('user'))
  assert.ok(!isEmployeeRole(undefined))
  assert.ok(isEmployeeRole('quality'))
})

test('matrix matches frontend MODULE_ACCESS for the sales -> export workflow', () => {
  assert.ok(canAccessModule('sales', 'quote_requests'))
  assert.ok(canAccessModule('sales', 'sample_requests'))
  assert.ok(canAccessModule('sales', 'orders'))
  assert.ok(!canAccessModule('sales', 'export_batches'))
  assert.ok(!canAccessModule('sales', 'shipments'))

  assert.ok(canAccessModule('export_manager', 'orders'))
  assert.ok(canAccessModule('export_manager', 'export_batches'))
  assert.ok(canAccessModule('export_manager', 'reports'))
  assert.ok(!canAccessModule('export_manager', 'quote_requests'))

  assert.ok(canAccessModule('quality', 'quality'))
  assert.ok(canAccessModule('warehouse', 'inventory'))
  assert.ok(canAccessModule('procurement', 'collection'))
  assert.ok(!canAccessModule('user', 'notifications'))
})

test('delete is reserved for admins even with module access', () => {
  assert.ok(can('sales', 'customers', 'update'))
  assert.ok(!can('sales', 'customers', 'delete'))
  assert.ok(can('admin', 'customers', 'delete'))
  assert.ok(!can('sales', 'shipments', 'view'))
})

test('modulesForRole lists every allowed module', () => {
  const adminModules = modulesForRole('admin')
  assert.ok(adminModules.includes('users'))
  assert.ok(adminModules.includes('reports'))
  assert.deepEqual(modulesForRole('user'), [])
})
