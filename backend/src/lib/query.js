import { unwrap, unwrapList } from '../utils/dbError.js'
import { AppError } from '../utils/AppError.js'

/** Hard cap per request (Supabase's PostgREST max-rows default is 1000). */
export const MAX_PAGE_SIZE = 1000

/**
 * Make free text safe to embed in a PostgREST `or=(...)` filter: characters
 * with meaning in that grammar are removed, never escaped by hand.
 */
export function sanitizeSearch(term) {
  if (typeof term !== 'string') return ''
  return term.replace(/[,()*%\\"':]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 100)
}

/**
 * Apply search / filters / sorting / paging to a supabase-js select builder.
 *
 * @param {any} query supabase `from(table).select(cols, { count: 'exact' })`
 * @param {object} opts
 * @param {string} [opts.search] free text
 * @param {string[]} [opts.searchColumns] columns matched with ilike
 * @param {Record<string, any>} [opts.eq] equality filters (undefined skipped; arrays -> in)
 * @param {{ column: string, from?: string, to?: string }} [opts.range] date range (inclusive)
 * @param {string} [opts.sort] column, optionally prefixed with '-' for descending
 * @param {number} [opts.page]
 * @param {number} [opts.limit]
 */
export function applyListOptions(query, opts = {}) {
  let q = query
  const { search, searchColumns = [], eq = {}, range, sort = '-created_at' } = opts

  for (const [column, value] of Object.entries(eq)) {
    if (value === undefined || value === null || value === '') continue
    if (Array.isArray(value)) {
      if (value.length) q = q.in(column, value)
    } else {
      q = q.eq(column, value)
    }
  }

  if (range?.from) q = q.gte(range.column, range.from)
  if (range?.to) {
    // Inclusive end date: compare with the next day for timestamp columns.
    const next = new Date(`${range.to}T00:00:00Z`)
    next.setUTCDate(next.getUTCDate() + 1)
    q = range.dateOnly ? q.lte(range.column, range.to) : q.lt(range.column, next.toISOString())
  }

  const term = sanitizeSearch(search)
  if (term && searchColumns.length) {
    q = q.or(searchColumns.map((c) => `${c}.ilike.*${term}*`).join(','))
  }

  if (sort) {
    const desc = sort.startsWith('-')
    q = q.order(desc ? sort.slice(1) : sort, { ascending: !desc, nullsFirst: false })
  }

  const limit = Math.min(opts.limit ?? MAX_PAGE_SIZE, MAX_PAGE_SIZE)
  const page = opts.page ?? 1
  const from = (page - 1) * limit
  return q.range(from, from + limit - 1)
}

/** Run a list query and return { rows, count, page, limit }. */
export async function runList(query, opts, context) {
  const result = unwrapList(await applyListOptions(query, opts), context)
  const limit = Math.min(opts.limit ?? MAX_PAGE_SIZE, MAX_PAGE_SIZE)
  return { ...result, page: opts.page ?? 1, limit }
}

/** Fetch one row by id or throw 404. */
export async function getById(db, table, id, select = '*', label = 'Record') {
  const row = unwrap(await db.from(table).select(select).eq('id', id).maybeSingle(), `Loading ${label.toLowerCase()}`)
  if (!row) throw AppError.notFound(`${label} not found.`)
  return row
}

/** Insert one row and return it. */
export async function insertOne(db, table, values, select = '*', label = 'record') {
  return unwrap(await db.from(table).insert(values).select(select).single(), `Creating ${label}`)
}

/**
 * Update one row by id and return it. A missing row (or one hidden by RLS)
 * becomes a 404 instead of a silent no-op.
 */
export async function updateOne(db, table, id, values, select = '*', label = 'Record') {
  const row = unwrap(
    await db.from(table).update(values).eq('id', id).select(select).maybeSingle(),
    `Updating ${label.toLowerCase()}`
  )
  if (!row) throw AppError.notFound(`${label} not found.`)
  return row
}

/** Delete by id; 404 when nothing was deleted (missing or not permitted). */
export async function deleteOne(db, table, id, label = 'Record') {
  const rows = unwrap(await db.from(table).delete().eq('id', id).select('id'), `Deleting ${label.toLowerCase()}`)
  if (!rows?.length) throw AppError.notFound(`${label} not found.`)
}

/** Delete many ids; returns the ids that were actually deleted. */
export async function deleteMany(db, table, ids, label = 'records') {
  const rows = unwrap(await db.from(table).delete().in('id', ids).select('id'), `Deleting ${label}`)
  return (rows ?? []).map((r) => r.id)
}

/** Call an RPC and unwrap it. */
export async function rpc(db, fn, args, context) {
  return unwrap(await db.rpc(fn, args), context)
}

/** Drop keys whose value is undefined (PATCH bodies). */
export function compact(obj) {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined))
}
