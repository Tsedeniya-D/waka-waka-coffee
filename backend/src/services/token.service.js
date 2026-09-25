import { createRemoteJWKSet, jwtVerify, errors as joseErrors } from 'jose'
import { env } from '../config/env.js'
import { AppError } from '../utils/AppError.js'

/**
 * Supabase signs access tokens with an asymmetric key (ES256) and publishes
 * the public keys at /auth/v1/.well-known/jwks.json. Verifying locally avoids
 * a network round-trip to Supabase Auth on every API request. jose caches
 * the key set and refetches it automatically when a new `kid` appears (key
 * rotation).
 */
const issuer = `${env.SUPABASE_URL}/auth/v1`
const jwks = createRemoteJWKSet(new URL(`${issuer}/.well-known/jwks.json`), {
  cooldownDuration: 30_000,
  cacheMaxAge: 10 * 60_000,
})

/**
 * @param {string} token
 * @returns {Promise<{ userId: string, email: string|null, sessionId: string|null, expiresAt: number }>}
 */
export async function verifyAccessToken(token) {
  let payload
  try {
    ;({ payload } = await jwtVerify(token, jwks, { issuer, audience: 'authenticated' }))
  } catch (err) {
    if (err instanceof joseErrors.JWTExpired) {
      throw new AppError(401, 'Your session has expired. Please sign in again.', {
        code: 'TOKEN_EXPIRED',
      })
    }
    if (err instanceof joseErrors.JWKSTimeout || err?.code === 'ERR_JWKS_TIMEOUT') {
      throw AppError.unavailable('Could not reach the authentication service. Please retry.')
    }
    throw new AppError(401, 'Invalid authentication token.', { code: 'INVALID_TOKEN' })
  }

  if (payload.role !== 'authenticated' || !payload.sub || payload.is_anonymous === true) {
    throw new AppError(401, 'Invalid authentication token.', { code: 'INVALID_TOKEN' })
  }

  return {
    userId: payload.sub,
    email: typeof payload.email === 'string' ? payload.email : null,
    sessionId: typeof payload.session_id === 'string' ? payload.session_id : null,
    expiresAt: payload.exp,
  }
}
