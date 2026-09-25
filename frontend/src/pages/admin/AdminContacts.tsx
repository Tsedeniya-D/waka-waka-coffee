import { useState } from 'react'
import { useAuth } from '../../contexts/AuthContext'
import { useDebounce } from '../../hooks'
import { downloadCsv } from '../../lib/api'
import {
  useContactActions,
  useContactMessages,
  useDirectory,
  useNewsletterActions,
  useNewsletterSubscribers,
} from '../../queries/admin'
import { useConfirm, useFlash } from '../../components/admin/ui'
import type { ContactMessage, ContactStatus, NewsletterSubscriber } from '../../types'

type Tab = 'messages' | 'newsletter'

const STATUS_FILTERS: { key: string; label: string; status: string }[] = [
  { key: 'open', label: 'Open', status: 'new,read,replied' },
  { key: 'new', label: 'New', status: 'new' },
  { key: 'read', label: 'Read', status: 'read' },
  { key: 'replied', label: 'Replied', status: 'replied' },
  { key: 'closed', label: 'Archived', status: 'closed' },
  { key: 'all', label: 'All', status: '' },
]

const STATUS_CLASS: Record<ContactStatus, string> = {
  new: 'bg-amber-100 text-amber-900',
  read: 'bg-stone-100 text-stone-700',
  replied: 'bg-green-100 text-green-800',
  closed: 'bg-stone-200 text-stone-500',
}

const AdminContacts = () => {
  const [tab, setTab] = useState<Tab>('messages')

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-stone-900">Contact Messages</h1>
        <p className="text-sm text-stone-500 mt-1">Messages submitted via the public contact form, and newsletter subscribers.</p>
      </div>

      <div className="mb-5 flex gap-2 border-b border-stone-200">
        {(
          [
            ['messages', 'Messages'],
            ['newsletter', 'Newsletter subscribers'],
          ] as [Tab, string][]
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            className={[
              '-mb-px px-3 py-2 text-sm border-b-2',
              tab === key ? 'border-stone-900 text-stone-900 font-medium' : 'border-transparent text-stone-500 hover:text-stone-800',
            ].join(' ')}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'messages' ? <MessagesSection /> : <NewsletterSection />}
    </div>
  )
}

