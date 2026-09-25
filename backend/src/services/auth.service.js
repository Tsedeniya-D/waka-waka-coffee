import { env } from '../config/env.js'
import { createAnonClient, createUserClient } from '../lib/supabase.js'
import { getProfileById, touchLastLogin } from './profile.service.js'
import { isAdminRole, isEmployeeRole, modulesForRole, MODULE_ACCESS, can } from '../config/permissions.js'
import { AppError } from '../utils/AppError.js'

/** Public shape of a Supabase session returned to API clients. */
function toSessionDto(session) {
  return {
    access_token: session.access_token,
    refresh_token: session.refresh_token,
    token_type: session.token_type ?? 'bearer',
    expires_in: session.expires_in,
    expires_at: session.expires_at,
    // The signed-in user's own Auth record, so the browser can store the
    // session without another round trip to Supabase.
    user: session.user ?? null,
  }
}

/** Role capabilities the UI can use to show/hide actions. */
export function permissionsFor(role) {
  const modules = modulesForRole(role)
  const actions = Object.fromEntries(
    Object.keys(MODULE_ACCESS).map((m) => [
      m,
      {
        view: can(role, m, 'view'),
        create: can(role, m, 'create'),
        update: can(role, m, 'update'),
        delete: can(role, m, 'delete'),
      },
    ])
  )
  return { role, is_admin: isAdminRole(role), modules, actions }
}

/** Revoke the session behind an access token (refresh token becomes unusable). */
export async function revokeSession(accessToken, scope = 'local') {
  const res = await fetch(`${env.SUPABASE_URL}/auth/v1/logout?scope=${scope}`, {
    method: 'POST',
    headers: {
      apikey: env.SUPABASE_PUBLISHABLE_KEY,
      Authorization: `Bearer ${accessToken}`,
    },
  })
  // 204 = revoked; 401/403/404 = already invalid, which is fine for logout.
  if (!res.ok && ![401, 403, 404].includes(res.status)) {
    throw AppError.unavailable('Could not sign out from the authentication service.')
  }
}

/** Throw unless the profile belongs to an active employee. */
function assertEmployee(profile) {
  if (!profile) {
    throw AppError.forbidden('Your account is authenticated, but no employee profile was found.')
  }
  if (profile.is_active === false) {
    throw new AppError(403, 'Your account has been deactivated. Contact an administrator.', {
      code: 'ACCOUNT_INACTIVE',
    })
  }
  if (!isEmployeeRole(profile.role)) {
    throw new AppError(403, 'Access denied. An active employee account is required.', {
      code: 'NOT_EMPLOYEE',
    })
  }
}

/**
 * Email + password sign-in through Supabase Auth, restricted to active
 * employees (mirrors and hardens the AdminLogin page).
 */
export async function login({ email, password }) {
  const supabase = createAnonClient()
  const { data, error } = await supabase.auth.signInWithPassword({ email, password })

  if (error) {
    const code = error.code ?? ''
    if (code === 'invalid_credentials' || error.status === 400) {
      throw new AppError(401, 'Invalid email or password.', { code: 'INVALID_CREDENTIALS' })
    }
    if (code === 'email_not_confirmed') {
      throw new AppError(403, 'Please confirm your email address before signing in.', {
        code: 'EMAIL_NOT_CONFIRMED',
      })
    }
    if (error.status === 429) {
      throw new AppError(429, 'Too many sign-in attempts. Please wait and try again.', {
        code: 'RATE_LIMITED',
      })
    }
    throw AppError.unavailable('Sign-in is temporarily unavailable. Please try again.')
  }

  const { session, user } = data
  if (!session || !user) {
    throw AppError.unavailable('Sign-in succeeded but no session was returned.')
  }

  const db = createUserClient(session.access_token)
  const profile = await getProfileById(db, user.id)
  try {
    assertEmployee(profile)
  } catch (err) {
    // Do not leave a usable session behind for non-employees / inactive accounts.
    await revokeSession(session.access_token).catch(() => {})
    throw err
  }
  await touchLastLogin(db, user.id).catch(() => {})

  return {
    session: toSessionDto(session),
    user: { id: user.id, email: user.email ?? profile.email ?? null },
    profile,
    permissions: permissionsFor(profile.role),
  }
}

/** Exchange a refresh token for a new session (still employee-only). */
export async function refresh({ refresh_token }) {
  const supabase = createAnonClient()
  const { data, error } = await supabase.auth.refreshSession({ refresh_token })
  if (error || !data.session || !data.user) {
    throw new AppError(401, 'Your session has expired. Please sign in again.', {
      code: 'INVALID_REFRESH_TOKEN',
    })
  }

  const profile = await getProfileById(createUserClient(data.session.access_token), data.user.id)
  try {
    assertEmployee(profile)
  } catch (err) {
    await revokeSession(data.session.access_token).catch(() => {})
    throw err
  }

  return {
    session: toSessionDto(data.session),
    user: { id: data.user.id, email: data.user.email ?? null },
    profile,
    permissions: permissionsFor(profile.role),
  }
}

/**
 * Send a password-reset email. Always resolves (no account enumeration).
 * redirect_to must point at one of the allowed frontend origins.
 */
export async function requestPasswordReset({ email, redirect_to }) {
  let redirectTo
  if (redirect_to) {
    const origin = new URL(redirect_to).origin
    if (!env.CORS_ORIGINS.includes(origin)) {
      throw AppError.badRequest('redirect_to must be on an allowed frontend origin.')
    }
    redirectTo = redirect_to
  } else if (env.PASSWORD_RESET_REDIRECT) {
    redirectTo = env.PASSWORD_RESET_REDIRECT
  } else if (env.CORS_ORIGINS[0]) {
    redirectTo = `${env.CORS_ORIGINS[0]}/admin/reset-password`
  }

  const supabase = createAnonClient()
  const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo })
  if (error && error.status === 429) {
    throw new AppError(429, 'Too many reset requests. Please wait and try again.', {
      code: 'RATE_LIMITED',
    })
  }
  // Any other error (unknown email etc.) is intentionally not revealed.
}

/** Update the password of the account behind an access token (GoTrue PUT /user). */
async function setPassword(accessToken, password) {
  const res = await fetch(`${env.SUPABASE_URL}/auth/v1/user`, {
    method: 'PUT',
    headers: {
      apikey: env.SUPABASE_PUBLISHABLE_KEY,
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ password }),
  })
  if (res.ok) return
  const body = await res.json().catch(() => ({}))
  const code = body.error_code ?? body.code ?? ''
  if (code === 'same_password') {
    throw AppError.badRequest('The new password must be different from the current one.')
  }
  if (code === 'weak_password' || res.status === 422) {
    throw AppError.badRequest(body.msg ?? body.message ?? 'The password is too weak.')
  }
  if (res.status === 401 || res.status === 403) {
    throw AppError.unauthorized('Your session has expired. Please sign in again.')
  }
  throw AppError.unavailable('Could not update the password. Please try again.')
}

/**
 * Signed-in employee changes their own password; the current password is
 * re-verified first so a stolen session alone cannot lock the owner out.
 */
export async function changePassword({ email, accessToken }, { current_password, new_password }) {
  const { error } = await createAnonClient().auth.signInWithPassword({ email, password: current_password })
  if (error) {
    throw new AppError(400, 'The current password is incorrect.', { code: 'INVALID_CREDENTIALS' })
  }
  await setPassword(accessToken, new_password)
}

/** Finish the e-mailed reset flow: the caller holds a recovery session token. */
export async function completePasswordReset({ accessToken }, { new_password }) {
  await setPassword(accessToken, new_password)
}
