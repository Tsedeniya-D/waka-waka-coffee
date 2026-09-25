import { unwrap } from '../utils/dbError.js'

/**
 * Several columns (sales_person_id, field_officer_id, inspector_id,
 * uploaded_by, ...) reference auth.users, so PostgREST cannot embed the
 * profile. This attaches { id, full_name, role } for them in one query.
 *
 * @param {any} db user-scoped client
 * @param {object[]|object} rows
 * @param {Array<[string, string]>} fields [sourceColumn, targetKey] pairs
 */
export async function attachProfiles(db, rows, fields) {
  const list = Array.isArray(rows) ? rows : rows ? [rows] : []
  const ids = [...new Set(list.flatMap((r) => fields.map(([col]) => r?.[col]).filter(Boolean)))]
  if (!ids.length) {
    for (const r of list) for (const [, key] of fields) r[key] = null
    return rows
  }
  const people = unwrap(
    await db.from('profiles').select('id, full_name, email, role').in('id', ids),
    'Loading people'
  )
  const byId = new Map(people.map((p) => [p.id, p]))
  for (const r of list) {
    for (const [col, key] of fields) r[key] = r[col] ? byId.get(r[col]) ?? null : null
  }
  return rows
}
