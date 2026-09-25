import { createUserClient } from '../lib/supabase.js'
import { verifyAccessToken } from '../services/token.service.js'
import { getProfileById } from '../services/profile.service.js'
import { can, canAccessModule, canonicalRole, isEmployeeRole } from '../config/permissions.js'
import { AppError } from '../utils/AppError.js'

function extractBearer(req) {
  const header = req.get('authorization') ?? ''
  const [scheme, token] = header.split(' ')
  if (scheme?.toLowerCase() !== 'bearer' || !token) return null
  return token.trim()
}

/**
 * Build the authentication middleware. Dependencies are injectable so the
 * middleware can be unit-tested without Supabase.
 */
export function createAuthenticate({
  verifyToken = verifyAccessToken,
  makeClient = createUserClient,
  loadProfile = getProfileById,
} = {}) {
  /**
   * Requires a valid Supabase access token belonging to an ACTIVE employee.
   * Populates req.auth = { userId, email, token, profile, role, db }.
   */
  return async function authenticate(req, _res, next) {
    const token = extractBearer(req)
    if (!token) throw AppError.unauthorized('Missing Authorization: Bearer <access_token> header.')

    const claims = await verifyToken(token)
    const db = makeClient(token)
    const profile = await loadProfile(db, claims.userId)

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

    req.auth = {
      userId: claims.userId,
      email: claims.email ?? profile.email ?? null,
      token,
      profile,
      role: profile.role,
      db,
    }
    next()
  }
}

export const authenticate = createAuthenticate()

/**
 * Allow the request only if the caller's role can perform `action` on
 * `module` (same matrix as the frontend). Must run after authenticate.
 *
 * @param {string} module
 * @param {'view'|'create'|'update'|'delete'} [action]
 */
export function authorize(module, action = 'view') {
  return function authorizeModule(req, _res, next) {
    const role = req.auth?.role
    if (!role) throw AppError.unauthorized()
    if (!canAccessModule(role, module)) {
      throw AppError.forbidden(`Your role (${role}) cannot access ${module.replace(/_/g, ' ')}.`)
    }
    if (!can(role, module, action)) {
      throw AppError.forbidden(`Your role (${role}) cannot ${action} ${module.replace(/_/g, ' ')}.`)
    }
    next()
  }
}

/**
 * Allow only the listed (canonical) roles. Department synonyms are
 * normalised first, e.g. 'quality' passes requireRoles('quality_officer').
 * Use for workflow steps owned by one department.
 * @param {...string} roles
 */
export function requireRoles(...roles) {
  return function requireRole(req, _res, next) {
    const role = req.auth?.role
    if (!role) throw AppError.unauthorized()
    if (!roles.includes(canonicalRole(role))) {
      throw AppError.forbidden(`This action is not available to the ${role} role.`)
    }
    next()
  }
}
