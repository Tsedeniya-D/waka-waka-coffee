import { z } from 'zod'

/** Trimmed string; '' becomes undefined so optional fields stay optional. */
export const optionalText = (max = 2000) =>
  z.preprocess(
    (v) => (typeof v === 'string' ? (v.trim() === '' ? undefined : v.trim()) : v),
    z.string().max(max).optional()
  )

/** Trimmed, required, non-empty string. */
export const requiredText = (label, max = 500) =>
  z
    .string({ error: `${label} is required.` })
    .trim()
    .min(1, `${label} is required.`)
    .max(max, `${label} must be at most ${max} characters.`)

/** Nullable text for PATCH bodies: '' or null clears the column. */
export const nullableText = (max = 2000) =>
  z.preprocess(
    (v) => (typeof v === 'string' ? (v.trim() === '' ? null : v.trim()) : v),
    z.string().max(max).nullable().optional()
  )

export const email = z.string().trim().toLowerCase().email('Enter a valid email address.').max(254)

/** Optional / clearable email for contact fields. */
export const nullableEmail = z.preprocess(
  (v) => (typeof v === 'string' ? (v.trim() === '' ? null : v.trim().toLowerCase()) : v),
  z.string().email('Enter a valid email address.').max(254).nullable().optional()
)

/** Phone numbers: digits, spaces and + ( ) - . only. */
export const nullablePhone = z.preprocess(
  (v) => (typeof v === 'string' ? (v.trim() === '' ? null : v.trim()) : v),
  z
    .string()
    .max(40)
    .regex(/^[+()\d\s.-]{5,40}$/, 'Enter a valid phone number.')
    .nullable()
    .optional()
)

export const uuid = z.string().uuid('Must be a valid id.')

export const nullableUuid = z.preprocess(
  (v) => (v === '' ? null : v),
  z.string().uuid('Must be a valid id.').nullable().optional()
)

export const idParams = z.object({ id: uuid })

export const idsBody = z.object({
  ids: z.array(uuid).min(1, 'Select at least one record.').max(500, 'Too many records selected.'),
})

/** Positive decimal that also accepts numeric strings from form inputs. */
export const positiveNumber = (label) =>
  z.coerce
    .number({ error: `${label} must be a number.` })
    .refine(Number.isFinite, `${label} must be a number.`)
    .positive(`${label} must be greater than 0.`)

export const nonNegativeNumber = (label) =>
  z.coerce
    .number({ error: `${label} must be a number.` })
    .refine(Number.isFinite, `${label} must be a number.`)
    .min(0, `${label} cannot be negative.`)

/** Optional number from a form field: '' / null clears it. */
export const nullableNumber = (label, { min, max, int = false } = {}) => {
  let n = z.number({ error: `${label} must be a number.` }).refine(Number.isFinite, `${label} must be a number.`)
  if (int) n = n.int(`${label} must be a whole number.`)
  if (min !== undefined) n = n.min(min, `${label} must be at least ${min}.`)
  if (max !== undefined) n = n.max(max, `${label} must be at most ${max}.`)
  return z.preprocess((v) => {
    if (v === '' || v === null || v === undefined) return v === undefined ? undefined : null
    return typeof v === 'string' ? Number(v) : v
  }, n.nullable().optional())
}

/** YYYY-MM-DD date string (what <input type="date"> sends). */
export const dateOnly = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be in YYYY-MM-DD format.')
  .refine((s) => !Number.isNaN(Date.parse(`${s}T00:00:00Z`)), 'Enter a real calendar date.')

export const nullableDate = z.preprocess((v) => (v === '' ? null : v), dateOnly.nullable().optional())

export const booleanish = z.preprocess((v) => {
  if (v === 'true' || v === '1') return true
  if (v === 'false' || v === '0') return false
  return v
}, z.boolean())

/** Comma-separated list in a query string -> array of allowed values. */
export const csvEnum = (values) =>
  z.preprocess(
    (v) => (typeof v === 'string' ? v.split(',').map((s) => s.trim()).filter(Boolean) : v),
    z.array(z.enum(values)).optional()
  )

/**
 * List query: paging, search, sort (whitelisted) and a date range.
 * @param {string[]} sortable columns that may be sorted on
 */
export const listQuery = (sortable = ['created_at']) => {
  const sortValues = sortable.flatMap((c) => [c, `-${c}`])
  return z.object({
    page: z.coerce.number().int().min(1).optional(),
    limit: z.coerce.number().int().min(1).max(1000).optional(),
    search: optionalText(200),
    sort: z.enum(sortValues).optional(),
    from: dateOnly.optional(),
    to: dateOnly.optional(),
  })
}

/** Status change bodies */
export const statusBody = (values) =>
  z.object({
    status: z.enum(values, { error: `Status must be one of: ${values.join(', ')}.` }),
    reason: optionalText(1000),
  })
