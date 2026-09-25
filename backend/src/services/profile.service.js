import { unwrap } from '../utils/dbError.js'
import { AppError } from '../utils/AppError.js'
import { compact } from '../lib/query.js'

/**
 * profiles.id IS the Supabase Auth user id (auth.users.id). There is no
 * user_id column in the live database.
 */
export const PROFILE_COLUMNS =
  'id, full_name, email, role, avatar_url, phone, job_title, is_active, last_login_at, created_at, updated_at'

/**
 * Load a profile by auth user id using the caller's own client (RLS applies).
 * @param {import('@supabase/supabase-js').SupabaseClient} db
 * @param {string} id
 */
export async function getProfileById(db, id) {
  return unwrap(
    await db.from('profiles').select(PROFILE_COLUMNS).eq('id', id).maybeSingle(),
    'Loading profile'
  )
}

/**
 * Update the caller's own editable profile fields (Settings page).
 * role / is_active / email are admin-only (enforced by the database too).
 */
export async function updateOwnProfile(db, id, { full_name, phone, job_title }) {
  const row = unwrap(
    await db
      .from('profiles')
      .update(compact({ full_name, phone, job_title }))
      .eq('id', id)
      .select(PROFILE_COLUMNS)
      .maybeSingle(),
    'Updating profile'
  )
  if (!row) throw AppError.notFound('Profile not found.')
  return row
}

/** Best-effort: remember when the employee last signed in. */
export async function touchLastLogin(db, id) {
  await db.from('profiles').update({ last_login_at: new Date().toISOString() }).eq('id', id)
}
