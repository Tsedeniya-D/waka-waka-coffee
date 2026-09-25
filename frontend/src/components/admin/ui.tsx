/**
 * Small shared building blocks for the admin pages. They follow the existing
 * admin styling (neutral grays, rounded-xl cards, black primary buttons).
 */
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { errorMessage } from '../../lib/api'
import { useNextStatuses } from '../../queries/admin'
import type { WorkflowEntity } from '../../types'

// -----------------------------------------------------------------------------
// Formatting
// -----------------------------------------------------------------------------
export function prettyStatus(value: string | null | undefined): string {
  if (!value) return '-'
  return value.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

export function formatDate(value: string | null | undefined): string {
  if (!value) return '-'
  const d = new Date(value.length === 10 ? `${value}T00:00:00` : value)
  return Number.isNaN(d.getTime()) ? '-' : d.toLocaleDateString()
}

export function formatDateTime(value: string | null | undefined): string {
  if (!value) return '-'
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? '-' : d.toLocaleString()
}

export function formatKg(value: number | string | null | undefined): string {
  if (value === null || value === undefined || value === '') return '-'
  return `${Number(value).toLocaleString(undefined, { maximumFractionDigits: 2 })} kg`
}

export function formatMoney(value: number | string | null | undefined, currency?: string | null): string {
  if (value === null || value === undefined || value === '') return '-'
  const n = Number(value)
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency: currency || 'USD', maximumFractionDigits: 2 }).format(n)
  } catch {
    return `${n.toLocaleString()} ${currency ?? ''}`.trim()
  }
}

// -----------------------------------------------------------------------------
// Status badge
// -----------------------------------------------------------------------------
const GREEN = ['active', 'approved', 'passed', 'accepted', 'completed', 'delivered', 'converted', 'export_accepted', 'available', 'in_warehouse', 'arrived', 'processed', 'verified', 'replied', 'subscribed']
const BLUE = ['reviewing', 'contacted', 'quoted', 'confirmed', 'processing', 'preparing', 'booked', 'ready', 'in_transit', 'dispatched', 'reserved', 'partially_processed', 'read']
const AMBER = ['new', 'pending', 'pending_quality', 'sent_to_export', 'submitted', 'draft', 'unread']
const RED = ['rejected', 'failed', 'cancelled', 'inactive', 'depleted', 'closed']
const PURPLE = ['shipped', 'sold']

export function statusTone(status: string | null | undefined): string {
  const s = status ?? ''
  if (GREEN.includes(s)) return 'bg-green-50 text-green-700 ring-green-600/20'
  if (BLUE.includes(s)) return 'bg-blue-50 text-blue-700 ring-blue-600/20'
  if (AMBER.includes(s)) return 'bg-amber-50 text-amber-800 ring-amber-600/20'
  if (RED.includes(s)) return 'bg-red-50 text-red-700 ring-red-600/20'
  if (PURPLE.includes(s)) return 'bg-purple-50 text-purple-700 ring-purple-600/20'
  return 'bg-gray-100 text-gray-700 ring-gray-500/20'
}

