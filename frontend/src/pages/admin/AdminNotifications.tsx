import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { useDebounce } from '../../hooks'
import { EMPLOYEE_ROLES, roleLabel } from '../../lib/permissions'
import { useNotificationActions, useNotifications, useUnreadCount } from '../../queries/admin'
import type { Notification, UserRole } from '../../types'
import { EmptyState, ErrorState, formatDateTime, LoadingState, Pagination, prettyStatus, useConfirm, useFlash } from '../../components/admin/ui'

type FilterType = 'all' | 'unread' | 'read'

const PAGE_SIZE = 25

/** Where "Open related" goes for each notifications.related_type. */
const RELATED_ROUTES: Record<string, string> = {
  sales_order: '/admin/orders',
  order: '/admin/orders',
  quote_request: '/admin/quote-requests',
  sample_request: '/admin/sample-requests',
  contact_message: '/admin/contact-messages',
  shipment: '/admin/shipments',
  document: '/admin/documents',
  quality: '/admin/quality',
  lot: '/admin/lots',
  export_batch: '/admin/export-batches',
}

export default function AdminNotifications() {
  const navigate = useNavigate()
  const { isAdmin } = useAuth()
  const flash = useFlash()
  const { confirm, dialog } = useConfirm()
  const actions = useNotificationActions()

  const [filter, setFilter] = useState<FilterType>('all')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [processingId, setProcessingId] = useState<string | null>(null)
  const debouncedSearch = useDebounce(search.trim(), { delay: 400 })

  const listQuery = useNotifications({
    filter,
    search: debouncedSearch || undefined,
    page,
    limit: PAGE_SIZE,
  })
  const totalQuery = useNotifications({ filter: 'all', limit: 1 })
  const unreadQuery = useUnreadCount()

  const notifications = listQuery.data?.data ?? []
  const meta = listQuery.data?.meta
  const totalCount = totalQuery.data?.meta.total ?? 0
  const unreadCount = unreadQuery.data?.unread ?? 0

  function refresh() {
    listQuery.refetch()
    totalQuery.refetch()
    unreadQuery.refetch()
  }

  async function setRead(notification: Notification, isRead: boolean) {
    setProcessingId(notification.id)
    try {
      await actions.setRead.mutateAsync({ id: notification.id, is_read: isRead })
    } catch (err) {
      flash.error(err)
    } finally {
      setProcessingId(null)
    }
  }

  async function markAllAsRead() {
    try {
      const result = await actions.markAllRead.mutateAsync(undefined)
      flash.success(result.updated ? `${result.updated} notification${result.updated === 1 ? '' : 's'} marked as read.` : 'Everything is already read.')
    } catch (err) {
      flash.error(err)
    }
  }

  async function deleteNotification(notification: Notification) {
    const ok = await confirm({
      title: 'Delete notification?',
      message: `"${notification.title}" will be removed from your inbox.`,
      danger: true,
      confirmLabel: 'Delete',
    })
    if (!ok) return
    setProcessingId(notification.id)
    try {
      await actions.remove.mutateAsync(notification.id)
      flash.success('Notification deleted.')
    } catch (err) {
      flash.error(err)
    } finally {
      setProcessingId(null)
    }
  }

  async function openRelatedRecord(notification: Notification) {
    const route = notification.related_type ? RELATED_ROUTES[notification.related_type] : undefined
    if (!route) return
    if (!notification.is_read) {
      try {
        await actions.setRead.mutateAsync({ id: notification.id, is_read: true })
      } catch {
        // Opening the record matters more than the read flag; ignore.
      }
    }
    navigate(route)
  }

  function changeFilter(value: FilterType) {
    setFilter(value)
    setPage(1)
  }

  return (
    <div className="space-y-6">
      {dialog}

      {/* Header */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Notifications</h1>

          <p className="mt-1 text-sm text-gray-500">View and manage your system notifications.</p>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={markAllAsRead}
            disabled={unreadCount === 0 || actions.markAllRead.isPending}
            className="rounded-lg bg-black px-4 py-2.5 text-sm font-medium text-white hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {actions.markAllRead.isPending ? 'Updating...' : 'Mark All Read'}
          </button>

          <button
            type="button"
            onClick={refresh}
            disabled={listQuery.isFetching}
            className="rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            {listQuery.isFetching ? 'Refreshing...' : 'Refresh'}
          </button>
        </div>
      </div>

      {/* Messages */}
      {flash.banner}

      {/* Summary */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <SummaryCard label="Total Notifications" value={totalCount} />

        <SummaryCard label="Unread" value={unreadCount} />

        <SummaryCard label="Read" value={Math.max(0, totalCount - unreadCount)} />
      </div>

      {isAdmin && <BroadcastForm onSent={(msg) => flash.success(msg)} onError={(err) => flash.error(err)} />}

      {/* Filters */}
      <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
        <div className="flex flex-col gap-4 md:flex-row">
          <div className="flex-1">
            <input
              type="text"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value)
                setPage(1)
              }}
              placeholder="Search notifications..."
              className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm outline-none focus:border-black"
            />
          </div>

          <div className="flex gap-2">
            {(['all', 'unread', 'read'] as FilterType[]).map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => changeFilter(value)}
                className={`rounded-lg px-4 py-2.5 text-sm font-medium ${
                  filter === value ? 'bg-black text-white' : 'border border-gray-300 bg-white text-gray-700 hover:bg-gray-50'
                }`}
              >
                {value.charAt(0).toUpperCase() + value.slice(1)}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Notification List */}
      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        {listQuery.isLoading ? (
          <LoadingState label="Loading notifications..." />
        ) : listQuery.isError ? (
          <ErrorState error={listQuery.error} onRetry={() => listQuery.refetch()} />
        ) : notifications.length === 0 ? (
          <EmptyState
            title="No notifications found"
            description={search || filter !== 'all' ? 'Try changing your search or filter.' : 'You do not have any notifications yet.'}
          />
        ) : (
          <>
            <div className="divide-y divide-gray-200">
              {notifications.map((notification) => {
                const busy = processingId === notification.id
                const canOpen = Boolean(notification.related_type && notification.related_id && RELATED_ROUTES[notification.related_type])
                return (
                  <div key={notification.id} className={`p-5 transition ${notification.is_read ? 'bg-white' : 'bg-gray-50'}`}>
                    <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                      <div className="flex min-w-0 gap-4">
                        <div className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-full ${notification.is_read ? 'bg-gray-300' : 'bg-black'}`} />

                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <h3 className={`text-sm ${notification.is_read ? 'font-medium text-gray-800' : 'font-semibold text-gray-900'}`}>
                              {notification.title}
                            </h3>

                            <span className="rounded-full bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-600">
                              {prettyStatus(notification.type)}
                            </span>

                            {!notification.is_read && (
                              <span className="rounded-full bg-black px-2.5 py-1 text-xs font-medium text-white">New</span>
                            )}
                          </div>

                          <p className="mt-2 whitespace-pre-line text-sm leading-6 text-gray-600">{notification.message}</p>

                          <p className="mt-2 text-xs text-gray-400">{formatDateTime(notification.created_at)}</p>
                        </div>
                      </div>

                      <div className="flex shrink-0 flex-wrap gap-2 md:justify-end">
                        {canOpen && (
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => openRelatedRecord(notification)}
                            className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                          >
                            Open Related
                          </button>
                        )}

                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => setRead(notification, !notification.is_read)}
                          className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          {notification.is_read ? 'Mark Unread' : 'Mark Read'}
                        </button>

                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => deleteNotification(notification)}
                          className="rounded-lg border border-red-200 bg-white px-3 py-2 text-xs font-medium text-red-600 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
            {meta && <Pagination page={page} limit={PAGE_SIZE} total={meta.total} onPage={setPage} />}
          </>
        )}
      </div>
    </div>
  )
}

/** Admin-only: send a system notification to every active user in the chosen roles. */
function BroadcastForm({ onSent, onError }: { onSent: (message: string) => void; onError: (err: unknown) => void }) {
  const { broadcast } = useNotificationActions()
  const [open, setOpen] = useState(false)
  const [title, setTitle] = useState('')
  const [message, setMessage] = useState('')
  const [roles, setRoles] = useState<UserRole[]>([])
  const [formError, setFormError] = useState('')

  function toggleRole(role: UserRole) {
    setRoles((current) => (current.includes(role) ? current.filter((r) => r !== role) : [...current, role]))
  }

  async function submit(e: FormEvent) {
    e.preventDefault()
    setFormError('')
    if (!title.trim()) return setFormError('Title is required.')
    if (!message.trim()) return setFormError('Message is required.')
    if (!roles.length) return setFormError('Choose at least one role.')
    try {
      const result = await broadcast.mutateAsync({ title: title.trim(), message: message.trim(), roles })
      onSent(`Notification sent to ${result.sent} ${result.sent === 1 ? 'person' : 'people'}.`)
      setTitle('')
      setMessage('')
      setRoles([])
      setOpen(false)
    } catch (err) {
      onError(err)
    }
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-gray-900">Send system notification</h2>
          <p className="text-xs text-gray-500">Delivered to every active employee in the selected roles.</p>
        </div>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-xs font-medium text-gray-700 hover:bg-gray-50"
        >
          {open ? 'Close' : 'New notification'}
        </button>
      </div>

      {open && (
        <form onSubmit={submit} className="mt-4 space-y-4">
          {formError && <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{formError}</div>}
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700">Title *</label>
            <input
              type="text"
              value={title}
              maxLength={160}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm outline-none focus:border-black"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700">Message *</label>
            <textarea
              rows={3}
              value={message}
              maxLength={2000}
              onChange={(e) => setMessage(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm outline-none focus:border-black"
            />
          </div>
          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <span className="text-sm font-medium text-gray-700">Target roles *</span>
              <button
                type="button"
                onClick={() => setRoles(roles.length === EMPLOYEE_ROLES.length ? [] : [...EMPLOYEE_ROLES] as UserRole[])}
                className="text-xs font-medium text-gray-600 hover:text-gray-900"
              >
                {roles.length === EMPLOYEE_ROLES.length ? 'Clear all' : 'Select all'}
              </button>
            </div>
            <div className="flex flex-wrap gap-2">
              {EMPLOYEE_ROLES.map((r) => {
                const role = r as UserRole
                const active = roles.includes(role)
                return (
                  <button
                    key={r}
                    type="button"
                    onClick={() => toggleRole(role)}
                    aria-pressed={active}
                    className={`rounded-lg px-3 py-2 text-xs font-medium ${
                      active ? 'bg-black text-white' : 'border border-gray-300 bg-white text-gray-700 hover:bg-gray-50'
                    }`}
                  >
                    {roleLabel(r)}
                  </button>
                )
              })}
            </div>
          </div>
          <div className="flex justify-end">
            <button
              type="submit"
              disabled={broadcast.isPending}
              className="rounded-lg bg-black px-4 py-2.5 text-sm font-medium text-white hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {broadcast.isPending ? 'Sending...' : 'Send notification'}
            </button>
          </div>
        </form>
      )}
    </div>
  )
}

function SummaryCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <p className="text-sm text-gray-500">{label}</p>
      <p className="mt-2 text-2xl font-bold text-gray-900">{value.toLocaleString()}</p>
    </div>
  )
}
