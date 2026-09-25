import { createClient } from '@supabase/supabase-js'
import ws from 'ws'

import { env } from '../config/env.js'
import { AppError } from '../utils/AppError.js'

/**
 * Server-side clients never persist sessions or auto-refresh: every request
 * carries its own token.
 */
const serverAuthOptions = {
  persistSession: false,
  autoRefreshToken: false,
  detectSessionInUrl: false,
}

const baseHeaders = {
  'x-application-name': 'waka-coffee-backend',
}

/**
 * Node.js 20 does not provide native WebSocket support required by
 * Supabase Realtime, so explicitly use the ws package as the transport.
 */
const realtimeOptions = {
  transport: ws,
}

/**
 * Client acting AS the signed-in employee. PostgREST receives the user's JWT,
 * so every existing RLS policy still applies (defence in depth on top of the
 * Express RBAC layer). Use this for all normal reads/writes.
 *
 * @param {string} accessToken Verified Supabase access token
 */
export function createUserClient(accessToken) {
  return createClient(
    env.SUPABASE_URL,
    env.SUPABASE_PUBLISHABLE_KEY,
    {
      auth: serverAuthOptions,
      global: {
        headers: {
          ...baseHeaders,
          Authorization: `Bearer ${accessToken}`,
        },
      },
      realtime: realtimeOptions,
    }
  )
}

/**
 * Anonymous client: public website RPCs (quote / sample submission) and the
 * password sign-in / refresh endpoints. A fresh instance per call so no auth
 * state is ever shared between requests.
 */
export function createAnonClient() {
  return createClient(
    env.SUPABASE_URL,
    env.SUPABASE_PUBLISHABLE_KEY,
    {
      auth: serverAuthOptions,
      global: {
        headers: baseHeaders,
      },
      realtime: realtimeOptions,
    }
  )
}

let adminClient = null

/** True when the secret (service_role) key is configured. */
export const hasAdminClient = () => Boolean(env.SUPABASE_SECRET_KEY)

/**
 * Privileged client (bypasses RLS). ONLY for operations Supabase requires it
 * for, e.g. auth.admin.createUser. Callers must already have enforced RBAC.
 */
export function getAdminClient() {
  if (!env.SUPABASE_SECRET_KEY) {
    throw AppError.unavailable(
      'This operation requires SUPABASE_SECRET_KEY to be configured on the server.'
    )
  }

  if (!adminClient) {
    adminClient = createClient(
      env.SUPABASE_URL,
      env.SUPABASE_SECRET_KEY,
      {
        auth: serverAuthOptions,
        global: {
          headers: baseHeaders,
        },
        realtime: realtimeOptions,
      }
    )
  }

  return adminClient
}