export function StatusBadge({ status, label }: { status: string | null | undefined; label?: string }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset ${statusTone(status)}`}>
      {label ?? prettyStatus(status)}
    </span>
  )
}

// -----------------------------------------------------------------------------
// Feedback & states
// -----------------------------------------------------------------------------
export function Alert({
  type = 'error',
  children,
  onClose,
}: {
  type?: 'error' | 'success' | 'info' | 'warning'
  children: ReactNode
  onClose?: () => void
}) {
  const tone = {
    error: 'border-red-200 bg-red-50 text-red-700',
    success: 'border-green-200 bg-green-50 text-green-700',
    info: 'border-blue-200 bg-blue-50 text-blue-700',
    warning: 'border-amber-200 bg-amber-50 text-amber-800',
  }[type]
  return (
    <div role={type === 'error' ? 'alert' : 'status'} className={`flex items-start justify-between gap-3 rounded-lg border px-4 py-3 text-sm ${tone}`}>
      <div className="min-w-0">{children}</div>
      {onClose && (
        <button type="button" onClick={onClose} className="shrink-0 text-xs font-medium opacity-70 hover:opacity-100" aria-label="Dismiss">
          ✕
        </button>
      )}
    </div>
  )
}

/** Success / error banner state with auto-dismiss for success messages. */
export function useFlash() {
  const [flash, setFlash] = useState<{ type: 'success' | 'error'; message: string } | null>(null)
  useEffect(() => {
    if (flash?.type !== 'success') return
    const t = setTimeout(() => setFlash(null), 5000)
    return () => clearTimeout(t)
  }, [flash])
  const success = useCallback((message: string) => setFlash({ type: 'success', message }), [])
  const error = useCallback((err: unknown, fallback?: string) => setFlash({ type: 'error', message: errorMessage(err, fallback) }), [])
  const banner = flash ? (
    <Alert type={flash.type} onClose={() => setFlash(null)}>
      {flash.message}
    </Alert>
  ) : null
  return { flash, success, error, clear: () => setFlash(null), banner }
}

export function LoadingState({ label = 'Loading…' }: { label?: string }) {
  return <div className="px-6 py-12 text-center text-sm text-gray-500">{label}</div>
}

export function EmptyState({ title, description, action }: { title: string; description?: string; action?: ReactNode }) {
  return (
    <div className="px-6 py-12 text-center">
      <p className="text-sm font-medium text-gray-700">{title}</p>
      {description && <p className="mt-1 text-sm text-gray-500">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}

export function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  return (
    <div className="px-6 py-10 text-center">
      <p className="text-sm font-medium text-red-700">{errorMessage(error, 'Could not load data.')}</p>
      {onRetry && (
        <button type="button" onClick={onRetry} className="mt-3 rounded-lg border border-gray-300 bg-white px-3 py-2 text-xs font-medium text-gray-700 hover:bg-gray-50">
          Try again
        </button>
      )}
    </div>
  )
}

// -----------------------------------------------------------------------------
// Modal & confirmation
// -----------------------------------------------------------------------------
export function Modal({
  open,
  title,
  onClose,
  children,
  footer,
  size = 'lg',
}: {
  open: boolean
  title: ReactNode
  onClose: () => void
  children: ReactNode
  footer?: ReactNode
  size?: 'md' | 'lg' | 'xl'
}) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])
  if (!open) return null
  const width = { md: 'max-w-lg', lg: 'max-w-3xl', xl: 'max-w-5xl' }[size]
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4 sm:p-8" onMouseDown={onClose}>
      <div role="dialog" aria-modal="true" className={`w-full ${width} rounded-xl bg-white shadow-xl`} onMouseDown={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
          <h2 className="text-lg font-semibold text-gray-900">{title}</h2>
          <button type="button" onClick={onClose} className="rounded-lg px-2 py-1 text-gray-500 hover:bg-gray-100" aria-label="Close">
            ✕
          </button>
        </div>
        <div className="max-h-[75vh] overflow-y-auto px-6 py-5">{children}</div>
        {footer && <div className="flex flex-wrap justify-end gap-3 border-t border-gray-200 px-6 py-4">{footer}</div>}
      </div>
    </div>
  )
}

interface ConfirmOptions {
  title: string
  message?: ReactNode
  confirmLabel?: string
  danger?: boolean
  /** Ask for a reason (returned as the resolved string). */
  withReason?: boolean
  reasonLabel?: string
  reasonRequired?: boolean
}

/**
 * Promise-based confirmation dialog:
 *   const { confirm, dialog } = useConfirm()
 *   const ok = await confirm({ title: 'Delete?' })     // true / false
 *   const reason = await confirm({ title: 'Cancel', withReason: true }) // string | false
 */
export function useConfirm() {
  const [state, setState] = useState<(ConfirmOptions & { open: boolean }) | null>(null)
  const [reason, setReason] = useState('')
  const resolver = useRef<((v: boolean | string) => void) | undefined>(undefined)

  const confirm = useCallback((opts: ConfirmOptions) => {
    setReason('')
    setState({ ...opts, open: true })
    return new Promise<boolean | string>((resolve) => {
      resolver.current = resolve
    })
  }, [])

  const close = (value: boolean | string) => {
    resolver.current?.(value)
    setState(null)
  }

  const dialog = state ? (
    <Modal
      open
      size="md"
      title={state.title}
      onClose={() => close(false)}
      footer={
        <>
          <button type="button" onClick={() => close(false)} className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
            Back
          </button>
          <button
            type="button"
            disabled={Boolean(state.withReason && state.reasonRequired && !reason.trim())}
            onClick={() => close(state.withReason ? reason.trim() : true)}
            className={`rounded-lg px-4 py-2 text-sm font-medium text-white disabled:opacity-50 ${state.danger ? 'bg-red-600 hover:bg-red-700' : 'bg-black hover:bg-gray-800'}`}
          >
            {state.confirmLabel ?? 'Confirm'}
          </button>
        </>
      }
    >
      {state.message && <div className="text-sm text-gray-600">{state.message}</div>}
      {state.withReason && (
        <div className="mt-4">
          <label className="mb-1.5 block text-sm font-medium text-gray-700">
            {state.reasonLabel ?? 'Reason'}
            {state.reasonRequired ? ' *' : ''}
          </label>
          <textarea
            rows={3}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-black"
          />
        </div>
      )}
    </Modal>
  ) : null

  return { confirm, dialog }
}

// -----------------------------------------------------------------------------
// Workflow status menu (only the moves the role may make)
// -----------------------------------------------------------------------------
export function StatusActions({
  entity,
  status,
  onChange,
  disabled,
  exclude = [],
}: {
  entity: WorkflowEntity
  status: string
  onChange: (next: string) => void
  disabled?: boolean
  /** statuses handled by dedicated buttons elsewhere */
  exclude?: string[]
}) {
  const options = useNextStatuses(entity, status).filter((t) => !exclude.includes(t.to_status))
  if (!options.length) return null
  return (
    <select
      aria-label="Change status"
      value=""
      disabled={disabled}
      onChange={(e) => e.target.value && onChange(e.target.value)}
      className="rounded-lg border border-gray-300 bg-white px-2.5 py-2 text-xs font-medium text-gray-700 outline-none focus:border-black disabled:opacity-50"
    >
      <option value="">Change status…</option>
      {options.map((o) => (
        <option key={o.to_status} value={o.to_status}>
          {o.label ?? prettyStatus(o.to_status)}
        </option>
      ))}
    </select>
  )
}

// -----------------------------------------------------------------------------
// Small layout helpers
// -----------------------------------------------------------------------------
export function SummaryCard({ label, value, hint }: { label: string; value: ReactNode; hint?: ReactNode }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <p className="text-sm text-gray-500">{label}</p>
      <p className="mt-1 text-2xl font-bold text-gray-900">{value}</p>
      {hint && <p className="mt-1 text-xs text-gray-500">{hint}</p>}
    </div>
  )
}

export function Field({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-wide text-gray-500">{label}</p>
      <div className="mt-1 text-sm text-gray-900">{value === null || value === undefined || value === '' ? '-' : value}</div>
    </div>
  )
}

export function Pagination({
  page,
  limit,
  total,
  onPage,
}: {
  page: number
  limit: number
  total: number
  onPage: (page: number) => void
}) {
  const pages = Math.max(1, Math.ceil(total / limit))
  if (pages <= 1) return null
  return (
    <div className="flex items-center justify-between border-t border-gray-200 px-6 py-3 text-sm text-gray-600">
      <span>
        Page {page} of {pages} · {total.toLocaleString()} records
      </span>
      <div className="flex gap-2">
        <button type="button" disabled={page <= 1} onClick={() => onPage(page - 1)} className="rounded-lg border border-gray-300 px-3 py-1.5 disabled:opacity-40">
          Previous
        </button>
        <button type="button" disabled={page >= pages} onClick={() => onPage(page + 1)} className="rounded-lg border border-gray-300 px-3 py-1.5 disabled:opacity-40">
          Next
        </button>
      </div>
    </div>
  )
}
