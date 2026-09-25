import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createAuthenticate, authorize, requireRoles } from '../../src/middleware/auth.js'
import { AppError } from '../../src/utils/AppError.js'

const fakeReq = (authorization) => ({
  get: (h) => (h.toLowerCase() === 'authorization' ? authorization : undefined),
})

const USER_ID = '11111111-1111-4111-8111-111111111111'

function makeAuth(profile) {
  return createAuthenticate({
    verifyToken: async (token) => {
      if (token !== 'good') throw new AppError(401, 'Invalid authentication token.')
      return { userId: USER_ID, email: 'a@b.c' }
    },
    makeClient: (token) => ({ token }),
    loadProfile: async (_db, id) => (profile ? { id, ...profile } : null),
  })
}

test('missing bearer token -> 401', async () => {
  await assert.rejects(makeAuth({ role: 'sales' })(fakeReq(undefined), {}, () => {}), { status: 401 })
  await assert.rejects(makeAuth({ role: 'sales' })(fakeReq('Basic abc'), {}, () => {}), { status: 401 })
})

test('invalid token -> 401', async () => {
  await assert.rejects(makeAuth({ role: 'sales' })(fakeReq('Bearer bad'), {}, () => {}), { status: 401 })
})

test('no profile -> 403', async () => {
  await assert.rejects(makeAuth(null)(fakeReq('Bearer good'), {}, () => {}), { status: 403 })
})

test('inactive profile -> 403 ACCOUNT_INACTIVE', async () => {
  await assert.rejects(
    makeAuth({ role: 'sales', is_active: false })(fakeReq('Bearer good'), {}, () => {}),
    { status: 403, code: 'ACCOUNT_INACTIVE' }
  )
})

test('public "user" role -> 403 NOT_EMPLOYEE', async () => {
  await assert.rejects(
    makeAuth({ role: 'user', is_active: true })(fakeReq('Bearer good'), {}, () => {}),
    { status: 403, code: 'NOT_EMPLOYEE' }
  )
})

test('active employee populates req.auth with profiles.id as identity', async () => {
  const req = fakeReq('Bearer good')
  let called = false
  await makeAuth({ role: 'sales', is_active: true })(req, {}, () => {
    called = true
  })
  assert.ok(called)
  assert.equal(req.auth.userId, USER_ID)
  assert.equal(req.auth.profile.id, USER_ID)
  assert.equal(req.auth.role, 'sales')
  assert.deepEqual(req.auth.db, { token: 'good' })
})

test('authorize enforces module + delete rules', () => {
  const next = () => {}
  assert.doesNotThrow(() => authorize('orders', 'update')({ auth: { role: 'sales' } }, {}, next))
  assert.throws(() => authorize('orders', 'delete')({ auth: { role: 'sales' } }, {}, next), { status: 403 })
  assert.throws(() => authorize('shipments')({ auth: { role: 'sales' } }, {}, next), { status: 403 })
  assert.throws(() => authorize('orders')({}, {}, next), { status: 401 })
})

test('requireRoles normalises department synonyms', () => {
  const next = () => {}
  assert.doesNotThrow(() => requireRoles('quality_officer')({ auth: { role: 'quality' } }, {}, next))
  assert.throws(() => requireRoles('sales')({ auth: { role: 'export_manager' } }, {}, next), { status: 403 })
})
