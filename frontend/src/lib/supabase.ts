import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const rawUrl = (import.meta.env.VITE_SUPABASE_URL || '').trim()
const rawKey = (
  import.meta.env.VITE_SUPABASE_ANON_KEY ||
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
  ''
).trim()

/** Reject empty or .env.example placeholder values */
function looksConfigured(url: string, key: string): boolean {
  if (!url || !key) return false
  if (/your-supabase|placeholder|example\.com/i.test(url)) return false
  if (/your-supabase|your-anon|changeme|placeholder/i.test(key)) return false
  try {
    const parsed = new URL(url)
    return parsed.protocol === 'https:' || parsed.protocol === 'http:'
  } catch {
    return false
  }
}

export const isSupabaseConfigured = looksConfigured(rawUrl, rawKey)

/**
 * Supabase JS throws if url is empty. Use inert placeholders when unset so
 * the marketing site still boots; feature code must check isSupabaseConfigured.
 */
const clientUrl = isSupabaseConfigured ? rawUrl : 'https://placeholder.supabase.co'
const clientKey = isSupabaseConfigured
  ? rawKey
  : 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZmYiOiJwbGFjZWhvbGRlciIsInJvbGUiOiJhbm9uIiwiaWF0IjoxNjQ1MTkyODAwLCJleHAiOjE5NjA3Njg4MDB9.placeholder'

/** Where supabase-js keeps the browser session (sessionStorage). */
export const AUTH_STORAGE_KEY = 'waka_admin_auth_session'

export const supabase: SupabaseClient = createClient(clientUrl, clientKey, {
  auth: {
    autoRefreshToken: isSupabaseConfigured,
    persistSession: isSupabaseConfigured,
    storageKey: AUTH_STORAGE_KEY,
    storage: typeof window !== 'undefined' ? window.sessionStorage : undefined,
    detectSessionInUrl: isSupabaseConfigured,
  },
  global: {
    headers: {
      'x-application-name': 'waka-coffee',
    },
  },
})

export const getSupabaseEnv = () => ({
  url: isSupabaseConfigured ? rawUrl : null,
  hasKey: isSupabaseConfigured,
  configured: isSupabaseConfigured,
})
