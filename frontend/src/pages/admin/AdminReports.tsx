import { useMemo, useState } from 'react'
import { downloadCsv } from '../../lib/api'
import { useAuth } from '../../contexts/AuthContext'
import { useReportSummary, useSalesOrders, useShipments } from '../../queries/admin'
import type { ReportSummary, SalesOrder, Shipment } from '../../types'
import { ErrorState, formatDate, formatKg, formatMoney, LoadingState, prettyStatus } from '../../components/admin/ui'

type ReportType = 'overview' | 'orders' | 'quotes' | 'export' | 'inventory' | 'quality' | 'customers'
type Period = 'all' | 'month' | 'quarter' | 'year' | 'custom'

const REPORT_TABS: { value: ReportType; label: string }[] = [
  { value: 'overview', label: 'Overview' },
  { value: 'orders', label: 'Orders' },
  { value: 'quotes', label: 'Quotes & Samples' },
  { value: 'export', label: 'Export & Shipments' },
  { value: 'inventory', label: 'Inventory & Lots' },
  { value: 'quality', label: 'Quality' },
  { value: 'customers', label: 'Customers & Collections' },
]

type Cell = string | number
type Card = { title: string; value: string; hint?: string }
type StatusBlock = { title: string; counts: Record<string, number> }
type Table = { title: string; headers: string[]; rows: Cell[][]; source?: 'orders' | 'shipments' }
type SectionData = { cards: Card[]; statuses: StatusBlock[]; tables: Table[] }

