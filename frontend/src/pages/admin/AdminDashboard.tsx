import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { roleLabel, type AdminModule } from '../../lib/permissions'
import { useDashboard } from '../../queries/admin'
import type { DashboardSummary } from '../../types'
import { ErrorState, formatDateTime, formatKg, formatMoney, LoadingState, prettyStatus, StatusBadge } from '../../components/admin/ui'

const num = (v: number | null | undefined) => Number(v ?? 0).toLocaleString()

const AdminDashboard = () => {
  const { profile, role, isAdmin, canAccess } = useAuth()
  const { data, isLoading, isError, error, refetch, isFetching } = useDashboard()

  const s = data?.summary
  /** Only link to modules the current role may open. */
  const linkIf = (module: AdminModule, to: string) => (canAccess(module) ? to : undefined)

  return (
    <div>
      <div className="mb-8 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-stone-900">Dashboard</h1>
          <p className="text-sm text-stone-500 mt-1">
            Welcome{profile?.full_name ? `, ${profile.full_name}` : ''}. Role:{' '}
            <span className="font-semibold text-stone-800">{roleLabel(role)}</span>
            {s?.generated_at && <span className="text-stone-400"> · updated {formatDateTime(s.generated_at)}</span>}
          </p>
        </div>
        <button
          type="button"
          onClick={() => refetch()}
          disabled={isFetching}
          className="self-start rounded-lg border border-stone-300 bg-white px-4 py-2 text-sm font-medium text-stone-700 hover:bg-stone-50 disabled:opacity-50 md:self-auto"
        >
          {isFetching ? 'Refreshing…' : 'Refresh'}
        </button>
      </div>

      {isLoading ? (
        <div className="rounded-xl border border-stone-200 bg-white shadow-sm">
          <LoadingState label="Loading dashboard…" />
        </div>
      ) : isError || !data || !s ? (
        <div className="rounded-xl border border-stone-200 bg-white shadow-sm">
          <ErrorState error={error} onRetry={() => refetch()} />
        </div>
      ) : (
        <div className="space-y-10">
          {s.orders && (
            <Section title="Sales & Orders">
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
                <StatCard to={linkIf('orders', '/admin/orders')} title="Sales Orders" value={num(s.orders.total)} hint={<StatusLine counts={s.orders.by_status} />} />
                <StatCard
                  to={linkIf('orders', '/admin/orders')}
                  title="Pending Export Review"
                  value={num(s.orders.pending_export)}
                  hint="Orders sent to Export awaiting acceptance"
                />
                <StatCard to={linkIf('orders', '/admin/orders')} title="Open Order Volume" value={formatKg(s.orders.open_kg)} hint="Not yet shipped or completed" />
                <StatCard
                  to={linkIf('orders', '/admin/orders')}
                  title="Order Value"
                  value={
                    s.orders.value_by_currency.length ? (
                      <span className="flex flex-col gap-0.5 text-lg">
                        {s.orders.value_by_currency.map((v) => (
                          <span key={v.currency}>{formatMoney(v.value, v.currency)}</span>
                        ))}
                      </span>
                    ) : (
                      '-'
                    )
                  }
                  hint="Per currency, excluding cancelled"
                />
                {s.customers && (
                  <StatCard
                    to={linkIf('customers', '/admin/customers')}
                    title="Customers"
                    value={num(s.customers.total)}
                    hint={`${num(s.customers.active)} active · ${num(s.customers.new_30d)} new in 30 days`}
                  />
                )}
                {s.quotes && (
                  <StatCard
                    to={linkIf('quote_requests', '/admin/quote-requests')}
                    title="Quote Requests"
                    value={num(s.quotes.open)}
                    hint={`${num(s.quotes.new)} new · ${num(s.quotes.new_7d)} in last 7 days · ${num(s.quotes.total)} total`}
                  />
                )}
                {s.samples && (
                  <StatCard
                    to={linkIf('sample_requests', '/admin/sample-requests')}
                    title="Sample Requests"
                    value={num(s.samples.open)}
                    hint={`${num(s.samples.new)} new · ${num(s.samples.total)} total`}
                  />
                )}
                {s.contacts && (
                  <StatCard
                    to={linkIf('contact_messages', '/admin/contact-messages')}
                    title="Unread Contact Messages"
                    value={num(s.contacts.unread)}
                  />
                )}
              </div>
              {s.orders.trend.length > 0 && <OrderTrend trend={s.orders.trend} />}
            </Section>
          )}

          {!s.orders && (s.customers || s.quotes || s.samples || s.contacts) && (
            <Section title="Customers & Requests">
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
                {s.customers && (
                  <StatCard to={linkIf('customers', '/admin/customers')} title="Customers" value={num(s.customers.total)} hint={`${num(s.customers.active)} active`} />
                )}
                {s.quotes && <StatCard to={linkIf('quote_requests', '/admin/quote-requests')} title="Quote Requests" value={num(s.quotes.open)} hint={`${num(s.quotes.new)} new`} />}
                {s.samples && <StatCard to={linkIf('sample_requests', '/admin/sample-requests')} title="Sample Requests" value={num(s.samples.open)} hint={`${num(s.samples.new)} new`} />}
                {s.contacts && <StatCard to={linkIf('contact_messages', '/admin/contact-messages')} title="Unread Contact Messages" value={num(s.contacts.unread)} />}
              </div>
            </Section>
          )}

          {s.export && (
            <Section title="Export & Shipping">
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
                <StatCard
                  to={linkIf('export_batches', '/admin/export-batches')}
                  title="Active Export Batches"
                  value={num(s.export.batches_active)}
                  hint={<StatusLine counts={s.export.batches_by_status} />}
                />
                <StatCard to={linkIf('shipments', '/admin/shipments')} title="Active Shipments" value={num(s.export.shipments_active)} hint={<StatusLine counts={s.export.shipments_by_status} />} />
                <StatCard to={linkIf('shipments', '/admin/shipments')} title="In Transit" value={num(s.export.shipments_in_transit)} />
                <StatCard to={linkIf('shipments', '/admin/shipments')} title="Arriving in 7 Days" value={num(s.export.arriving_7d)} hint="Estimated arrival within a week" />
              </div>
            </Section>
          )}

          {(s.lots || s.quality) && (
            <Section title="Lots & Quality">
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
                {s.lots && (
                  <StatCard
                    to={linkIf('lots', '/admin/lots')}
                    title="Coffee Lots"
                    value={num(s.lots.total)}
                    hint={
                      <>
                        {formatKg(s.lots.total_kg)}
                        <StatusLine counts={s.lots.by_status} />
                      </>
                    }
                  />
                )}
                {s.quality && (
                  <>
                    <StatCard to={linkIf('quality', '/admin/quality')} title="Awaiting Inspection" value={num(s.quality.awaiting_inspection)} hint="Lots pending quality" />
                    <StatCard to={linkIf('quality', '/admin/quality')} title="Pending Approval" value={num(s.quality.pending_approval)} hint="Inspections awaiting a decision" />
                    <StatCard
                      to={linkIf('quality', '/admin/quality')}
                      title="Decisions (30 days)"
                      value={`${num(s.quality.approved_30d)} / ${num(s.quality.rejected_30d)}`}
                      hint={`Approved / rejected · avg cup score ${s.quality.avg_cup_score_30d != null ? Number(s.quality.avg_cup_score_30d).toFixed(2) : '-'}`}
                    />
                  </>
                )}
              </div>
            </Section>
          )}

          {s.inventory && (
            <Section title="Warehouse & Inventory">
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
                <StatCard to={linkIf('inventory', '/admin/inventory')} title="Stock on Hand" value={formatKg(s.inventory.total_kg)} />
                <StatCard to={linkIf('inventory', '/admin/inventory')} title="Low Stock Rows" value={num(s.inventory.low_stock)} hint="Bags at or below par level" />
                <StatCard to={linkIf('inventory', '/admin/inventory')} title="Awaiting Receipt" value={num(s.inventory.awaiting_receipt)} hint="Approved lots not yet in stock" />
              </div>
              {s.inventory.by_warehouse.length > 0 && <WarehouseBars rows={s.inventory.by_warehouse} to={linkIf('warehouses', '/admin/warehouses')} />}
            </Section>
          )}

          {s.field && (
            <Section title="Field Collection">
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
                <StatCard
                  to={linkIf('collection', '/admin/collection')}
                  title="Collections (30 days)"
                  value={num(s.field.collections_30d)}
                  hint={`${formatKg(s.field.collected_kg_30d)} collected`}
                />
                <StatCard to={linkIf('collection', '/admin/collection')} title="Awaiting Lots" value={num(s.field.awaiting_lots)} hint="Collections not fully processed" />
                <StatCard to={linkIf('farmers', '/admin/farmers')} title="Farmers" value={num(s.field.farmers)} />
                <StatCard to={linkIf('suppliers', '/admin/suppliers')} title="Suppliers" value={num(s.field.suppliers)} />
              </div>
            </Section>
          )}

          <div className={`grid grid-cols-1 gap-6 ${isAdmin ? 'xl:grid-cols-2' : ''}`}>
            <div className="border border-stone-200 bg-white rounded-xl shadow-sm">
              <div className="flex items-center justify-between border-b border-stone-200 px-5 py-4">
                <div>
                  <h2 className="text-base font-semibold text-stone-900">Recent notifications</h2>
                  <p className="text-xs text-stone-500">{num(s.notifications.unread)} unread</p>
                </div>
                {canAccess('notifications') && (
                  <Link to="/admin/notifications" className="text-sm font-medium text-stone-700 hover:text-stone-900">
                    View all →
                  </Link>
                )}
              </div>
              {data.recent_notifications.length === 0 ? (
                <p className="px-5 py-8 text-center text-sm text-stone-500">No notifications yet.</p>
              ) : (
                <ul className="divide-y divide-stone-100">
                  {data.recent_notifications.map((n) => (
                    <li key={n.id} className="flex gap-3 px-5 py-3">
                      <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${n.is_read ? 'bg-stone-300' : 'bg-stone-900'}`} />
                      <div className="min-w-0">
                        <p className={`text-sm ${n.is_read ? 'text-stone-700' : 'font-semibold text-stone-900'}`}>{n.title}</p>
                        <p className="truncate text-xs text-stone-500">{n.message}</p>
                        <p className="mt-0.5 text-xs text-stone-400">{formatDateTime(n.created_at)}</p>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {isAdmin && (
              <div className="border border-stone-200 bg-white rounded-xl shadow-sm">
                <div className="border-b border-stone-200 px-5 py-4">
                  <h2 className="text-base font-semibold text-stone-900">Recent activity</h2>
                  <p className="text-xs text-stone-500">Latest changes across the system</p>
                </div>
                {data.recent_activity.length === 0 ? (
                  <p className="px-5 py-8 text-center text-sm text-stone-500">No activity recorded yet.</p>
                ) : (
                  <ul className="divide-y divide-stone-100">
                    {data.recent_activity.map((a) => (
                      <li key={a.id} className="px-5 py-3 text-sm">
                        <p className="text-stone-800">
                          <span className="font-semibold">{a.user?.full_name || a.user?.email || 'System'}</span>{' '}
                          <span className="text-stone-600">{prettyStatus(a.action).toLowerCase()}</span>{' '}
                          <span className="text-stone-600">{prettyStatus(a.entity_type).toLowerCase()}</span>
                          {a.details?.label && <span className="font-medium text-stone-900"> {a.details.label}</span>}
                          {a.details?.status && (
                            <span className="ml-2 align-middle">
                              <StatusBadge status={a.details.status} />
                            </span>
                          )}
                        </p>
                        <p className="mt-0.5 text-xs text-stone-400">{formatDateTime(a.created_at)}</p>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h2 className="text-sm font-semibold uppercase tracking-wider text-stone-500 mb-3">{title}</h2>
      <div className="space-y-4">{children}</div>
    </section>
  )
}

function StatCard({ to, title, value, hint }: { to?: string; title: string; value: ReactNode; hint?: ReactNode }) {
  const body = (
    <>
      <h3 className="text-sm font-medium text-stone-500">{title}</h3>
      <div className="mt-2 text-2xl font-semibold text-stone-900">{value}</div>
      {hint && <div className="text-xs text-stone-500 mt-2">{hint}</div>}
    </>
  )
  const cls = 'block p-5 bg-white border border-stone-200 rounded-xl shadow-sm'
  return to ? (
    <Link to={to} className={`${cls} hover:border-stone-400 transition-colors`}>
      {body}
    </Link>
  ) : (
    <div className={cls}>{body}</div>
  )
}

function StatusLine({ counts }: { counts: Record<string, number> | null | undefined }) {
  const entries = Object.entries(counts ?? {}).filter(([, n]) => Number(n) > 0)
  if (!entries.length) return null
  return (
    <span className="mt-1 block">
      {entries.map(([status, n], i) => (
        <span key={status}>
          {i > 0 && ' · '}
          {prettyStatus(status)} {num(n)}
        </span>
      ))}
    </span>
  )
}

function OrderTrend({ trend }: { trend: NonNullable<DashboardSummary['orders']>['trend'] }) {
  const max = Math.max(1, ...trend.map((t) => Number(t.orders)))
  const monthLabel = (m: string) => {
    const d = new Date(`${m}-01T00:00:00`)
    return Number.isNaN(d.getTime()) ? m : d.toLocaleDateString(undefined, { month: 'short', year: '2-digit' })
  }
  return (
    <div className="border border-stone-200 bg-white p-5 rounded-xl shadow-sm">
      <p className="text-sm font-medium text-stone-800">Orders — last 6 months</p>
      <div className="mt-4 flex h-40 items-end gap-3">
        {trend.map((t) => (
          <div key={t.month} className="flex h-full flex-1 flex-col items-center justify-end gap-1" title={`${t.orders} orders · ${formatKg(t.kg)}`}>
            <span className="text-xs font-medium text-stone-700">{num(t.orders)}</span>
            <div className="w-full max-w-[3rem] rounded-t bg-stone-800" style={{ height: `${(Number(t.orders) / max) * 100}%`, minHeight: Number(t.orders) > 0 ? 4 : 1 }} />
            <span className="text-xs text-stone-500">{monthLabel(t.month)}</span>
            <span className="text-[10px] text-stone-400">{formatKg(t.kg)}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function WarehouseBars({ rows, to }: { rows: NonNullable<DashboardSummary['inventory']>['by_warehouse']; to?: string }) {
  return (
    <div className="border border-stone-200 bg-white p-5 rounded-xl shadow-sm">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-stone-800">Stock by warehouse</p>
        {to && (
          <Link to={to} className="text-sm font-medium text-stone-700 hover:text-stone-900">
            Warehouses →
          </Link>
        )}
      </div>
      <div className="mt-4 space-y-3">
        {rows.map((w) => {
          const cap = w.capacity_kg ? Number(w.capacity_kg) : null
          const pct = cap ? Math.min(100, (Number(w.stock_kg) / cap) * 100) : null
          return (
            <div key={w.warehouse_id}>
              <div className="flex justify-between text-xs text-stone-600">
                <span>
                  <span className="font-medium text-stone-800">{w.name}</span> {w.code && <span className="text-stone-400">({w.code})</span>}
                </span>
                <span>
                  {formatKg(w.stock_kg)}
                  {cap ? ` of ${formatKg(cap)} · ${pct!.toFixed(0)}%` : ' · no capacity set'}
                </span>
              </div>
              <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-stone-100">
                <div
                  className={`h-full rounded-full ${pct != null && pct >= 90 ? 'bg-red-500' : pct != null && pct >= 75 ? 'bg-amber-500' : 'bg-stone-800'}`}
                  style={{ width: `${pct ?? 0}%` }}
                />
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

export default AdminDashboard
