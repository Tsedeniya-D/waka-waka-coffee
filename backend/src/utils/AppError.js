/**
 * Operational error with an HTTP status. Anything thrown that is NOT an
 * AppError (and not a recognised database error) is treated as a 500 and its
 * message is hidden from clients in production.
 */
export class AppError extends Error {
  /**
   * @param {number} status HTTP status code
   * @param {string} message Safe, user-facing message
   * @param {object} [opts]
   * @param {string} [opts.code] Machine-readable code (e.g. 'NOT_FOUND', '23505')
   * @param {unknown} [opts.details] Extra context (validation issues, etc.)
   */
  constructor(status, message, { code, details } = {}) {
    super(message)
    this.name = 'AppError'
    this.status = status
    this.code = code ?? defaultCode(status)
    this.details = details
  }

  static badRequest(message, details) {
    return new AppError(400, message, { code: 'BAD_REQUEST', details })
  }
  static unauthorized(message = 'Authentication required.') {
    return new AppError(401, message, { code: 'UNAUTHORIZED' })
  }
  static forbidden(message = 'You do not have permission to perform this action.') {
    return new AppError(403, message, { code: 'FORBIDDEN' })
  }
  static notFound(message = 'Resource not found.') {
    return new AppError(404, message, { code: 'NOT_FOUND' })
  }
  static conflict(message, details) {
    return new AppError(409, message, { code: 'CONFLICT', details })
  }
  static unprocessable(message, details) {
    return new AppError(422, message, { code: 'UNPROCESSABLE', details })
  }
  static unavailable(message) {
    return new AppError(503, message, { code: 'SERVICE_UNAVAILABLE' })
  }
}

function defaultCode(status) {
  switch (status) {
    case 400:
      return 'BAD_REQUEST'
    case 401:
      return 'UNAUTHORIZED'
    case 403:
      return 'FORBIDDEN'
    case 404:
      return 'NOT_FOUND'
    case 409:
      return 'CONFLICT'
    case 422:
      return 'UNPROCESSABLE'
    case 503:
      return 'SERVICE_UNAVAILABLE'
    default:
      return status >= 500 ? 'INTERNAL_ERROR' : 'ERROR'
  }
}