/** YYYY-MM-DD in local time */
function isoDate(d: Date) {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

function periodRange(period: Period, customFrom: string, customTo: string): { from?: string; to?: string } {
  const now = new Date()
  if (period === 'month') return { from: isoDate(new Date(now.getFullYear(), now.getMonth(), 1)), to: isoDate(now) }
  if (period === 'quarter') return { from: isoDate(new Date(now.getFullYear(), now.getMonth() - 2, 1)), to: isoDate(now) }
  if (period === 'year') return { from: isoDate(new Date(now.getFullYear(), now.getMonth() - 11, 1)), to: isoDate(now) }
  if (period === 'custom') return { from: customFrom || undefined, to: customTo || undefined }
  return {}
}

const n = (v: number | null | undefined) => Number(v ?? 0).toLocaleString()
const pct = (v: number | null | undefined) => (v === null || v === undefined ? '-' : `${Number(v).toLocaleString(undefined, { maximumFractionDigits: 1 })}%`)
const monthLabel = (m: string) => {
  const d = new Date(`${m}-01T00:00:00`)
  return Number.isNaN(d.getTime()) ? m : d.toLocaleDateString(undefined, { month: 'short', year: 'numeric' })
}
/** Value per currency, one line each — never summed across currencies. */
const currencyLines = (rows: { currency: string; value: number }[]) =>
  rows.length ? rows.map((r) => formatMoney(r.value, r.currency)).join('\n') : '-'

function buildSection(type: ReportType, r: ReportSummary, orders: SalesOrder[], shipments: Shipment[]): SectionData {
  const o = r.orders
  const sh = r.shipments
  const arrived = Number(sh.arrived_on_time) + Number(sh.arrived_late)

  const recentOrders: Table = {
    title: 'Sales Orders in Period',
    source: 'orders',
    headers: ['Order', 'Customer', 'Product', 'Quantity', 'Price', 'Status', 'Destination', 'Created'],
    rows: orders.map((order) => [
      order.order_number,
      order.customer?.company_name ?? '-',
      order.product_name,
      formatKg(order.quantity_kg),
      order.unit_price != null ? `${formatMoney(order.unit_price, order.currency)} /kg` : '-',
      prettyStatus(order.status),
      order.destination_country || '-',
      formatDate(order.created_at),
    ]),
  }
  const recentShipments: Table = {
    title: 'Shipments in Period',
    source: 'shipments',
    headers: ['Shipment', 'Batch', 'Customer', 'Status', 'Destination', 'Shipping Date', 'ETA', 'Arrival'],
    rows: shipments.map((s) => [
      s.shipment_number,
      s.export_batch?.batch_number ?? '-',
      s.export_batch?.sales_order?.customer?.company_name ?? '-',
      prettyStatus(s.status),
      s.destination_country || '-',
      formatDate(s.shipping_date),
      formatDate(s.estimated_arrival),
      formatDate(s.actual_arrival),
    ]),
  }
  const topCustomers: Table = {
    title: 'Top Customers (by ordered kg)',
    headers: ['Customer', 'Country', 'Orders', 'Quantity'],
    rows: o.top_customers.map((c) => [c.company_name, c.country || '-', n(c.orders), formatKg(c.kg)]),
  }

  switch (type) {
    case 'orders':
      return {
        cards: [
          { title: 'Orders', value: n(o.count) },
          { title: 'Ordered Coffee', value: formatKg(o.total_kg), hint: 'Excluding cancelled' },
          { title: 'Order Value', value: currencyLines(o.value_by_currency), hint: 'Per currency, excluding cancelled' },
          { title: 'Destinations', value: n(o.by_destination.length) },
        ],
        statuses: [{ title: 'Order Status', counts: o.by_status }],
        tables: [
          { title: 'Orders by Month', headers: ['Month', 'Orders', 'Quantity'], rows: o.by_month.map((m) => [monthLabel(m.month), n(m.orders), formatKg(m.kg)]) },
          { title: 'By Destination', headers: ['Country', 'Orders', 'Quantity'], rows: o.by_destination.map((d) => [d.country, n(d.orders), formatKg(d.kg)]) },
          topCustomers,
          recentOrders,
        ],
      }
    case 'quotes':
      return {
        cards: [
          { title: 'Quote Requests', value: n(r.quotes.count), hint: `${formatKg(r.quotes.requested_kg)} requested` },
          { title: 'Converted to Orders', value: n(r.quotes.converted) },
          { title: 'Conversion Rate', value: pct(r.quotes.conversion_rate) },
          { title: 'Sample Requests', value: n(r.samples.count), hint: `${n(r.samples.dispatched)} dispatched` },
        ],
        statuses: [
          { title: 'Quote Status', counts: r.quotes.by_status },
          { title: 'Sample Status', counts: r.samples.by_status },
        ],
        tables: [],
      }
    case 'export':
      return {
        cards: [
          { title: 'Export Batches', value: n(r.export_batches.count), hint: `${formatKg(r.export_batches.total_kg)} allocated` },
          { title: 'Shipments', value: n(sh.count) },
          {
            title: 'On-time Arrivals',
            value: `${n(sh.arrived_on_time)} / ${n(arrived)}`,
            hint: arrived ? `${pct((Number(sh.arrived_on_time) / arrived) * 100)} on time · ${n(sh.arrived_late)} late` : 'No arrivals with an ETA yet',
          },
          { title: 'Avg Transit Time', value: sh.avg_transit_days != null ? `${Number(sh.avg_transit_days).toLocaleString()} days` : '-', hint: 'Shipping date to actual arrival' },
        ],
        statuses: [
          { title: 'Export Batch Status', counts: r.export_batches.by_status },
          { title: 'Shipment Status', counts: sh.by_status },
        ],
        tables: [recentShipments],
      }
    case 'inventory':
      return {
        cards: [
          { title: 'Stock on Hand', value: formatKg(r.inventory.total_kg), hint: 'Current (not period filtered)' },
          { title: 'Coffee Lots', value: n(r.lots.count), hint: 'Created in period' },
          { title: 'Lot Quantity', value: formatKg(r.lots.total_kg) },
          { title: 'Warehouses', value: n(r.inventory.by_warehouse.length) },
        ],
        statuses: [
          { title: 'Lot Status', counts: r.lots.by_status },
          { title: 'Stock Movements (kg)', counts: r.inventory.movements },
        ],
        tables: [
          {
            title: 'Warehouse Utilisation',
            headers: ['Warehouse', 'Code', 'Stock', 'Capacity', 'Utilisation', 'Lots in Stock'],
            rows: r.inventory.by_warehouse.map((w) => [
              w.name,
              w.code || '-',
              formatKg(w.stock_kg),
              w.capacity_kg ? formatKg(w.capacity_kg) : '-',
              pct(w.utilisation_pct),
              n(w.lots),
            ]),
          },
          { title: 'Lots by Origin', headers: ['Origin', 'Lots', 'Quantity'], rows: r.lots.by_origin.map((x) => [x.origin, n(x.lots), formatKg(x.kg)]) },
        ],
      }
    case 'quality':
      return {
        cards: [
          { title: 'Inspections', value: n(r.quality.inspections) },
          { title: 'Pass Rate', value: pct(r.quality.pass_rate), hint: `${n(r.quality.passed)} passed · ${n(r.quality.failed)} failed` },
          { title: 'Approved / Rejected', value: `${n(r.quality.approved)} / ${n(r.quality.rejected)}` },
          { title: 'Avg Cup Score', value: r.quality.avg_cup_score != null ? Number(r.quality.avg_cup_score).toFixed(2) : '-' },
        ],
        statuses: [{ title: 'Final Grade', counts: r.quality.by_grade }],
        tables: [],
      }
    case 'customers':
      return {
        cards: [
          { title: 'Customers', value: n(r.customers.total), hint: 'All time' },
          { title: 'New Customers', value: n(r.customers.new_in_period), hint: 'In period' },
          { title: 'Collections', value: n(r.collections.count) },
          { title: 'Collected Coffee', value: formatKg(r.collections.total_kg) },
        ],
        statuses: [],
        tables: [
          topCustomers,
          { title: 'Customers by Country', headers: ['Country', 'Customers'], rows: r.customers.by_country.map((c) => [c.country, n(c.customers)]) },
          { title: 'Collections by Region', headers: ['Region', 'Collections', 'Quantity'], rows: r.collections.by_region.map((c) => [c.region, n(c.collections), formatKg(c.kg)]) },
          { title: 'Top Suppliers (by collected kg)', headers: ['Supplier', 'Quantity'], rows: r.collections.top_suppliers.map((s) => [s.supplier, formatKg(s.kg)]) },
        ],
      }
    default:
      return {
        cards: [
          { title: 'Orders', value: n(o.count), hint: formatKg(o.total_kg) },
          { title: 'Order Value', value: currencyLines(o.value_by_currency), hint: 'Per currency' },
          { title: 'Quote Conversion', value: pct(r.quotes.conversion_rate), hint: `${n(r.quotes.converted)} of ${n(r.quotes.count)} quotes` },
          { title: 'Customers', value: n(r.customers.total), hint: `${n(r.customers.new_in_period)} new in period` },
          { title: 'Coffee Lots', value: n(r.lots.count), hint: formatKg(r.lots.total_kg) },
          { title: 'Inventory', value: formatKg(r.inventory.total_kg), hint: 'Current stock' },
          { title: 'Export Batches', value: n(r.export_batches.count), hint: formatKg(r.export_batches.total_kg) },
          { title: 'Shipments', value: n(sh.count), hint: `${n(sh.arrived_on_time)} on time · ${n(sh.arrived_late)} late` },
        ],
        statuses: [
          { title: 'Order Status', counts: o.by_status },
          { title: 'Export Batch Status', counts: r.export_batches.by_status },
          { title: 'Shipment Status', counts: sh.by_status },
        ],
        tables: [
          { ...recentOrders, title: 'Recent Orders', headers: ['Order', 'Customer', 'Quantity', 'Status'], rows: orders.slice(0, 8).map((x) => [x.order_number, x.customer?.company_name ?? '-', formatKg(x.quantity_kg), prettyStatus(x.status)]) },
          {
            title: 'Recent Shipments',
            source: 'shipments',
            headers: ['Shipment', 'Status', 'Destination'],
            rows: shipments.slice(0, 8).map((s) => [s.shipment_number, prettyStatus(s.status), s.destination_country || '-']),
          },
        ],
      }
  }
}

export default function AdminReports() {
  const { canAccess } = useAuth()
  const [reportType, setReportType] = useState<ReportType>('overview')
  const [period, setPeriod] = useState<Period>('all')
  const [customFrom, setCustomFrom] = useState('')
  const [customTo, setCustomTo] = useState('')

  const range = useMemo(() => periodRange(period, customFrom, customTo), [period, customFrom, customTo])
  const rangeInvalid = Boolean(range.from && range.to && range.from > range.to)
  const effectiveRange = rangeInvalid ? {} : range

  const summary = useReportSummary(effectiveRange)
  const ordersQuery = useSalesOrders({ ...effectiveRange, limit: 50 })
  const shipmentsQuery = useShipments({ ...effectiveRange, limit: 50 })

  const canOrders = canAccess('orders')
  const canShipments = canAccess('shipments')
  const orders = useMemo(() => (canOrders ? ordersQuery.data?.data ?? [] : []), [canOrders, ordersQuery.data])
  const shipments = useMemo(() => (canShipments ? shipmentsQuery.data?.data ?? [] : []), [canShipments, shipmentsQuery.data])

  const section = useMemo(
    () => (summary.data ? buildSection(reportType, summary.data, orders, shipments) : null),
    [reportType, summary.data, orders, shipments]
  )

  const periodText = effectiveRange.from || effectiveRange.to ? `${effectiveRange.from ? formatDate(effectiveRange.from) : 'start'} – ${effectiveRange.to ? formatDate(effectiveRange.to) : 'today'}` : 'All time'

  function refresh() {
    summary.refetch()
    ordersQuery.refetch()
    shipmentsQuery.refetch()
  }

  function downloadCSV() {
    if (!section) return
    const rows: Cell[][] = [['Period', periodText, '', '']]
    section.cards.forEach((c) => rows.push(['Metric', c.title, c.value.replace(/\n/g, ' | '), c.hint ?? '']))
    section.statuses.forEach((s) => Object.entries(s.counts ?? {}).forEach(([k, v]) => rows.push([s.title, prettyStatus(k), v, ''])))
    section.tables.forEach((t) => {
      rows.push([])
      rows.push([t.title, ...t.headers])
      t.rows.forEach((row) => rows.push(['', ...row]))
    })
    downloadCsv(`waka-coffee-${reportType}-report-${isoDate(new Date())}.csv`, ['Section', 'Item', 'Value', 'Detail'], rows)
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Reports</h1>

          <p className="text-sm text-gray-500">View business, inventory, order, export, and shipment reports.</p>
        </div>

        <div className="flex gap-2">
          <button
            type="button"
            onClick={refresh}
            disabled={summary.isFetching}
            className="rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            {summary.isFetching ? 'Refreshing...' : 'Refresh'}
          </button>

          <button
            type="button"
            onClick={downloadCSV}
            disabled={!section}
            className="rounded-lg bg-black px-4 py-2.5 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50"
          >
            Download CSV
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <div className="flex flex-wrap gap-2">
          {REPORT_TABS.map((tab) => (
            <button
              key={tab.value}
              type="button"
              onClick={() => setReportType(tab.value)}
              className={`rounded-lg px-4 py-2 text-sm font-medium ${
                reportType === tab.value ? 'bg-black text-white' : 'border border-gray-300 bg-white text-gray-700 hover:bg-gray-50'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-3">
          <div>
            <label className="mb-2 block text-sm font-medium text-gray-700">Period</label>

            <select
              value={period}
              onChange={(event) => setPeriod(event.target.value as Period)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm outline-none focus:border-black"
            >
              <option value="all">All Time</option>
              <option value="month">This Month</option>
              <option value="quarter">Last 3 Months</option>
              <option value="year">Last 12 Months</option>
              <option value="custom">Custom Range</option>
            </select>
          </div>

          {period === 'custom' && (
            <>
              <div>
                <label className="mb-2 block text-sm font-medium text-gray-700">From</label>
                <input
                  type="date"
                  value={customFrom}
                  max={customTo || undefined}
                  onChange={(e) => setCustomFrom(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm outline-none focus:border-black"
                />
              </div>
              <div>
                <label className="mb-2 block text-sm font-medium text-gray-700">To</label>
                <input
                  type="date"
                  value={customTo}
                  min={customFrom || undefined}
                  onChange={(e) => setCustomTo(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm outline-none focus:border-black"
                />
              </div>
            </>
          )}
        </div>
        <p className="mt-3 text-xs text-gray-500">
          Showing: <span className="font-medium text-gray-700">{periodText}</span>. The period applies to orders, quotes, samples, batches, shipments, lots, inspections,
          collections and stock movements; stock on hand and customer totals are current.
        </p>
      </div>

      {rangeInvalid && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">The start date must be before the end date.</div>
      )}

      {summary.isLoading ? (
        <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
          <LoadingState label="Loading reports..." />
        </div>
      ) : summary.isError || !section ? (
        <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
          <ErrorState error={summary.error} onRetry={() => summary.refetch()} />
        </div>
      ) : (
        <>
          {/* KPI Cards */}
          <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
            {section.cards.map((card) => (
              <ReportCard key={card.title} title={card.title} value={card.value} hint={card.hint} />
            ))}
          </div>

          {/* Status Reports */}
          {section.statuses.length > 0 && (
            <div className={`grid grid-cols-1 gap-6 ${section.statuses.length >= 3 ? 'md:grid-cols-3' : 'md:grid-cols-2'}`}>
              {section.statuses.map((s) => (
                <StatusCard key={s.title} title={s.title} counts={s.counts} />
              ))}
            </div>
          )}

          {/* Selected Report */}
          {section.tables.length > 0 && (
            <div className={`grid grid-cols-1 gap-6 ${reportType === 'overview' ? 'md:grid-cols-2' : ''}`}>
              {section.tables.map((t) => (
                <ReportTable
                  key={t.title}
                  title={t.title}
                  headers={t.headers}
                  rows={t.rows}
                  error={
                    (t.source === 'orders' && ordersQuery.isError) || (t.source === 'shipments' && shipmentsQuery.isError)
                      ? 'Could not load the detail rows.'
                      : undefined
                  }
                />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}

function ReportCard({ title, value, hint }: { title: string; value: string; hint?: string }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <p className="text-sm text-gray-500">{title}</p>

      <p className={`mt-2 whitespace-pre-line font-bold text-gray-900 ${value.includes('\n') ? 'text-lg' : 'text-2xl'}`}>{value}</p>
      {hint && <p className="mt-1 text-xs text-gray-500">{hint}</p>}
    </div>
  )
}

function StatusCard({ title, counts }: { title: string; counts: Record<string, number> | null | undefined }) {
  const entries = Object.entries(counts ?? {})

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-700">{title}</h2>

      {entries.length === 0 ? (
        <p className="mt-5 text-sm text-gray-400">No data available.</p>
      ) : (
        <div className="mt-4 space-y-3">
          {entries.map(([status, count]) => (
            <div key={status} className="flex items-center justify-between">
              <span className="text-sm text-gray-600">{prettyStatus(status)}</span>

              <span className="rounded-full bg-gray-100 px-3 py-1 text-xs font-semibold text-gray-700">{Number(count).toLocaleString()}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function ReportTable({ title, headers, rows, error }: { title: string; headers: string[]; rows: Cell[][]; error?: string }) {
  return (
    <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
      <div className="border-b border-gray-200 px-6 py-4">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-700">{title}</h2>
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50">
            <tr>
              {headers.map((header) => (
                <th key={header} className="px-6 py-3 text-left font-semibold text-gray-700">
                  {header}
                </th>
              ))}
            </tr>
          </thead>

          <tbody className="divide-y divide-gray-100">
            {error ? (
              <tr>
                <td colSpan={headers.length} className="px-6 py-10 text-center text-red-600">
                  {error}
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={headers.length} className="px-6 py-10 text-center text-gray-400">
                  No data available.
                </td>
              </tr>
            ) : (
              rows.map((row, index) => (
                <tr key={index} className="hover:bg-gray-50">
                  {row.map((cell, cellIndex) => (
                    <td key={cellIndex} className="px-6 py-3 text-gray-700">
                      {cell}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