// -----------------------------------------------------------------------------
// Contact messages
// -----------------------------------------------------------------------------
function MessagesSection() {
  const { can, isAdmin } = useAuth()
  const canUpdate = can('contact_messages', 'update')
  const [filter, setFilter] = useState('open')
  const [search, setSearch] = useState('')
  const debounced = useDebounce(search, { delay: 350 })
  const status = STATUS_FILTERS.find((f) => f.key === filter)?.status ?? ''

  const { data, isLoading, error, refetch, isFetching } = useContactMessages({
    status: status || undefined,
    search: debounced.trim() || undefined,
    limit: 200,
  })
  const items = data?.data ?? []
  const total = data?.meta.total ?? 0

  const actions = useContactActions()
  const directory = useDirectory(['sales', 'admin', 'super_admin'])
  const flash = useFlash()
  const { confirm, dialog } = useConfirm()
  const [busyId, setBusyId] = useState<string | null>(null)
  const [notesId, setNotesId] = useState<string | null>(null)
  const [notesDraft, setNotesDraft] = useState('')

  const update = async (m: ContactMessage, body: Record<string, unknown>, success: string) => {
    setBusyId(m.id)
    try {
      await actions.update.mutateAsync({ id: m.id, body })
      flash.success(success)
      return true
    } catch (err) {
      flash.error(err)
      return false
    } finally {
      setBusyId(null)
    }
  }

  const archive = async (m: ContactMessage) => {
    const ok = await confirm({ title: 'Archive this message?', message: 'It will move to the Archived filter.', confirmLabel: 'Archive' })
    if (ok) await update(m, { status: 'closed' }, 'Message archived.')
  }

  const remove = async (m: ContactMessage) => {
    const ok = await confirm({
      title: 'Delete this message?',
      message: `The message from ${m.name || m.email} will be permanently deleted.`,
      confirmLabel: 'Delete',
      danger: true,
    })
    if (!ok) return
    setBusyId(m.id)
    try {
      await actions.remove.mutateAsync(m.id)
      flash.success('Message deleted.')
    } catch (err) {
      flash.error(err)
    } finally {
      setBusyId(null)
    }
  }

  const saveNotes = async (m: ContactMessage) => {
    const ok = await update(m, { admin_notes: notesDraft.trim() || null }, 'Notes saved.')
    if (ok) setNotesId(null)
  }

  return (
    <div>
      {dialog}
      {flash.banner && <div className="mb-4">{flash.banner}</div>}

      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap gap-2">
          {STATUS_FILTERS.map((f) => (
            <button
              key={f.key}
              type="button"
              onClick={() => setFilter(f.key)}
              className={[
                'px-3 py-1.5 text-sm border',
                filter === f.key ? 'bg-stone-900 text-white border-stone-900' : 'border-stone-300 text-stone-700 bg-white',
              ].join(' ')}
            >
              {f.label}
            </button>
          ))}
        </div>
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search name, email, subject…"
          className="w-full sm:w-72 border border-stone-300 bg-white px-3 py-2 text-sm outline-none focus:border-stone-900"
        />
      </div>

      {isLoading ? (
        <div className="text-sm text-stone-500">Loading messages…</div>
      ) : error ? (
        <div className="border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {error instanceof Error ? error.message : 'Failed to load messages'}
          <button type="button" onClick={() => refetch()} className="ml-3 underline">
            Try again
          </button>
        </div>
      ) : items.length === 0 ? (
        <div className="border border-stone-200 bg-white p-6 text-sm text-stone-600">
          {debounced || filter !== 'open' ? 'No messages match this filter.' : 'No open messages.'}
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-xs text-stone-500">
            {total} message{total === 1 ? '' : 's'}
            {isFetching ? ' · refreshing…' : ''}
          </p>
          {items.map((m) => {
            const busy = busyId === m.id
            return (
              <div key={m.id} className="border border-stone-200 bg-white p-4">
                <div className="flex justify-between items-start gap-3">
                  <div className="min-w-0">
                    <h3 className="font-semibold text-stone-900">{m.name || 'Unnamed sender'}</h3>
                    <p className="text-sm text-stone-500">
                      {m.email}
                      {m.phone ? ` • ${m.phone}` : ''}
                      {m.company ? ` • ${m.company}` : ''}
                      {m.country ? ` • ${m.country}` : ''}
                    </p>
                    {m.subject && <p className="mt-1 text-sm font-medium text-stone-800">{m.subject}</p>}
                  </div>
                  <div className="text-right shrink-0">
                    <span className={['inline-block text-xs px-2 py-1', STATUS_CLASS[m.status] ?? 'bg-stone-100 text-stone-700'].join(' ')}>
                      {m.status === 'closed' ? 'archived' : m.status}
                    </span>
                    <p className="text-xs text-stone-400 mt-2">{m.created_at ? new Date(m.created_at).toLocaleString() : '—'}</p>
                  </div>
                </div>
                <p className="mt-3 text-sm text-stone-700 whitespace-pre-wrap">{m.message}</p>

                <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-stone-500">
                  <span>Assigned to:</span>
                  {canUpdate ? (
                    <select
                      value={m.assigned_to ?? ''}
                      disabled={busy || directory.isLoading}
                      onChange={(e) => update(m, { assigned_to: e.target.value || null }, 'Assignment updated.')}
                      className="border border-stone-300 bg-white px-2 py-1 text-xs text-stone-700"
                    >
                      <option value="">Unassigned</option>
                      {(directory.data ?? []).map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.full_name || p.email || p.id}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <span className="text-stone-700">{m.assigned?.full_name ?? 'Unassigned'}</span>
                  )}
                </div>

                {notesId === m.id ? (
                  <div className="mt-3">
                    <textarea
                      rows={3}
                      value={notesDraft}
                      onChange={(e) => setNotesDraft(e.target.value)}
                      maxLength={4000}
                      placeholder="Internal notes (not visible to the sender)"
                      className="w-full border border-stone-300 px-3 py-2 text-sm outline-none focus:border-stone-900"
                    />
                    <div className="mt-2 flex gap-2">
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => saveNotes(m)}
                        className="px-3 py-2 bg-stone-900 text-white text-sm disabled:opacity-50"
                      >
                        {busy ? 'Saving…' : 'Save notes'}
                      </button>
                      <button type="button" onClick={() => setNotesId(null)} className="px-3 py-2 border border-stone-300 text-sm">
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  m.admin_notes && (
                    <div className="mt-3 border-l-2 border-stone-300 bg-stone-50 px-3 py-2 text-sm text-stone-700 whitespace-pre-wrap">
                      <span className="block text-xs font-medium uppercase tracking-wide text-stone-500 mb-1">Notes</span>
                      {m.admin_notes}
                    </div>
                  )
                )}

                {(canUpdate || isAdmin) && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {canUpdate && m.status === 'new' && (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => update(m, { status: 'read' }, 'Marked as read.')}
                        className="px-3 py-2 bg-stone-900 text-white text-sm disabled:opacity-50"
                      >
                        Mark as read
                      </button>
                    )}
                    {canUpdate && (m.status === 'new' || m.status === 'read') && (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => update(m, { status: 'replied' }, 'Marked as replied.')}
                        className="px-3 py-2 border border-stone-300 text-sm disabled:opacity-50"
                      >
                        Mark as replied
                      </button>
                    )}
                    {canUpdate && m.status !== 'closed' && (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => archive(m)}
                        className="px-3 py-2 border border-stone-300 text-sm disabled:opacity-50"
                      >
                        Archive
                      </button>
                    )}
                    {canUpdate && m.status === 'closed' && (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => update(m, { status: 'read' }, 'Message reopened.')}
                        className="px-3 py-2 border border-stone-300 text-sm disabled:opacity-50"
                      >
                        Reopen
                      </button>
                    )}
                    {canUpdate && notesId !== m.id && (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => {
                          setNotesId(m.id)
                          setNotesDraft(m.admin_notes ?? '')
                        }}
                        className="px-3 py-2 border border-stone-300 text-sm disabled:opacity-50"
                      >
                        {m.admin_notes ? 'Edit notes' : 'Add notes'}
                      </button>
                    )}
                    {isAdmin && (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => remove(m)}
                        className="px-3 py-2 border border-red-300 text-red-700 text-sm disabled:opacity-50"
                      >
                        Delete
                      </button>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// -----------------------------------------------------------------------------
// Newsletter subscribers
// -----------------------------------------------------------------------------
function NewsletterSection() {
  const { can, isAdmin } = useAuth()
  // The API guards subscriber changes with the contact_messages "delete" permission.
  const canManage = can('contact_messages', 'delete')
  const [active, setActive] = useState<'all' | 'true' | 'false'>('all')
  const [search, setSearch] = useState('')
  const debounced = useDebounce(search, { delay: 350 })
  const { data, isLoading, error, refetch } = useNewsletterSubscribers({
    active: active === 'all' ? undefined : active,
    search: debounced.trim() || undefined,
    limit: 500,
  })
  const rows = data?.data ?? []
  const total = data?.meta.total ?? 0
  const actions = useNewsletterActions()
  const flash = useFlash()
  const { confirm, dialog } = useConfirm()
  const [busyId, setBusyId] = useState<string | null>(null)

  const toggle = async (s: NewsletterSubscriber) => {
    setBusyId(s.id)
    try {
      await actions.setActive.mutateAsync({ id: s.id, is_active: !s.is_active })
      flash.success(s.is_active ? `${s.email} unsubscribed.` : `${s.email} re-activated.`)
    } catch (err) {
      flash.error(err)
    } finally {
      setBusyId(null)
    }
  }

  const remove = async (s: NewsletterSubscriber) => {
    const ok = await confirm({ title: 'Delete subscriber?', message: `${s.email} will be permanently removed.`, confirmLabel: 'Delete', danger: true })
    if (!ok) return
    setBusyId(s.id)
    try {
      await actions.remove.mutateAsync(s.id)
      flash.success('Subscriber deleted.')
    } catch (err) {
      flash.error(err)
    } finally {
      setBusyId(null)
    }
  }

  const exportCsv = () => {
    downloadCsv(
      `newsletter-subscribers-${new Date().toISOString().slice(0, 10)}.csv`,
      ['Email', 'Active', 'Source', 'Subscribed at', 'Unsubscribed at'],
      rows.map((s) => [s.email, s.is_active ? 'yes' : 'no', s.source, s.subscribed_at, s.unsubscribed_at])
    )
  }

  return (
    <div>
      {dialog}
      {flash.banner && <div className="mb-4">{flash.banner}</div>}

      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap gap-2">
          {(
            [
              ['all', 'All'],
              ['true', 'Active'],
              ['false', 'Unsubscribed'],
            ] as ['all' | 'true' | 'false', string][]
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setActive(key)}
              className={[
                'px-3 py-1.5 text-sm border',
                active === key ? 'bg-stone-900 text-white border-stone-900' : 'border-stone-300 text-stone-700 bg-white',
              ].join(' ')}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search email…"
            className="w-full sm:w-60 border border-stone-300 bg-white px-3 py-2 text-sm outline-none focus:border-stone-900"
          />
          <button
            type="button"
            disabled={!rows.length}
            onClick={exportCsv}
            className="shrink-0 px-3 py-2 border border-stone-300 bg-white text-sm disabled:opacity-50"
          >
            Export CSV
          </button>
        </div>
      </div>

      {isLoading ? (
        <div className="text-sm text-stone-500">Loading subscribers…</div>
      ) : error ? (
        <div className="border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {error instanceof Error ? error.message : 'Failed to load subscribers'}
          <button type="button" onClick={() => refetch()} className="ml-3 underline">
            Try again
          </button>
        </div>
      ) : rows.length === 0 ? (
        <div className="border border-stone-200 bg-white p-6 text-sm text-stone-600">No subscribers found.</div>
      ) : (
        <div className="border border-stone-200 bg-white overflow-x-auto">
          <p className="px-4 py-2 text-xs text-stone-500 border-b border-stone-200">
            {total} subscriber{total === 1 ? '' : 's'}
          </p>
          <table className="min-w-full text-sm">
            <thead className="bg-stone-50 text-left text-xs uppercase tracking-wide text-stone-500">
              <tr>
                <th className="px-4 py-2">Email</th>
                <th className="px-4 py-2">Status</th>
                <th className="px-4 py-2">Source</th>
                <th className="px-4 py-2">Subscribed</th>
                {canManage && <th className="px-4 py-2 text-right">Actions</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {rows.map((s) => (
                <tr key={s.id}>
                  <td className="px-4 py-2 text-stone-900">{s.email}</td>
                  <td className="px-4 py-2">
                    <span className={['inline-block text-xs px-2 py-1', s.is_active ? 'bg-green-100 text-green-800' : 'bg-stone-100 text-stone-600'].join(' ')}>
                      {s.is_active ? 'active' : 'unsubscribed'}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-stone-600">{s.source || '—'}</td>
                  <td className="px-4 py-2 text-stone-600">{s.subscribed_at ? new Date(s.subscribed_at).toLocaleDateString() : '—'}</td>
                  {canManage && (
                    <td className="px-4 py-2 text-right whitespace-nowrap">
                      <button
                        type="button"
                        disabled={busyId === s.id}
                        onClick={() => toggle(s)}
                        className="px-2.5 py-1 border border-stone-300 text-xs disabled:opacity-50"
                      >
                        {s.is_active ? 'Deactivate' : 'Activate'}
                      </button>
                      {isAdmin && (
                        <button
                          type="button"
                          disabled={busyId === s.id}
                          onClick={() => remove(s)}
                          className="ml-2 px-2.5 py-1 border border-red-300 text-red-700 text-xs disabled:opacity-50"
                        >
                          Delete
                        </button>
                      )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

export default AdminContacts
