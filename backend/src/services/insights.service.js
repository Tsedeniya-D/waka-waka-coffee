import { attachProfiles } from '../lib/profiles.js'
import { rpc, runList } from '../lib/query.js'
import { isAdminRole } from '../config/permissions.js'
import { unwrap } from '../utils/dbError.js'
import { AppError } from '../utils/AppError.js'

// -----------------------------------------------------------------------------
// Traceability (database functions walk the real FK chain)
// -----------------------------------------------------------------------------
export async function traceOverview(db, { search, page = 1, limit = 50 }) {
  const result = await rpc(
    db,
    'trace_overview',
    { p_search: search ?? null, p_limit: limit, p_offset: (page - 1) * limit },
    'Loading traceability'
  )
  return { rows: result.rows, count: Number(result.total), page, limit }
}

export const traceSearch = (db, q) => rpc(db, 'trace_search', { p_query: q }, 'Searching')
export const traceLot = (db, id) => rpc(db, 'trace_lot', { p_lot_id: id }, 'Tracing lot')
export const traceShipment = (db, id) => rpc(db, 'trace_shipment', { p_shipment_id: id }, 'Tracing shipment')

// -----------------------------------------------------------------------------
// Notifications (always the caller's own; RLS enforces it too)
// -----------------------------------------------------------------------------
export function listNotifications(db, userId, q) {
  const eq = { user_id: userId, type: q.type }
  if (q.filter === 'unread') eq.is_read = false
  if (q.filter === 'read') eq.is_read = true
  return runList(
    db.from('notifications').select('*', { count: 'exact' }),
    { ...q, eq, searchColumns: ['title', 'message', 'type'] },
    'Loading notifications'
  )
}

export async function unreadCount(db, userId) {
  const { count, error } = await db
    .from('notifications')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('is_read', false)
  if (error) unwrap({ error })
  return { unread: count ?? 0 }
}

export async function setRead(db, userId, id, isRead) {
  const rows = unwrap(
    await db.from('notifications').update({ is_read: isRead }).eq('id', id).eq('user_id', userId).select('*'),
    'Updating notification'
  )
  if (!rows.length) throw AppError.notFound('Notification not found.')
  return rows[0]
}

export async function markAllRead(db, userId) {
  const rows = unwrap(
    await db.from('notifications').update({ is_read: true }).eq('user_id', userId).eq('is_read', false).select('id'),
    'Updating notifications'
  )
  return { updated: rows.length }
}

export async function removeNotification(db, userId, id) {
  const rows = unwrap(
    await db.from('notifications').delete().eq('id', id).eq('user_id', userId).select('id'),
    'Deleting notification'
  )
  if (!rows.length) throw AppError.notFound('Notification not found.')
}

export async function broadcast(db, { title, message, roles, user_ids }) {
  const sent = await rpc(
    db,
    'broadcast_notification',
    { p_title: title, p_message: message, p_roles: roles ?? null, p_user_ids: user_ids ?? null },
    'Sending notification'
  )
  return { sent }
}

// -----------------------------------------------------------------------------
// Reports & dashboard (numbers computed in the database with the caller's RLS)
// -----------------------------------------------------------------------------
export const reportSummary = (db, { from, to }) =>
  rpc(db, 'report_summary', { p_from: from ?? null, p_to: to ?? null }, 'Building report')

export async function dashboard(db, auth) {
  const [summary, notifications, activity] = await Promise.all([
    rpc(db, 'dashboard_summary', {}, 'Loading dashboard'),
    db
      .from('notifications')
      .select('id, type, title, message, related_type, related_id, is_read, created_at')
      .eq('user_id', auth.userId)
      .order('created_at', { ascending: false })
      .limit(6),
    isAdminRole(auth.role)
      ? db.from('activity_logs').select('*').order('created_at', { ascending: false }).limit(12)
      : Promise.resolve({ data: [], error: null }),
  ])
  const activityRows = unwrap(activity, 'Loading recent activity')
  await attachProfiles(db, activityRows, [['user_id', 'user']])
  return {
    summary,
    recent_notifications: unwrap(notifications, 'Loading notifications'),
    recent_activity: activityRows,
  }
}

export async function activityLogs(db, q) {
  const result = await runList(
    db.from('activity_logs').select('*', { count: 'exact' }),
    {
      ...q,
      eq: { entity_type: q.entity_type, entity_id: q.entity_id, user_id: q.user_id, action: q.action },
      range: { column: 'created_at', from: q.from, to: q.to },
    },
    'Loading activity'
  )
  await attachProfiles(db, result.rows, [['user_id', 'user']])
  return result
}
