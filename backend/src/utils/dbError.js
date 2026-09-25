import { AppError } from './AppError.js'

const SCHEMA_OUTDATED_MESSAGE =
  'The database schema is out of date. Apply the SQL migrations in frontend/supabase/migrations (20260925*) and retry.'

/**
 * Translate a PostgREST / Postgres error (as returned by supabase-js) into an
 * AppError with a sensible HTTP status. The original Postgres code is kept in
 * `code` because the frontend already branches on it (e.g. '23505').
 *
 * Workflow functions in the database raise with custom SQLSTATEs whose
 * messages are written for users:
 *   P0400 validation · P0403 forbidden · P0404 not found · P0409 conflict /
 *   invalid transition · P0429 throttled
 *
 * @param {{ code?: string, message?: string, details?: string|null, hint?: string|null }} error
 * @param {string} [context] Short description of what was being done, for messages
 */
export function fromDbError(error, context) {
  if (!error) return null
  if (error instanceof AppError) return error

  const code = error.code ?? 'DB_ERROR'
  const raw = error.message || 'Database error'
  const details = error.details || error.hint || undefined
  const prefix = context ? `${context}: ` : ''

  switch (code) {
    // --- Business rules raised by the database workflow functions ---
    case 'P0400':
      return new AppError(400, raw, { code: 'VALIDATION_ERROR' })
    case 'P0403':
      return new AppError(403, raw, { code: 'FORBIDDEN' })
    case 'P0404':
      return new AppError(404, raw, { code: 'NOT_FOUND' })
    case 'P0409':
      return new AppError(409, raw, { code: 'CONFLICT' })
    case 'P0429':
      return new AppError(429, raw, { code: 'RATE_LIMITED' })

    // --- PostgREST ---
    case 'PGRST116': // .single() found 0 (or >1) rows
      return new AppError(404, `${prefix}record not found.`, { code: 'NOT_FOUND' })
    case 'PGRST200': // unknown relationship in select
    case 'PGRST100': // bad filter syntax
      return new AppError(400, `${prefix}${raw}`, { code, details })
    case 'PGRST202': // function not found
    case 'PGRST204': // column not found in schema cache
    case 'PGRST205': // table not found
    case '42P01': // undefined table
    case '42703': // undefined column
    case '42883': // undefined function
      return new AppError(503, SCHEMA_OUTDATED_MESSAGE, { code: 'SCHEMA_OUTDATED', details: raw })
    case 'PGRST301': // JWT invalid/expired
    case 'PGRST302':
      return new AppError(401, 'Your session has expired. Please sign in again.', { code })

    // --- Postgres ---
    case '23505':
      return new AppError(409, `${prefix}a record with the same unique value already exists.`, {
        code,
        details,
      })
    case '23503':
      return new AppError(409, `${prefix}the record is referenced by, or references, another record.`, {
        code,
        details,
      })
    case '23502':
      return new AppError(400, `${prefix}a required field is missing.`, { code, details: details ?? raw })
    case '23514':
      return new AppError(400, `${prefix}a value is outside the allowed range.`, { code, details: details ?? raw })
    case '22P02': // invalid text representation (e.g. bad uuid)
    case '22007': // invalid datetime format
    case '22008':
    case '22003': // numeric out of range
      return new AppError(400, `${prefix}invalid value format.`, { code, details: raw })
    case '42501': // insufficient privilege / RLS violation
      return new AppError(403, 'You do not have permission to perform this action.', { code })
    case 'P0001': // RAISE EXCEPTION inside a function: message is meant for the user
      return new AppError(400, raw, { code, details })
    case '40001':
    case '40P01':
      return new AppError(409, 'The operation conflicted with another change. Please retry.', { code })
    default:
      return new AppError(500, `${prefix}unexpected database error.`, { code, details: raw })
  }
}

/**
 * Unwrap a supabase-js `{ data, error }` result: throw a mapped AppError on
 * error, otherwise return data.
 */
export function unwrap({ data, error }, context) {
  if (error) throw fromDbError(error, context)
  return data
}

/**
 * Like unwrap, for `{ data, error, count }` list results.
 * @returns {{ rows: any[], count: number }}
 */
export function unwrapList({ data, error, count }, context) {
  if (error) throw fromDbError(error, context)
  return { rows: data ?? [], count: count ?? (data ? data.length : 0) }
}
