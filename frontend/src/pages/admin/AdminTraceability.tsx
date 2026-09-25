import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useDebounce } from '../../hooks'
import { openDocument, useTraceLot, useTraceOverview, useTraceSearch, useTraceShipment } from '../../queries/admin'
import type { TraceLot, TraceLotSource, TraceSearchHit, TraceShipment } from '../../types'
import {
  EmptyState,
  ErrorState,
  formatDate,
  formatDateTime,
  formatKg,
  LoadingState,
  Pagination,
  prettyStatus,
  StatusBadge,
  useFlash,
} from '../../components/admin/ui'

/** Grades are stored either as "G1" or "Grade 1"; never print "Grade Grade 1". */
function gradeLabel(value: string) {
  return /^grade\b/i.test(value.trim()) ? value : `Grade ${value}`
}


const PAGE_SIZE = 25

type View = { kind: 'lot'; id: string } | { kind: 'shipment'; id: string } | null

const HIT_LABELS: Record<TraceSearchHit['type'], string> = {
  lot: 'Coffee Lots',
  shipment: 'Shipments',
  export_batch: 'Export Batches',
  sales_order: 'Sales Orders',
  collection: 'Collections',
}

const joinParts = (...parts: (string | null | undefined)[]) => parts.filter(Boolean).join(', ')

