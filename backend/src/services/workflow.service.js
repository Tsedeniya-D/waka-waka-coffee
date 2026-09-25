import { unwrap } from '../utils/dbError.js'
import { AppError } from '../utils/AppError.js'
import { canonicalRole, isAdminRole } from '../config/permissions.js'

/**
 * Status transitions come from public.workflow_transitions, the same table the
 * database triggers enforce. The API validates early (clear 409/403 errors,
 * no half-done work) and exposes the rules so the UI only offers valid moves.
 */
const CACHE_MS = 60_000
let cache = { at: 0, rows: null }

export async function loadTransitions(db, { fresh = false } = {}) {
  if (!fresh && cache.rows && Date.now() - cache.at < CACHE_MS) return cache.rows
  const rows = unwrap(
    await db
      .from('workflow_transitions')
      .select('entity, from_status, to_status, roles, is_manual, label')
      .order('entity')
      .order('from_status'),
    'Loading workflow rules'
  )
  cache = { at: Date.now(), rows }
  return rows
}

/** Test hook */
export function _setTransitionsForTest(rows) {
  cache = { at: Date.now(), rows }
}

function roleAllowed(role, rule) {
  return isAdminRole(role) || rule.roles.includes(canonicalRole(role))
}

/** Transitions the role may perform manually from `from`. */
export async function nextStatuses(db, role, entity, from) {
  const rows = await loadTransitions(db)
  return rows.filter((r) => r.entity === entity && r.from_status === from && r.is_manual && roleAllowed(role, r))
}

/**
 * Throw a user-facing error unless `role` may move `entity` from -> to.
 * @param {'quote_request'|'sample_request'|'sales_order'|'export_batch'|'shipment'|'collection'|'coffee_lot'} entity
 */
export async function assertTransition(db, role, entity, from, to) {
  if (from === to) return
  const label = entity.replace(/_/g, ' ')
  const rows = await loadTransitions(db)
  const rule = rows.find((r) => r.entity === entity && r.from_status === from && r.to_status === to)
  if (!rule) {
    const options = rows
      .filter((r) => r.entity === entity && r.from_status === from && r.is_manual && roleAllowed(role, r))
      .map((r) => r.to_status)
    throw new AppError(409, `A ${label} cannot move from "${from}" to "${to}".`, {
      code: 'INVALID_TRANSITION',
      details: { from, to, allowed: options },
    })
  }
  if (!rule.is_manual) {
    throw new AppError(409, `The ${label} status "${to}" is set automatically by the workflow.`, {
      code: 'INVALID_TRANSITION',
    })
  }
  if (!roleAllowed(role, rule)) {
    throw AppError.forbidden(`Your role cannot move a ${label} from "${from}" to "${to}".`)
  }
}

/** Rules grouped for the UI: { entity: [{ from_status, to_status, label, allowed }] } */
export async function describeTransitions(db, role) {
  const rows = await loadTransitions(db)
  const out = {}
  for (const r of rows) {
    if (!r.is_manual) continue
    ;(out[r.entity] ??= []).push({
      from_status: r.from_status,
      to_status: r.to_status,
      label: r.label,
      allowed: roleAllowed(role, r),
    })
  }
  return out
}
