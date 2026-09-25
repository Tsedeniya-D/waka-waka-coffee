import { Router } from 'express'
import { env } from '../config/env.js'
import { hasAdminClient } from '../lib/supabase.js'

const router = Router()

/** Liveness: the process is up. No external calls. */
router.get('/', (_req, res) => {
  res.json({ data: { status: 'ok', uptime_s: Math.round(process.uptime()) } })
})

/** Readiness: Supabase Auth + REST are reachable with the configured key. */
router.get('/ready', async (_req, res) => {
  const check = async (url) => {
    try {
      const r = await fetch(url, {
        headers: { apikey: env.SUPABASE_PUBLISHABLE_KEY },
        signal: AbortSignal.timeout(5000),
      })
      return r.ok
    } catch {
      return false
    }
  }

  const [auth, rest] = await Promise.all([
    check(`${env.SUPABASE_URL}/auth/v1/health`),
    // The public catalog is readable by the anon role (limit=0: no data).
    check(`${env.SUPABASE_URL}/rest/v1/products?select=id&limit=0`),
  ])

  const ready = auth && rest
  res.status(ready ? 200 : 503).json({
    data: {
      status: ready ? 'ready' : 'degraded',
      supabase_auth: auth,
      supabase_rest: rest,
      admin_operations_enabled: hasAdminClient(),
    },
  })
})

export default router
