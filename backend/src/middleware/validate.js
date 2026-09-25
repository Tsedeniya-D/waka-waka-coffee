import { AppError } from '../utils/AppError.js'

/**
 * Validate request parts with zod schemas. Parsed (coerced, trimmed,
 * defaulted) values are placed on req.valid.{body,query,params}; handlers
 * must read from there, never from the raw req.body.
 *
 * @param {{ body?: import('zod').ZodType, query?: import('zod').ZodType, params?: import('zod').ZodType }} schemas
 */
export function validate(schemas) {
  return function validateRequest(req, _res, next) {
    req.valid = req.valid ?? {}
    const issues = []

    for (const part of ['params', 'query', 'body']) {
      const schema = schemas[part]
      if (!schema) continue
      const result = schema.safeParse(req[part] ?? {})
      if (result.success) {
        req.valid[part] = result.data
      } else {
        for (const issue of result.error.issues) {
          issues.push({ location: part, path: issue.path.join('.'), message: issue.message })
        }
      }
    }

    if (issues.length) {
      const first = issues[0]
      const where = first.path ? `${first.path}: ` : ''
      throw new AppError(400, `${where}${first.message}`, { code: 'VALIDATION_ERROR', details: issues })
    }
    next()
  }
}
