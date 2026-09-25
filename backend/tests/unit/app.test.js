import { test } from 'node:test'
import assert from 'node:assert/strict'
import request from 'supertest'
import { createApp } from '../../src/app.js'

const app = createApp()

test('GET /api/v1/health -> 200', async () => {
  const res = await request(app).get('/api/v1/health')
  assert.equal(res.status, 200)
  assert.equal(res.body.data.status, 'ok')
  assert.ok(res.headers['x-request-id'])
})

test('unknown route -> 404 JSON error envelope', async () => {
  const res = await request(app).get('/api/v1/nope')
  assert.equal(res.status, 404)
  assert.equal(res.body.error.code, 'NOT_FOUND')
  assert.ok(res.body.error.request_id)
})

test('malformed JSON -> 400 INVALID_JSON', async () => {
  const res = await request(app)
    .post('/api/v1/auth/login')
    .set('Content-Type', 'application/json')
    .send('{"email":')
  assert.equal(res.status, 400)
  assert.equal(res.body.error.code, 'INVALID_JSON')
})

test('login validation -> 400 with field details', async () => {
  const res = await request(app).post('/api/v1/auth/login').send({ email: 'not-an-email' })
  assert.equal(res.status, 400)
  assert.equal(res.body.error.code, 'VALIDATION_ERROR')
  const paths = res.body.error.details.map((d) => d.path)
  assert.ok(paths.includes('email'))
  assert.ok(paths.includes('password'))
})

test('protected route without token -> 401', async () => {
  const res = await request(app).get('/api/v1/auth/me')
  assert.equal(res.status, 401)
})

test('protected route with malformed token -> 401 INVALID_TOKEN', async () => {
  const res = await request(app).get('/api/v1/auth/me').set('Authorization', 'Bearer not.a.jwt')
  assert.equal(res.status, 401)
  assert.equal(res.body.error.code, 'INVALID_TOKEN')
})

test('CORS: disallowed origin is rejected, allowed origin gets header', async () => {
  const bad = await request(app).get('/api/v1/health').set('Origin', 'https://evil.example')
  assert.equal(bad.status, 403)
  const good = await request(app).get('/api/v1/health').set('Origin', 'http://localhost:5173')
  assert.equal(good.status, 200)
  assert.equal(good.headers['access-control-allow-origin'], 'http://localhost:5173')
})
