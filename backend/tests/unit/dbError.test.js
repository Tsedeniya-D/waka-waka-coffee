import { test } from 'node:test'
import assert from 'node:assert/strict'
import { fromDbError, unwrap } from '../../src/utils/dbError.js'
import { AppError } from '../../src/utils/AppError.js'

test('unique violation -> 409 and keeps the Postgres code', () => {
  const e = fromDbError({ code: '23505', message: 'duplicate key' }, 'Creating inventory')
  assert.equal(e.status, 409)
  assert.equal(e.code, '23505')
  assert.match(e.message, /^Creating inventory: /)
})

test('RLS / privilege error -> 403', () => {
  assert.equal(fromDbError({ code: '42501', message: 'new row violates row-level security' }).status, 403)
})

test('RAISE EXCEPTION message is passed through as 400', () => {
  const e = fromDbError({ code: 'P0001', message: 'Sales order not found' })
  assert.equal(e.status, 400)
  assert.equal(e.message, 'Sales order not found')
})

test('.single() with no rows -> 404', () => {
  assert.equal(fromDbError({ code: 'PGRST116', message: 'x' }).status, 404)
})

test('unknown codes become 500 without leaking raw text in message', () => {
  const e = fromDbError({ code: 'XX000', message: 'internal detail' })
  assert.equal(e.status, 500)
  assert.ok(!e.message.includes('internal detail'))
})

test('unwrap returns data or throws AppError', () => {
  assert.deepEqual(unwrap({ data: [1], error: null }), [1])
  assert.throws(() => unwrap({ data: null, error: { code: '23503', message: 'fk' } }), AppError)
})
