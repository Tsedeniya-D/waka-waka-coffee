import { randomUUID } from 'node:crypto'
import rateLimit from 'express-rate-limit'
import { isTest } from '../config/env.js'
import { AppError } from '../utils/AppError.js'

/** Attach a request id (honours an incoming X-Request-Id) for log correlation. */
export function requestId(req, res, next) {
  const incoming = req.get('x-request-id')
  req.id = incoming && /^[\w-]{8,64}$/.test(incoming) ? incoming : randomUUID()
  res.set('X-Request-Id', req.id)
  next()
}

const limitHandler = (_req, _res, next, options) =>
  next(new AppError(429, options.message, { code: 'RATE_LIMITED' }))

/** General API limiter (per IP). */
export const apiLimiter = rateLimit({
  windowMs: 60_000,
  limit: 300,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  skip: () => isTest,
  message: 'Too many requests. Please slow down.',
  handler: limitHandler,
})

/** Brute-force protection for credential endpoints. */
export const authLimiter = rateLimit({
  windowMs: 15 * 60_000,
  limit: 20,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  skip: () => isTest,
  message: 'Too many sign-in attempts. Please wait a few minutes and try again.',
  handler: limitHandler,
})

/** Public website forms (quote / sample / contact). */
export const publicFormLimiter = rateLimit({
  windowMs: 15 * 60_000,
  limit: 20,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  skip: () => isTest,
  message: 'Too many submissions. Please try again later.',
  handler: limitHandler,
})
