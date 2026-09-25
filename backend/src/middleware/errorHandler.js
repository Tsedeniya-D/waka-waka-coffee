import { AppError } from '../utils/AppError.js'
import { isProduction, isTest } from '../config/env.js'

export function notFound(req, _res, next) {
  next(AppError.notFound(`Route not found: ${req.method} ${req.originalUrl}`))
}

/**
 * Single place that turns errors into JSON:
 *   { "error": { "message": "...", "code": "...", "details": ... } }
 * `message` is always safe to show to users. Unexpected errors are logged
 * with the request id and reported as a generic 500.
 */
// eslint-disable-next-line no-unused-vars
export function errorHandler(err, req, res, _next) {
  // Malformed JSON body from express.json()
  if (err?.type === 'entity.parse.failed') {
    err = new AppError(400, 'Request body is not valid JSON.', { code: 'INVALID_JSON' })
  } else if (err?.type === 'entity.too.large') {
    err = new AppError(413, 'Request body is too large.', { code: 'PAYLOAD_TOO_LARGE' })
  }

  const known = err instanceof AppError
  const status = known ? err.status : 500

  if (!known || status >= 500) {
    if (!isTest) {
      console.error(`[${req.id ?? '-'}] ${req.method} ${req.originalUrl} ->`, err)
    }
  }

  const body = {
    error: {
      message: known ? err.message : 'Internal server error.',
      code: known ? err.code : 'INTERNAL_ERROR',
    },
  }
  if (known && err.details !== undefined && !(isProduction && status >= 500)) {
    body.error.details = err.details
  }
  if (req.id) body.error.request_id = req.id

  res.status(status).json(body)
}