export default function AdminTraceability() {
  const flash = useFlash()
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [quick, setQuick] = useState('')
  const [view, setView] = useState<View>(null)
  const detailRef = useRef<HTMLDivElement>(null)

  const debouncedSearch = useDebounce(search.trim(), { delay: 400 })
  const debouncedQuick = useDebounce(quick.trim(), { delay: 350 })

  const overview = useTraceOverview({ search: debouncedSearch || undefined, page, limit: PAGE_SIZE })
  const hits = useTraceSearch(debouncedQuick)

  const records = overview.data?.data ?? []
  const total = overview.data?.meta.total ?? 0

  useEffect(() => {
    if (view) detailRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [view])

  function filterOverview(code: string) {
    setSearch(code)
    setPage(1)
  }

  function openHit(hit: TraceSearchHit) {
    if (hit.type === 'lot') setView({ kind: 'lot', id: hit.id })
    else if (hit.type === 'shipment') setView({ kind: 'shipment', id: hit.id })
    else filterOverview(hit.code)
  }

  async function openDoc(id: string) {
    try {
      await openDocument(id)
    } catch (err) {
      flash.error(err)
    }
  }

  const pageBatches = new Set(records.flatMap((r) => r.batches.map((b) => b.batch_number))).size
  const pageShipments = new Set(records.flatMap((r) => r.batches.flatMap((b) => b.shipments.map((s) => s.shipment_number)))).size
  const pageKg = records.reduce((sum, r) => sum + Number(r.quantity_kg || 0), 0)

  const groupedHits = (hits.data ?? []).reduce<Partial<Record<TraceSearchHit['type'], TraceSearchHit[]>>>((acc, hit) => {
    ;(acc[hit.type] ??= []).push(hit)
    return acc
  }, {})

  return (
    <div className="space-y-6">
      {/* Header */}

      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Traceability</h1>

          <p className="text-sm text-gray-500">
            Track coffee from farm, supplier and collection through quality inspection, inventory, export, shipment, and customer.
          </p>
        </div>

        <button
          type="button"
          onClick={() => overview.refetch()}
          disabled={overview.isFetching}
          className="rounded-lg bg-black px-4 py-2.5 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50"
        >
          {overview.isFetching ? 'Refreshing...' : 'Refresh'}
        </button>
      </div>

      {flash.banner}

      {/* Summary */}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
        <SummaryTile title={debouncedSearch ? 'Matching Lots' : 'Coffee Lots'} value={total.toLocaleString()} />
        <SummaryTile title="Export Batches" value={pageBatches.toLocaleString()} hint="On this page" />
        <SummaryTile title="Shipments" value={pageShipments.toLocaleString()} hint="On this page" />
        <SummaryTile title="Total Coffee" value={formatKg(pageKg)} hint="Lots on this page" />
      </div>

      {/* Quick trace */}

      <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <label className="mb-2 block text-sm font-medium text-gray-700">Trace a code</label>

        <input
          type="text"
          value={quick}
          onChange={(event) => setQuick(event.target.value)}
          placeholder="Lot code, shipment / container / B/L number, batch, order or collection code..."
          className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm outline-none focus:border-black"
        />

        {debouncedQuick.length >= 2 && (
          <div className="mt-4">
            {hits.isLoading ? (
              <p className="text-sm text-gray-500">Searching...</p>
            ) : hits.isError ? (
              <ErrorState error={hits.error} onRetry={() => hits.refetch()} />
            ) : !hits.data?.length ? (
              <p className="text-sm text-gray-500">Nothing matches “{debouncedQuick}”.</p>
            ) : (
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                {(Object.keys(HIT_LABELS) as TraceSearchHit['type'][])
                  .filter((type) => groupedHits[type]?.length)
                  .map((type) => (
                    <div key={type}>
                      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">{HIT_LABELS[type]}</p>
                      <div className="space-y-2">
                        {groupedHits[type]!.map((hit) => (
                          <button
                            key={hit.id}
                            type="button"
                            onClick={() => openHit(hit)}
                            className="flex w-full items-center justify-between gap-3 rounded-lg border border-gray-200 px-3 py-2 text-left hover:bg-gray-50"
                          >
                            <span className="min-w-0">
                              <span className="block font-medium text-gray-900">{hit.code}</span>
                              {hit.label && <span className="block truncate text-xs text-gray-500">{hit.label}</span>}
                              <span className="block text-xs text-gray-400">
                                {hit.type === 'lot' || hit.type === 'shipment' ? 'Open full trace' : 'Show related lots below'}
                              </span>
                            </span>
                            <StatusBadge status={hit.status} />
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Search */}

      <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <label className="mb-2 block text-sm font-medium text-gray-700">Search traceability</label>

        <div className="flex gap-2">
          <input
            type="text"
            value={search}
            onChange={(event) => {
              setSearch(event.target.value)
              setPage(1)
            }}
            placeholder="Search lot, origin, supplier, farmer, collection, batch, shipment, container, order, customer..."
            className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm outline-none focus:border-black"
          />
          {search && (
            <button
              type="button"
              onClick={() => filterOverview('')}
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
            >
              Clear
            </button>
          )}
        </div>
      </div>

      {/* Table */}

      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        {overview.isLoading ? (
          <LoadingState label="Loading traceability information..." />
        ) : overview.isError ? (
          <ErrorState error={overview.error} onRetry={() => overview.refetch()} />
        ) : records.length === 0 ? (
          <EmptyState
            title="No traceability records found."
            description={debouncedSearch ? 'Try a different code or name.' : 'Coffee lots appear here once they are created from collections.'}
          />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left font-semibold text-gray-700">Lot</th>
                    <th className="px-6 py-3 text-left font-semibold text-gray-700">Origin</th>
                    <th className="px-6 py-3 text-left font-semibold text-gray-700">Source</th>
                    <th className="px-6 py-3 text-left font-semibold text-gray-700">Quality</th>
                    <th className="px-6 py-3 text-left font-semibold text-gray-700">Inventory</th>
                    <th className="px-6 py-3 text-left font-semibold text-gray-700">Export → Customer → Shipment</th>
                    <th className="px-6 py-3 text-right font-semibold text-gray-700">Action</th>
                  </tr>
                </thead>

                <tbody className="divide-y divide-gray-100">
                  {records.map((record) => (
                    <tr key={record.lot_id} className="align-top hover:bg-gray-50">
                      {/* Lot */}
                      <td className="px-6 py-4">
                        <div className="font-medium text-gray-900">{record.lot_code}</div>
                        <div className="mt-1 text-xs text-gray-400">{formatKg(record.quantity_kg)}</div>
                        <div className="mt-1">
                          <StatusBadge status={record.status} />
                        </div>
                      </td>

                      {/* Origin */}
                      <td className="px-6 py-4">
                        <div className="text-gray-900">{record.origin || '—'}</div>
                        {record.region && <div className="text-xs text-gray-500">{record.region}</div>}
                        {record.grade && <div className="text-xs text-gray-500">{gradeLabel(record.grade)}</div>}
                        {record.processing_method && <div className="text-xs text-gray-500">{prettyStatus(record.processing_method)}</div>}
                      </td>

                      {/* Source */}
                      <td className="px-6 py-4">
                        {record.supplier_name || record.farmer_name || record.collection_code ? (
                          <div className="space-y-0.5">
                            {record.supplier_name && <div className="text-gray-900">{record.supplier_name}</div>}
                            {record.farmer_name && <div className="text-xs text-gray-500">Farmer: {record.farmer_name}</div>}
                            {record.farm_name && <div className="text-xs text-gray-500">Farm: {record.farm_name}</div>}
                            {record.collection_code && (
                              <div className="text-xs text-gray-400">
                                {record.collection_code} · {formatDate(record.collection_date)}
                              </div>
                            )}
                          </div>
                        ) : (
                          <span className="text-gray-400">Not linked</span>
                        )}
                      </td>

                      {/* Quality */}
                      <td className="px-6 py-4">
                        {record.quality ? (
                          <div className="space-y-1">
                            {record.quality.final_grade && <div className="font-medium text-gray-900">{gradeLabel(record.quality.final_grade)}</div>}
                            <div className="flex flex-wrap gap-1">
                              <StatusBadge status={record.quality.result} />
                              <StatusBadge status={record.quality.approval_status} />
                            </div>
                            <div className="text-xs text-gray-500">
                              {record.quality.cup_score != null ? `Cup ${record.quality.cup_score} · ` : ''}
                              {formatDate(record.quality.inspection_date)}
                            </div>
                          </div>
                        ) : (
                          <span className="text-gray-400">Not inspected</span>
                        )}
                      </td>

                      {/* Inventory */}
                      <td className="px-6 py-4">
                        {Number(record.inventory_kg) > 0 ? (
                          <div>
                            <div className="font-medium text-gray-900">{formatKg(record.inventory_kg)}</div>
                            {record.warehouses.length > 0 && <div className="mt-1 text-xs text-gray-500">{record.warehouses.join(', ')}</div>}
                          </div>
                        ) : (
                          <span className="text-gray-400">Not in inventory</span>
                        )}
                      </td>

                      {/* Export chain — one block per batch, nested (no parallel arrays) */}
                      <td className="px-6 py-4">
                        {record.batches.length > 0 ? (
                          <div className="space-y-3">
                            {record.batches.map((batch) => (
                              <div key={batch.batch_number} className="rounded-lg border border-gray-100 p-2">
                                <div className="flex flex-wrap items-center gap-2">
                                  <span className="font-medium text-gray-900">{batch.batch_number}</span>
                                  <StatusBadge status={batch.status} />
                                  <span className="text-xs text-gray-400">{formatKg(batch.quantity_kg)}</span>
                                </div>
                                <div className="mt-1 text-xs text-gray-600">
                                  {batch.order_number} · {batch.customer || 'Unknown customer'}
                                  {batch.country ? ` · ${batch.country}` : ''}
                                </div>
                                {batch.shipments.length > 0 ? (
                                  <div className="mt-1 flex flex-wrap gap-2">
                                    {batch.shipments.map((s) => (
                                      <span key={s.shipment_number} className="inline-flex items-center gap-1 text-xs text-gray-700">
                                        {s.shipment_number} <StatusBadge status={s.status} />
                                      </span>
                                    ))}
                                  </div>
                                ) : (
                                  <div className="mt-1 text-xs text-gray-400">Not shipped</div>
                                )}
                              </div>
                            ))}
                          </div>
                        ) : (
                          <span className="text-gray-400">Not assigned</span>
                        )}
                      </td>

                      {/* Action */}
                      <td className="px-6 py-4 text-right">
                        <button
                          type="button"
                          onClick={() => setView({ kind: 'lot', id: record.lot_id })}
                          className="rounded-lg border border-gray-300 px-3 py-2 text-xs font-medium text-gray-700 hover:bg-gray-50"
                        >
                          Trace
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination page={page} limit={PAGE_SIZE} total={total} onPage={setPage} />
          </>
        )}
      </div>

      {/* DETAIL PANEL */}

      {view && (
        <div ref={detailRef} className="scroll-mt-6 rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
          {view.kind === 'lot' ? (
            <LotTraceView
              id={view.id}
              onClose={() => setView(null)}
              onOpenShipment={(id) => setView({ kind: 'shipment', id })}
              onOpenDocument={openDoc}
            />
          ) : (
            <ShipmentTraceView
              id={view.id}
              onClose={() => setView(null)}
              onOpenLot={(id) => setView({ kind: 'lot', id })}
              onOpenDocument={openDoc}
            />
          )}
        </div>
      )}
    </div>
  )
}

// ================================================================
// LOT TRACE (forward: farm → ... → shipments)
// ================================================================

function LotTraceView({
  id,
  onClose,
  onOpenShipment,
  onOpenDocument,
}: {
  id: string
  onClose: () => void
  onOpenShipment: (id: string) => void
  onOpenDocument: (id: string) => void
}) {
  const { data, isLoading, isError, error, refetch } = useTraceLot(id)

  if (isLoading) return <LoadingState label="Tracing lot..." />
  if (isError || !data) return <ErrorState error={error} onRetry={() => refetch()} />

  const t: TraceLot = data
  const latestQuality = t.quality[0]
  const stockKg = t.inventory.reduce((sum, i) => sum + Number(i.quantity_kg || 0), 0)
  const activeExports = t.exports.filter((e) => !e.released)
  const shipments = activeExports.flatMap((e) => e.shipments)

  return (
    <>
      <PanelHeader title="Lot Traceability" subtitle={`Complete history for ${t.lot.lot_code}`} onClose={onClose} />

      {/* COMPLETE TRACEABILITY FLOW */}
      <div className="mt-6">
        <SectionTitle>Complete Traceability Flow</SectionTitle>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-3 xl:grid-cols-9">
          <FlowStep
            title="Farm / Farmer"
            value={t.farm?.farm_name || t.farmer?.name || 'Not linked'}
            sub={t.farm && t.farmer ? t.farmer.name : undefined}
            active={Boolean(t.farm || t.farmer)}
          />
          <FlowStep title="Supplier" value={t.supplier?.name || 'Not linked'} sub={t.supplier?.supplier_code} active={Boolean(t.supplier)} />
          <FlowStep
            title="Collection"
            value={t.collection?.collection_code || 'Not linked'}
            sub={t.collection?.field_officer?.full_name ? `by ${t.collection.field_officer.full_name}` : undefined}
            active={Boolean(t.collection)}
          />
          <FlowStep title="Coffee Lot" value={t.lot.lot_code} sub={formatKg(t.lot.quantity_kg)} active />
          <FlowStep
            title="Quality"
            value={latestQuality ? prettyStatus(latestQuality.approval_status === 'pending' ? latestQuality.result : latestQuality.approval_status) : 'Not inspected'}
            sub={latestQuality?.final_grade ? gradeLabel(latestQuality.final_grade) : undefined}
            active={Boolean(latestQuality)}
          />
          <FlowStep
            title="Warehouse"
            value={t.inventory.length ? `${formatKg(stockKg)}` : 'Not received'}
            sub={t.inventory.length ? t.inventory.map((i) => i.warehouse.name).join(', ') : undefined}
            active={t.inventory.length > 0}
          />
          <FlowStep
            title="Export Batch"
            value={activeExports.length ? activeExports.map((e) => e.batch.batch_number).join(', ') : 'Not assigned'}
            active={activeExports.length > 0}
          />
          <FlowStep
            title="Order / Customer"
            value={activeExports.length ? activeExports.map((e) => e.order.order_number).join(', ') : 'Not assigned'}
            sub={activeExports.length ? Array.from(new Set(activeExports.map((e) => e.customer?.company_name).filter(Boolean))).join(', ') : undefined}
            active={activeExports.length > 0}
          />
          <FlowStep
            title="Shipment"
            value={shipments.length ? shipments.map((s) => s.shipment_number).join(', ') : 'Not shipped'}
            active={shipments.length > 0}
          />
        </div>
      </div>

      {/* Lot */}
      <div className="mt-8">
        <SectionTitle>Coffee Lot</SectionTitle>
        <div className="grid grid-cols-1 gap-6 md:grid-cols-4">
          <Detail title="Coffee Lot" value={t.lot.lot_code} />
          <Detail title="Origin" value={t.lot.origin} />
          <Detail title="Grade" value={t.lot.grade} />
          <Detail title="Processing Method" value={t.lot.processing_method ? prettyStatus(t.lot.processing_method) : null} />
          <Detail title="Lot Quantity" value={formatKg(t.lot.quantity_kg)} />
          <Detail title="Lot Status" value={<StatusBadge status={t.lot.status} />} />
          <Detail title="Created" value={formatDate(t.lot.created_at)} />
        </div>
      </div>

      <SourceDetails source={t} />

      {/* Quality */}
      <div className="mt-8">
        <SectionTitle>Quality Inspections</SectionTitle>
        <QualityTable rows={t.quality} />
      </div>

      {/* Warehouse */}
      <div className="mt-8">
        <SectionTitle>Warehouse Stock</SectionTitle>
        <MiniTable
          headers={['Warehouse', 'Location', 'Quantity', 'Status', 'Received']}
          empty="This lot has not been received into a warehouse."
          rows={t.inventory.map((i) => [
            `${i.warehouse.name}${i.warehouse.code ? ` (${i.warehouse.code})` : ''}`,
            i.warehouse.location || '—',
            formatKg(i.quantity_kg),
            <StatusBadge key="s" status={i.status} />,
            formatDate(i.received_date),
          ])}
        />
      </div>

      <div className="mt-8">
        <SectionTitle>Stock Movements Ledger</SectionTitle>
        <MiniTable
          headers={['Date', 'Type', 'Warehouse', 'Quantity', 'Balance After', 'Reference', 'Notes', 'By']}
          empty="No stock movements recorded."
          rows={t.movements.map((m) => [
            formatDateTime(m.created_at),
            prettyStatus(m.transaction_type),
            m.warehouse,
            `${/_out$|^issue$/.test(m.transaction_type) ? '−' : '+'}${formatKg(m.quantity_kg)}`,
            m.balance_after != null ? formatKg(m.balance_after) : '—',
            m.reference_type ? prettyStatus(m.reference_type) : '—',
            m.notes || '—',
            m.performed_by || '—',
          ])}
        />
      </div>

      {/* Export */}
      <div className="mt-8">
        <SectionTitle>Export Allocations</SectionTitle>
        {t.exports.length === 0 ? (
          <p className="text-sm text-gray-400">This lot has not been allocated to an export batch.</p>
        ) : (
          <div className="space-y-3">
            {t.exports.map((e, i) => (
              <div key={`${e.batch.id}-${i}`} className={`rounded-lg border p-4 ${e.released ? 'border-gray-200 bg-gray-50 opacity-70' : 'border-gray-200'}`}>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium text-gray-900">{e.batch.batch_number}</span>
                  <StatusBadge status={e.batch.status} />
                  <span className="text-sm text-gray-600">
                    {formatKg(e.quantity_kg)}
                    {e.warehouse ? ` from ${e.warehouse}` : ''}
                  </span>
                  {e.released && <span className="text-xs font-medium text-gray-500">Released (stock returned)</span>}
                </div>
                <div className="mt-3 grid grid-cols-1 gap-4 md:grid-cols-4">
                  <Detail title="Sales Order" value={<span className="inline-flex items-center gap-2">{e.order.order_number} <StatusBadge status={e.order.status} /></span>} />
                  <Detail title="Customer" value={e.customer ? joinParts(e.customer.company_name, e.customer.country) : null} />
                  <Detail title="Destination" value={joinParts(e.order.destination_port, e.order.destination_country)} />
                  <Detail
                    title="Shipments"
                    value={
                      e.shipments.length ? (
                        <div className="space-y-1">
                          {e.shipments.map((s) => (
                            <button key={s.id} type="button" onClick={() => onOpenShipment(s.id)} className="flex flex-wrap items-center gap-2 text-left hover:underline">
                              <span className="font-medium">{s.shipment_number}</span>
                              <StatusBadge status={s.status} />
                              <span className="text-xs text-gray-500">
                                {joinParts(s.vessel_name, s.container_number)}
                                {s.actual_arrival ? ` · arrived ${formatDate(s.actual_arrival)}` : s.estimated_arrival ? ` · ETA ${formatDate(s.estimated_arrival)}` : ''}
                              </span>
                            </button>
                          ))}
                        </div>
                      ) : (
                        'Not shipped'
                      )
                    }
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <DocumentList documents={t.documents} onOpen={onOpenDocument} />
    </>
  )
}

// ================================================================
// SHIPMENT TRACE (backward: shipment → every source lot)
// ================================================================

function ShipmentTraceView({
  id,
  onClose,
  onOpenLot,
  onOpenDocument,
}: {
  id: string
  onClose: () => void
  onOpenLot: (id: string) => void
  onOpenDocument: (id: string) => void
}) {
  const { data, isLoading, isError, error, refetch } = useTraceShipment(id)

  if (isLoading) return <LoadingState label="Tracing shipment..." />
  if (isError || !data) return <ErrorState error={error} onRetry={() => refetch()} />

  const t: TraceShipment = data
  const s = t.shipment

  return (
    <>
      <PanelHeader title="Shipment Traceability" subtitle={`Every source lot in ${s.shipment_number}`} onClose={onClose} />

      <div className="mt-6">
        <SectionTitle>Complete Traceability Flow</SectionTitle>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-5">
          <FlowStep title="Source Lots" value={t.lots.length ? t.lots.map((l) => l.lot.lot_code).join(', ') : 'No lots'} active={t.lots.length > 0} />
          <FlowStep title="Export Batch" value={t.batch.batch_number} sub={formatKg(t.batch.total_quantity_kg)} active />
          <FlowStep title="Sales Order" value={t.order.order_number} sub={t.order.product_name} active />
          <FlowStep title="Customer" value={t.customer?.company_name || 'Unknown'} sub={t.customer?.country ?? undefined} active={Boolean(t.customer)} />
          <FlowStep title="Shipment" value={s.shipment_number} sub={prettyStatus(s.status)} active />
        </div>
      </div>

      <div className="mt-8">
        <SectionTitle>Shipment</SectionTitle>
        <div className="grid grid-cols-1 gap-6 md:grid-cols-4">
          <Detail title="Shipment" value={s.shipment_number} />
          <Detail title="Status" value={<StatusBadge status={s.status} />} />
          <Detail title="Vessel" value={s.vessel_name} />
          <Detail title="Container" value={s.container_number} />
          <Detail title="Carrier" value={s.carrier} />
          <Detail title="Destination" value={joinParts(s.destination_port, s.destination_country)} />
          <Detail title="Shipping Date" value={formatDate(s.shipping_date)} />
          <Detail title="Arrival" value={s.actual_arrival ? `${formatDate(s.actual_arrival)} (actual)` : s.estimated_arrival ? `${formatDate(s.estimated_arrival)} (ETA)` : null} />
          <Detail title="Export Batch" value={<span className="inline-flex items-center gap-2">{t.batch.batch_number} <StatusBadge status={t.batch.status} /></span>} />
          <Detail title="Sales Order" value={<span className="inline-flex items-center gap-2">{t.order.order_number} <StatusBadge status={t.order.status} /></span>} />
          <Detail title="Ordered Quantity" value={formatKg(t.order.quantity_kg)} />
          <Detail title="Customer" value={t.customer ? joinParts(t.customer.company_name, t.customer.country) : null} />
        </div>
      </div>

      <div className="mt-8">
        <SectionTitle>Source Lots</SectionTitle>
        {t.lots.length === 0 ? (
          <p className="text-sm text-gray-400">No lots are allocated to this shipment's batch.</p>
        ) : (
          <div className="space-y-4">
            {t.lots.map((l, i) => (
              <div key={`${l.lot.id}-${i}`} className="rounded-lg border border-gray-200 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold text-gray-900">{l.lot.lot_code}</span>
                    <StatusBadge status={l.lot.status} />
                    <span className="text-sm text-gray-600">
                      {formatKg(l.allocated_kg)} allocated
                      {l.warehouse ? ` from ${l.warehouse.name}${l.warehouse.code ? ` (${l.warehouse.code})` : ''}` : ''}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => onOpenLot(l.lot.id)}
                    className="rounded-lg border border-gray-300 px-3 py-2 text-xs font-medium text-gray-700 hover:bg-gray-50"
                  >
                    Full lot trace
                  </button>
                </div>
                <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-5">
                  <FlowStep title="Farmer" value={l.farmer?.name || 'Not linked'} sub={l.farmer?.farmer_code} active={Boolean(l.farmer)} />
                  <FlowStep title="Farm" value={l.farm?.farm_name || 'Not linked'} sub={l.farm?.altitude_meters ? `${l.farm.altitude_meters} m` : undefined} active={Boolean(l.farm)} />
                  <FlowStep title="Supplier" value={l.supplier?.name || 'Not linked'} sub={l.supplier?.supplier_code} active={Boolean(l.supplier)} />
                  <FlowStep title="Collection" value={l.collection?.collection_code || 'Not linked'} sub={l.collection ? formatDate(l.collection.collection_date) : undefined} active={Boolean(l.collection)} />
                  <FlowStep
                    title="Quality"
                    value={l.quality[0] ? prettyStatus(l.quality[0].approval_status === 'pending' ? l.quality[0].result : l.quality[0].approval_status) : 'Not inspected'}
                    sub={l.quality[0]?.cup_score != null ? `Cup ${l.quality[0].cup_score}` : l.quality[0]?.final_grade ? gradeLabel(l.quality[0].final_grade) : undefined}
                    active={Boolean(l.quality[0])}
                  />
                </div>
                <SourceDetails source={l} compact />
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="mt-8">
        <SectionTitle>Tracking Updates</SectionTitle>
        {t.updates.length === 0 ? (
          <p className="text-sm text-gray-400">No tracking updates yet.</p>
        ) : (
          <ol className="space-y-3 border-l border-gray-200 pl-4">
            {t.updates.map((u, i) => (
              <li key={i} className="relative">
                <span className="absolute -left-[21px] top-1.5 h-2.5 w-2.5 rounded-full bg-gray-400" />
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <span className="text-gray-500">{formatDateTime(u.event_time)}</span>
                  {u.status && <StatusBadge status={u.status} />}
                  {u.location && <span className="text-gray-500">· {u.location}</span>}
                </div>
                <p className="text-sm text-gray-900">{u.description}</p>
              </li>
            ))}
          </ol>
        )}
      </div>

      <DocumentList documents={t.documents} onOpen={onOpenDocument} />
    </>
  )
}

// ================================================================
// SHARED PIECES
// ================================================================

function SourceDetails({ source, compact = false }: { source: TraceLotSource; compact?: boolean }) {
  const { farm, farmer, supplier, collection, location } = source
  const lat = farm?.latitude ?? location?.latitude
  const lon = farm?.longitude ?? location?.longitude
  const mapLink =
    lat != null && lon != null ? (
      <a
        href={`https://www.openstreetmap.org/?mlat=${lat}&mlon=${lon}#map=14/${lat}/${lon}`}
        target="_blank"
        rel="noopener noreferrer"
        className="text-blue-700 underline hover:text-blue-900"
      >
        {Number(lat).toFixed(5)}, {Number(lon).toFixed(5)}
      </a>
    ) : null

  return (
    <div className={compact ? 'mt-4' : 'mt-8'}>
      {!compact && <SectionTitle>Source</SectionTitle>}
      <div className="grid grid-cols-1 gap-6 md:grid-cols-4">
        <Detail title="Farmer" value={farmer ? `${farmer.name} (${farmer.farmer_code})` : null} />
        <Detail title="Farm" value={farm ? `${farm.farm_name} (${farm.farm_code})` : null} />
        <Detail title="Farm Location" value={farm ? joinParts(farm.kebele, farm.woreda, farm.zone, farm.region) : location ? joinParts(location.name, location.woreda, location.zone, location.region) : null} />
        <Detail title="Altitude" value={farm?.altitude_meters ?? location?.altitude_meters ? `${farm?.altitude_meters ?? location?.altitude_meters} m` : null} />
        <Detail title="Coordinates" value={mapLink} />
        {!compact && <Detail title="Farm Area" value={farm?.area_hectares != null ? `${farm.area_hectares} ha` : null} />}
        {!compact && <Detail title="Variety" value={farm?.coffee_variety || collection?.variety} />}
        <Detail title="Supplier" value={supplier ? `${supplier.name} (${supplier.supplier_code})` : null} />
        {!compact && <Detail title="Supplier Type" value={supplier?.supplier_type ? prettyStatus(supplier.supplier_type) : null} />}
        <Detail title="Collection" value={collection ? `${collection.collection_code} · ${formatDate(collection.collection_date)}` : null} />
        <Detail title="Field Officer" value={collection?.field_officer?.full_name} />
        {!compact && <Detail title="Collected Quantity" value={collection ? formatKg(collection.quantity_kg) : null} />}
        {!compact && <Detail title="Collection Area" value={collection ? joinParts(collection.kebele, collection.woreda, collection.zone, collection.region) : null} />}
        {!compact && <Detail title="Coffee Type" value={collection?.coffee_type ? prettyStatus(collection.coffee_type) : null} />}
        {!compact && <Detail title="Collection Status" value={collection ? <StatusBadge status={collection.status} /> : null} />}
      </div>
      {compact && source.quality.length > 0 && (
        <div className="mt-4">
          <QualityTable rows={source.quality} />
        </div>
      )}
    </div>
  )
}

function QualityTable({ rows }: { rows: TraceLotSource['quality'] }) {
  return (
    <MiniTable
      headers={['Date', 'Sample', 'Result', 'Approval', 'Grade', 'Cup Score', 'Moisture', 'Defects', 'Inspector']}
      empty="No quality inspections recorded."
      rows={rows.map((q) => [
        formatDate(q.inspection_date),
        prettyStatus(q.sample_type),
        <StatusBadge key="r" status={q.result} />,
        <StatusBadge key="a" status={q.approval_status} />,
        q.final_grade || '—',
        q.cup_score != null ? String(q.cup_score) : '—',
        q.moisture != null ? `${q.moisture}%` : '—',
        q.defect_count != null ? String(q.defect_count) : '—',
        q.inspector || '—',
      ])}
    />
  )
}

function DocumentList({ documents, onOpen }: { documents: { id: string; title: string; document_type: string; related_type?: string }[]; onOpen: (id: string) => void }) {
  return (
    <div className="mt-8">
      <SectionTitle>Documents</SectionTitle>
      {documents.length === 0 ? (
        <p className="text-sm text-gray-400">No documents attached.</p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {documents.map((d) => (
            <button
              key={d.id}
              type="button"
              onClick={() => onOpen(d.id)}
              className="rounded-lg border border-gray-300 px-3 py-2 text-left text-xs hover:bg-gray-50"
            >
              <span className="block font-medium text-gray-900">{d.title}</span>
              <span className="block text-gray-500">
                {prettyStatus(d.document_type)}
                {d.related_type ? ` · ${prettyStatus(d.related_type)}` : ''}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function MiniTable({ headers, rows, empty }: { headers: string[]; rows: ReactNode[][]; empty: string }) {
  if (rows.length === 0) return <p className="text-sm text-gray-400">{empty}</p>
  return (
    <div className="overflow-x-auto rounded-lg border border-gray-200">
      <table className="min-w-full text-sm">
        <thead className="bg-gray-50">
          <tr>
            {headers.map((h) => (
              <th key={h} className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-gray-600">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {rows.map((row, i) => (
            <tr key={i}>
              {row.map((cell, j) => (
                <td key={j} className="px-4 py-2 text-gray-700">
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function PanelHeader({ title, subtitle, onClose }: { title: string; subtitle: string; onClose: () => void }) {
  return (
    <div className="flex items-center justify-between">
      <div>
        <h2 className="text-lg font-semibold text-gray-900">{title}</h2>
        <p className="text-sm text-gray-500">{subtitle}</p>
      </div>
      <button type="button" onClick={onClose} className="rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50">
        Close
      </button>
    </div>
  )
}

function SectionTitle({ children }: { children: ReactNode }) {
  return <h3 className="mb-4 text-sm font-semibold uppercase tracking-wide text-gray-700">{children}</h3>
}

function SummaryTile({ title, value, hint }: { title: string; value: string; hint?: string }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <p className="text-sm text-gray-500">{title}</p>
      <p className="mt-2 text-2xl font-bold text-gray-900">{value}</p>
      {hint && <p className="mt-1 text-xs text-gray-400">{hint}</p>}
    </div>
  )
}

// ================================================================
// DETAIL COMPONENT
// ================================================================

function Detail({ title, value }: { title: string; value: ReactNode }) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">{title}</p>

      <div className="mt-1 text-sm text-gray-900">{value === null || value === undefined || value === '' ? '—' : value}</div>
    </div>
  )
}

// ================================================================
// FLOW STEP COMPONENT
// ================================================================

function FlowStep({ title, value, sub, active }: { title: string; value: string; sub?: string | null; active: boolean }) {
  return (
    <div className={`rounded-lg border p-4 ${active ? 'border-gray-300 bg-gray-50' : 'border-gray-200 bg-white'}`}>
      <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">{title}</p>

      <p className={`mt-2 break-words text-sm ${active ? 'font-medium text-gray-900' : 'text-gray-400'}`}>{value}</p>
      {sub && <p className="mt-1 break-words text-xs text-gray-500">{sub}</p>}
    </div>
  )
}
