/**
 * Live integration tests against the real Supabase project.
 * Skipped unless TEST_ADMIN_EMAIL / TEST_ADMIN_PASSWORD are set in backend/.env.
 */
import { test, describe, before } from 'node:test'
import assert from 'node:assert/strict'
import request from 'supertest'
import { createApp } from '../../src/app.js'

const email = process.env.TEST_ADMIN_EMAIL
const password = process.env.TEST_ADMIN_PASSWORD
const skip = !email || !password ? 'TEST_ADMIN_EMAIL / TEST_ADMIN_PASSWORD not set' : false

describe('auth (live Supabase)', { skip }, () => {
  const app = createApp()
  let session

  before(async () => {
    const res = await request(app).post('/api/v1/auth/login').send({ email, password })
    assert.equal(res.status, 200, JSON.stringify(res.body))
    session = res.body.data.session
  })

  test('login returns session, profile keyed by auth id, and permissions', async () => {
    const res = await request(app).post('/api/v1/auth/login').send({ email, password })
    assert.equal(res.status, 200)
    const { user, profile, permissions } = res.body.data
    assert.equal(profile.id, user.id, 'profiles.id must equal auth user id')
    assert.ok(!('user_id' in profile))
    assert.ok(['admin', 'super_admin'].includes(profile.role))
    assert.equal(permissions.is_admin, true)
    assert.ok(permissions.modules.includes('users'))
  })

  test('wrong password -> 401 INVALID_CREDENTIALS', async () => {
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email, password: `${password}-wrong` })
    assert.equal(res.status, 401)
    assert.equal(res.body.error.code, 'INVALID_CREDENTIALS')
  })

  test('GET /auth/me with token', async () => {
    const res = await request(app)
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${session.access_token}`)
    assert.equal(res.status, 200)
    assert.equal(res.body.data.profile.is_active, true)
  })

  test('PATCH /auth/me updates full_name (then restores it)', async () => {
    const auth = { Authorization: `Bearer ${session.access_token}` }
    const before = await request(app).get('/api/v1/auth/me').set(auth)
    const original = before.body.data.profile.full_name ?? 'Admin'

    const changed = await request(app).patch('/api/v1/auth/me').set(auth).send({ full_name: `${original} (test)` })
    assert.equal(changed.status, 200, JSON.stringify(changed.body))
    assert.equal(changed.body.data.full_name, `${original} (test)`)

    const restored = await request(app).patch('/api/v1/auth/me').set(auth).send({ full_name: original })
    assert.equal(restored.status, 200)
    assert.equal(restored.body.data.full_name, original)
  })

  test('PATCH /auth/me rejects role escalation fields', async () => {
    const res = await request(app)
      .patch('/api/v1/auth/me')
      .set('Authorization', `Bearer ${session.access_token}`)
      .send({ full_name: 'x', role: 'super_admin' })
    assert.equal(res.status, 400)
  })

  test('refresh then logout revokes the refresh token', async () => {
    const login = await request(app).post('/api/v1/auth/login').send({ email, password })
    const s = login.body.data.session

    const refreshed = await request(app).post('/api/v1/auth/refresh').send({ refresh_token: s.refresh_token })
    assert.equal(refreshed.status, 200, JSON.stringify(refreshed.body))
    const s2 = refreshed.body.data.session
    assert.ok(s2.access_token)

    const out = await request(app).post('/api/v1/auth/logout').set('Authorization', `Bearer ${s2.access_token}`)
    assert.equal(out.status, 204)

    const again = await request(app).post('/api/v1/auth/refresh').send({ refresh_token: s2.refresh_token })
    assert.equal(again.status, 401)
  })
})
