import { createAnonClient, getAdminClient, hasAdminClient } from '../lib/supabase.js'
import { compact, getById, rpc, runList, updateOne } from '../lib/query.js'
import { PROFILE_COLUMNS } from './profile.service.js'
import { canonicalRole, EMPLOYEE_ROLES } from '../config/permissions.js'
import { env } from '../config/env.js'
import { unwrap } from '../utils/dbError.js'
import { AppError } from '../utils/AppError.js'

export async function list(db, q) {
  const query = db.from('profiles').select(PROFILE_COLUMNS, { count: 'exact' })
  const eq = { role: q.role }
  if (q.status) eq.is_active = q.status === 'active'
  let base = query
  if (!q.role && !q.include_public) base = base.in('role', [...EMPLOYEE_ROLES])
  return runList(base, { ...q, eq, searchColumns: ['full_name', 'email', 'job_title'] }, 'Loading users')
}

export function get(db, id) {
  return getById(db, 'profiles', id, PROFILE_COLUMNS, 'User')
}

/** Basic list of colleagues (for "assign to" pickers). Any employee may read it. */
export async function directory(db, { role }) {
  let q = db.from('profiles').select('id, full_name, email, role').eq('is_active', true).in('role', [...EMPLOYEE_ROLES])
  if (role?.length) {
    // Accept canonical names and their department synonyms.
    const expanded = EMPLOYEE_ROLES.filter((r) => role.includes(r) || role.includes(canonicalRole(r)))
    q = q.in('role', expanded)
  }
  return unwrap(await q.order('full_name'), 'Loading colleagues')
}

function assertMayGrant(callerRole, targetRole) {
  if (targetRole === 'super_admin' && callerRole !== 'super_admin') {
    throw AppError.forbidden('Only a super admin can grant super admin access.')
  }
}

/**
 * Create an employee login. With SUPABASE_SECRET_KEY the official Auth Admin
 * API is used; otherwise the admin_create_employee_user() database function
 * (which re-checks that the caller is an administrator).
 */
export async function create(db, caller, body) {
  assertMayGrant(caller.role, body.role)

  let userId
  if (hasAdminClient()) {
    const admin = getAdminClient()
    const { data, error } = await admin.auth.admin.createUser({
      email: body.email,
      password: body.password,
      email_confirm: true,
      user_metadata: { full_name: body.full_name },
    })
    if (error) {
      if (error.status === 422 || /already/i.test(error.message)) {
        throw AppError.conflict('A user with this email already exists.')
      }
      throw AppError.badRequest(error.message)
    }
    userId = data.user.id
    // Role is set as the calling administrator so the database audit and
    // privilege guard apply exactly as for any other role change.
    unwrap(
      await db.from('profiles').update(compact({ role: body.role, full_name: body.full_name })).eq('id', userId),
      'Assigning role'
    )
  } else {
    const result = await rpc(
      db,
      'admin_create_employee_user',
      { p_email: body.email, p_password: body.password, p_full_name: body.full_name, p_role: body.role },
      'Creating employee'
    )
    userId = result.user_id
  }

  if (body.phone !== undefined || body.job_title !== undefined) {
    await updateOne(db, 'profiles', userId, compact({ phone: body.phone, job_title: body.job_title }), 'id', 'User')
  }
  return get(db, userId)
}

export function update(db, id, body) {
  return updateOne(db, 'profiles', id, compact(body), PROFILE_COLUMNS, 'User')
}

export async function changeRole(db, caller, id, role) {
  const target = await get(db, id)
  assertMayGrant(caller.role, role)
  if (target.role === 'super_admin' && caller.role !== 'super_admin') {
    throw AppError.forbidden('Only a super admin can change a super admin account.')
  }
  if (id === caller.userId) {
    throw AppError.forbidden('You cannot change your own role.')
  }
  return updateOne(db, 'profiles', id, { role }, PROFILE_COLUMNS, 'User')
}

/**
 * Activate / deactivate. Deactivation is enforced immediately by the API
 * (authenticate) and the database (is_role requires is_active). With the
 * service key the Auth user is also banned so refresh tokens stop working.
 */
export async function setActive(db, caller, id, isActive) {
  if (id === caller.userId && !isActive) {
    throw AppError.forbidden('You cannot deactivate your own account.')
  }
  const target = await get(db, id)
  if (target.role === 'super_admin' && caller.role !== 'super_admin') {
    throw AppError.forbidden('Only a super admin can change a super admin account.')
  }
  const row = await updateOne(db, 'profiles', id, { is_active: isActive }, PROFILE_COLUMNS, 'User')
  if (hasAdminClient()) {
    await getAdminClient()
      .auth.admin.updateUserById(id, { ban_duration: isActive ? 'none' : '876000h' })
      .catch(() => {})
  }
  return row
}

export async function sendPasswordReset(db, id) {
  const user = await get(db, id)
  if (!user.email) throw AppError.badRequest('This account has no email address.')
  const redirectTo = env.PASSWORD_RESET_REDIRECT ?? (env.CORS_ORIGINS[0] ? `${env.CORS_ORIGINS[0]}/admin/reset-password` : undefined)
  const { error } = await createAnonClient().auth.resetPasswordForEmail(user.email, { redirectTo })
  if (error?.status === 429) {
    throw new AppError(429, 'Too many reset requests. Please wait and try again.', { code: 'RATE_LIMITED' })
  }
  if (error) throw AppError.unavailable('Could not send the reset email.')
  return { message: `A password reset link was sent to ${user.email}.` }
}
