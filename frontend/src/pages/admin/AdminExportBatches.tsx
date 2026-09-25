import { useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import { Link } from 'react-router-dom'

import { errorMessage } from '../../lib/api'
import { useAuth } from '../../contexts/AuthContext'
import { useDebounce } from '../../hooks'
import {
  useAvailableStock,
  useBatchActions,
  useEligibleOrders,
  useExportBatch,
  useExportBatches,
  useNextStatuses,
} from '../../queries/admin'
import {
  EmptyState,
  ErrorState,
  Field,
  LoadingState,
  Modal,
  Pagination,
  StatusBadge,
  formatDate,
  formatDateTime,
  formatKg,
  prettyStatus,
  useConfirm,
  useFlash,
} from '../../components/admin/ui'
import DocumentsPanel from '../../components/admin/DocumentsPanel'
import type { ExportBatch } from '../../types'

type FormState = {
  sales_order_id: string
  notes: string
}

const initialForm: FormState = {
  sales_order_id: '',
  notes: '',
}

const PAGE_SIZE = 50
const MANUAL_STATUSES = ['preparing', 'ready', 'approved'] as const
type ManualStatus = (typeof MANUAL_STATUSES)[number]
const CANCELLABLE = ['preparing', 'ready', 'approved']

function hasActiveShipment(batch: ExportBatch) {
  return (batch.shipments ?? []).some((s) => s.status !== 'cancelled')
}

export default function AdminExportBatches() {
  const { can } = useAuth()
  const canCreate = can('export_batches', 'create')
  const canUpdate = can('export_batches', 'update')
  const flash = useFlash()
  const { confirm, dialog } = useConfirm()
  const { create, setStatus } = useBatchActions()

  // --- list ----------------------------------------------------------------
  const [search, setSearch] = useState('')
  const debouncedSearch = useDebounce(search.trim(), { delay: 400 })
  const [statusFilter, setStatusFilter] = useState('all')
  const [page, setPage] = useState(1)
  const batchesQuery = useExportBatches({
    page,
    limit: PAGE_SIZE,
    sort: '-created_at',
    search: debouncedSearch || undefined,
    status: statusFilter === 'all' ? undefined : statusFilter,
  })
  const batches = batchesQuery.data?.data ?? []
  const totalBatches = batchesQuery.data?.meta.total ?? 0
  const preparingQuery = useExportBatches({ status: 'preparing', limit: 1 })

  const [detailId, setDetailId] = useState<string | null>(null)
  const [updating, setUpdating] = useState<string | null>(null)

  // --- create form ---------------------------------------------------------
  const [form, setForm] = useState<FormState>(initialForm)
  const [showForm, setShowForm] = useState(false)
  /** inventory row id → quantity text */
  const [allocations, setAllocations] = useState<Record<string, string>>({})
  const [stockSearch, setStockSearch] = useState('')
  const debouncedStockSearch = useDebounce(stockSearch.trim(), { delay: 400 })

  const ordersQuery = useEligibleOrders()
  const orders = ordersQuery.data ?? []
  const stockQuery = useAvailableStock(debouncedStockSearch ? { search: debouncedStockSearch } : {})
  const stock = stockQuery.data ?? []

  function openCreateForm() {
    setForm(initialForm)
    setAllocations({})
    setStockSearch('')
    setShowForm(true)
  }

  function closeForm() {
    setShowForm(false)
    setForm(initialForm)
    setAllocations({})
  }

  function toggleRow(rowId: string) {
    setAllocations((current) => {
      const next = { ...current }
      if (next[rowId] !== undefined) delete next[rowId]
      else next[rowId] = ''
      return next
    })
  }

  const selectedRowIds = Object.keys(allocations)

  const selectedTotal = useMemo(
    () =>
      Object.values(allocations).reduce((total, value) => {
        const quantity = Number(value || 0)
        return total + (Number.isFinite(quantity) ? quantity : 0)
      }, 0),
    [allocations]
  )

  const selectedOrder = orders.find((order) => order.id === form.sales_order_id)
  const remainingKg = selectedOrder ? Number(selectedOrder.remaining_kg) : null

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()

    if (!form.sales_order_id || !selectedOrder) {
      flash.error(new Error('Please select a sales order.'))
      return
    }
    if (selectedRowIds.length === 0) {
      flash.error(new Error('Please allocate at least one stock row.'))
      return
    }

    const payload: { lot_id: string; warehouse_id: string; quantity_kg: number }[] = []
    for (const rowId of selectedRowIds) {
      const row = stock.find((r) => r.id === rowId)
      const quantity = Number(allocations[rowId])
      if (!row) {
        flash.error(new Error('A selected stock row is no longer available. Please re-select.'))
        return
      }
      if (!row.exportable) {
        flash.error(new Error(`${row.lot.lot_code} is not quality-approved for export.`))
        return
      }
      if (!Number.isFinite(quantity) || quantity <= 0) {
        flash.error(new Error(`Enter a quantity greater than 0 for ${row.lot.lot_code}.`))
        return
      }
      if (quantity > Number(row.quantity_kg)) {
        flash.error(
          new Error(
            `${row.lot.lot_code} only has ${Number(row.quantity_kg).toLocaleString()} KG in ${row.warehouse?.name ?? 'this warehouse'}.`
          )
        )
        return
      }
      payload.push({ lot_id: row.lot_id, warehouse_id: row.warehouse_id, quantity_kg: quantity })
    }

    if (remainingKg !== null && selectedTotal > remainingKg) {
      flash.error(
        new Error(
          `Allocations total ${selectedTotal.toLocaleString()} KG, but only ${remainingKg.toLocaleString()} KG of ${selectedOrder.order_number} is still unallocated.`
        )
      )
      return
    }

    try {
      const batch = await create.mutateAsync({
        sales_order_id: form.sales_order_id,
        allocations: payload,
        notes: form.notes.trim() || undefined,
      })
      flash.success(`Export batch ${batch.batch_number} was created and the stock was allocated.`)
      closeForm()
    } catch (err) {
      flash.error(err)
    }
  }

  async function changeStatus(batch: ExportBatch, status: ManualStatus, label: string) {
    setUpdating(batch.id)
    try {
      await setStatus.mutateAsync({ id: batch.id, status })
      flash.success(`${batch.batch_number}: ${label}.`)
    } catch (err) {
      flash.error(err)
    } finally {
      setUpdating(null)
    }
  }

  async function cancelBatch(batch: ExportBatch) {
    const reason = await confirm({
      title: `Cancel ${batch.batch_number}?`,
      message: `Cancelling releases all ${Number(batch.total_quantity_kg).toLocaleString()} KG allocated to this batch back into warehouse stock. This cannot be undone.`,
      confirmLabel: 'Cancel batch',
      danger: true,
      withReason: true,
      reasonRequired: true,
    })
    if (typeof reason !== 'string' || !reason) return

    setUpdating(batch.id)
    try {
      await setStatus.mutateAsync({ id: batch.id, status: 'cancelled', reason })
      flash.success(`${batch.batch_number} was cancelled and its stock released.`)
    } catch (err) {
      flash.error(err)
    } finally {
      setUpdating(null)
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Export Batches</h1>

          <p className="mt-1 text-sm text-gray-500">
            Prepare export batches from accepted sales orders by allocating warehouse stock.
          </p>
        </div>

        {canCreate && (
          <button
            type="button"
            onClick={openCreateForm}
            className="rounded-lg bg-black px-4 py-2.5 text-sm font-medium text-white hover:bg-gray-800"
          >
            + New Export Batch
          </button>
        )}
      </div>

      {/* Messages */}
      {flash.banner}

      {/* Create Batch */}
      {showForm && canCreate && (
        <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
          <div className="mb-6 flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Create Export Batch</h2>

              <p className="mt-1 text-sm text-gray-500">
                Select a sales order and allocate quality-approved stock. The batch number is assigned automatically.
              </p>
            </div>

            <button type="button" onClick={closeForm} className="text-sm font-medium text-gray-500 hover:text-gray-900">
              Cancel
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Sales Order */}
            <div>
              <h3 className="mb-4 text-sm font-semibold uppercase tracking-wide text-gray-700">Sales Order</h3>

              <select
                value={form.sales_order_id}
                onChange={(e) => setForm({ ...form, sales_order_id: e.target.value })}
                className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm outline-none focus:border-black"
                required
                disabled={ordersQuery.isLoading}
              >
                <option value="">{ordersQuery.isLoading ? 'Loading orders…' : 'Select sales order'}</option>

                {orders.map((order) => (
                  <option key={order.id} value={order.id}>
                    {order.order_number} • {order.customer?.company_name || 'Customer'} • {order.product_name} •{' '}
                    {Number(order.remaining_kg).toLocaleString()} of {Number(order.quantity_kg).toLocaleString()} KG
                    remaining
                  </option>
                ))}
              </select>

              {ordersQuery.error ? (
                <p className="mt-2 text-xs text-red-600">
                  Could not load orders.{' '}
                  <button type="button" className="underline" onClick={() => ordersQuery.refetch()}>
                    Retry
                  </button>
                </p>
              ) : (
                !ordersQuery.isLoading &&
                orders.length === 0 && (
                  <p className="mt-2 text-xs text-gray-500">
                    No accepted sales orders have unallocated quantity. Orders appear here once Export accepts them.
                  </p>
                )
              )}

              {selectedOrder && (
                <div className="mt-4 rounded-lg bg-gray-50 p-4">
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-5">
                    <div>
                      <p className="text-xs text-gray-500">Customer</p>
                      <p className="mt-1 text-sm font-medium text-gray-900">{selectedOrder.customer?.company_name || '-'}</p>
                    </div>

                    <div>
                      <p className="text-xs text-gray-500">Product</p>
                      <p className="mt-1 text-sm font-medium text-gray-900">{selectedOrder.product_name}</p>
                      <p className="text-xs text-gray-500">
                        {[selectedOrder.origin, selectedOrder.grade, selectedOrder.processing_method].filter(Boolean).join(' • ') || ''}
                      </p>
                    </div>

                    <div>
                      <p className="text-xs text-gray-500">Order Quantity</p>
                      <p className="mt-1 text-sm font-medium text-gray-900">
                        {Number(selectedOrder.quantity_kg).toLocaleString()} KG
                      </p>
                    </div>

                    <div>
                      <p className="text-xs text-gray-500">Remaining to Allocate</p>
                      <p className="mt-1 text-sm font-medium text-gray-900">
                        {Number(selectedOrder.remaining_kg).toLocaleString()} KG
                      </p>
                    </div>

                    <div>
                      <p className="text-xs text-gray-500">Destination</p>
                      <p className="mt-1 text-sm font-medium text-gray-900">
                        {selectedOrder.destination_country || '-'}
                        {selectedOrder.destination_port ? ` • ${selectedOrder.destination_port}` : ''}
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Stock */}
            <div>
              <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <h3 className="text-sm font-semibold uppercase tracking-wide text-gray-700">Available Stock</h3>

                <div className="flex items-center gap-4">
                  <input
                    type="text"
                    value={stockSearch}
                    onChange={(e) => setStockSearch(e.target.value)}
                    placeholder="Search lot code or origin..."
                    className="w-64 rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-black"
                  />
                  <div className="text-sm font-medium text-gray-700">Selected: {selectedTotal.toLocaleString()} KG</div>
                </div>
              </div>

              <div className="overflow-hidden rounded-lg border border-gray-200">
                {stockQuery.isLoading ? (
                  <LoadingState label="Loading available stock..." />
                ) : stockQuery.error ? (
                  <ErrorState error={stockQuery.error} onRetry={() => stockQuery.refetch()} />
                ) : stock.length === 0 ? (
                  <div className="px-6 py-10 text-center text-sm text-gray-500">No stock is available for export.</div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="min-w-full">
                      <thead className="bg-gray-50">
                        <tr>
                          {['Select', 'Lot', 'Origin', 'Grade', 'Warehouse', 'Quality', 'Available', 'Allocate KG'].map((h) => (
                            <th key={h} className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                              {h}
                            </th>
                          ))}
                        </tr>
                      </thead>

                      <tbody className="divide-y divide-gray-100">
                        {stock.map((row) => {
                          const selected = allocations[row.id] !== undefined
                          return (
                            <tr
                              key={row.id}
                              className={!row.exportable ? 'bg-gray-50 opacity-60' : selected ? 'bg-gray-50' : ''}
                            >
                              <td className="px-4 py-4">
                                <input
                                  type="checkbox"
                                  checked={selected}
                                  disabled={!row.exportable}
                                  onChange={() => toggleRow(row.id)}
                                  className="h-4 w-4 rounded border-gray-300"
                                  aria-label={`Allocate ${row.lot.lot_code}`}
                                />
                              </td>

                              <td className="px-4 py-4">
                                <p className="text-sm font-semibold text-gray-900">{row.lot.lot_code}</p>
                                <p className="mt-1 text-xs text-gray-500">{row.lot.processing_method || '-'}</p>
                              </td>

                              <td className="px-4 py-4 text-sm text-gray-700">{row.lot.origin}</td>

                              <td className="px-4 py-4 text-sm text-gray-700">{row.quality?.final_grade || row.lot.grade || '-'}</td>

                              <td className="px-4 py-4 text-sm text-gray-700">
                                {row.warehouse ? `${row.warehouse.code} — ${row.warehouse.name}` : '-'}
                              </td>

                              <td className="px-4 py-4 text-xs text-gray-700">
                                {row.exportable ? (
                                  <span className="font-medium text-green-700">
                                    Approved{row.quality?.cup_score != null ? ` • Cup ${row.quality.cup_score}` : ''}
                                  </span>
                                ) : (
                                  <span className="font-medium text-red-700">
                                    {row.quality ? `${prettyStatus(row.quality.approval_status)} — not exportable` : 'No quality approval'}
                                  </span>
                                )}
                              </td>

                              <td className="px-4 py-4 text-sm text-gray-700">{Number(row.quantity_kg).toLocaleString()} KG</td>

                              <td className="px-4 py-4">
                                <input
                                  type="number"
                                  min="0.01"
                                  step="0.01"
                                  max={row.quantity_kg}
                                  disabled={!selected}
                                  value={selected ? allocations[row.id] : ''}
                                  onChange={(e) => setAllocations((current) => ({ ...current, [row.id]: e.target.value }))}
                                  placeholder="0.00"
                                  className="w-32 rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-black disabled:bg-gray-100"
                                />
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>

            {/* Notes */}
            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700">Notes</label>

              <textarea
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                rows={4}
                maxLength={2000}
                placeholder="Batch preparation notes..."
                className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm outline-none focus:border-black"
              />
            </div>

            {/* Total */}
            <div className="rounded-lg bg-gray-50 p-4">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-gray-600">Total Export Quantity</span>
                <span className={`text-xl font-bold ${remainingKg !== null && selectedTotal > remainingKg ? 'text-red-600' : 'text-gray-900'}`}>
                  {selectedTotal.toLocaleString()} KG
                </span>
              </div>

              {selectedOrder && (
                <div className="mt-2 flex items-center justify-between text-xs text-gray-500">
                  <span>Remaining on Sales Order</span>
                  <span>{Number(selectedOrder.remaining_kg).toLocaleString()} KG</span>
                </div>
              )}
            </div>

            {/* Actions */}
            <div className="flex justify-end gap-3 border-t border-gray-200 pt-5">
              <button
                type="button"
                onClick={closeForm}
                className="rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>

              <button
                type="submit"
                disabled={create.isPending}
                className="rounded-lg bg-black px-5 py-2.5 text-sm font-medium text-white hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {create.isPending ? 'Creating...' : 'Create Export Batch'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Filters */}
      <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <div className="md:col-span-2">
            <label className="mb-1.5 block text-sm font-medium text-gray-700">Search</label>

            <input
              type="text"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value)
                setPage(1)
              }}
              placeholder="Search batch number, destination, notes..."
              className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm outline-none focus:border-black"
            />
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700">Status</label>

            <select
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value)
                setPage(1)
              }}
              className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm outline-none focus:border-black"
            >
              <option value="all">All statuses</option>
              <option value="preparing">Preparing</option>
              <option value="ready">Ready</option>
              <option value="approved">Approved</option>
              <option value="shipped">Shipped</option>
              <option value="completed">Completed</option>
              <option value="cancelled">Cancelled</option>
            </select>
          </div>
        </div>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <p className="text-sm text-gray-500">Export Batches</p>
          <p className="mt-1 text-2xl font-bold text-gray-900">{totalBatches}</p>
        </div>

        <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <p className="text-sm text-gray-500">Total Export Quantity</p>
          <p className="mt-1 text-2xl font-bold text-gray-900">
            {batches.reduce((sum, batch) => sum + Number(batch.total_quantity_kg || 0), 0).toLocaleString()} KG
          </p>
          {totalBatches > batches.length && <p className="mt-1 text-xs text-gray-500">This page only</p>}
        </div>

        <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <p className="text-sm text-gray-500">Preparing</p>
          <p className="mt-1 text-2xl font-bold text-gray-900">{preparingQuery.data?.meta.total ?? '-'}</p>
        </div>
      </div>

      {/* Batch Table */}
      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        <div className="border-b border-gray-200 px-6 py-4">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-700">Export Batch List</h2>
        </div>

        {batchesQuery.isLoading ? (
          <LoadingState label="Loading export batches..." />
        ) : batchesQuery.error ? (
          <ErrorState error={batchesQuery.error} onRetry={() => batchesQuery.refetch()} />
        ) : batches.length === 0 ? (
          <EmptyState
            title="No export batches found"
            description={search || statusFilter !== 'all' ? 'Try clearing the filters.' : 'Create an export batch from an accepted sales order.'}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full">
              <thead className="bg-gray-50">
                <tr>
                  {['Batch', 'Sales Order', 'Customer', 'Quantity', 'Lots', 'Status'].map((h) => (
                    <th key={h} className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                      {h}
                    </th>
                  ))}
                  <th className="px-6 py-3 text-right text-xs font-semibold uppercase tracking-wide text-gray-500">Actions</th>
                </tr>
              </thead>

              <tbody className="divide-y divide-gray-100">
                {batches.map((batch) => {
                  const lotsForBatch = batch.lots ?? []
                  return (
                    <tr key={batch.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4">
                        <button
                          type="button"
                          onClick={() => setDetailId(batch.id)}
                          className="text-left text-sm font-semibold text-gray-900 hover:underline"
                        >
                          {batch.batch_number}
                        </button>
                        <p className="mt-1 text-xs text-gray-500">{formatDate(batch.created_at)}</p>
                      </td>

                      <td className="px-6 py-4">
                        <p className="text-sm font-medium text-gray-900">{batch.sales_order?.order_number || '-'}</p>
                        <p className="mt-1 text-xs text-gray-500">{batch.sales_order?.product_name || '-'}</p>
                      </td>

                      <td className="px-6 py-4 text-sm text-gray-700">{batch.sales_order?.customer?.company_name || '-'}</td>

                      <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-700">
                        {Number(batch.total_quantity_kg).toLocaleString()} KG
                      </td>

                      <td className="px-6 py-4">
                        {lotsForBatch.length === 0 ? (
                          <span className="text-sm text-gray-500">-</span>
                        ) : (
                          <div className="space-y-1">
                            {lotsForBatch.slice(0, 3).map((item) => (
                              <div key={item.id} className={`text-xs ${item.released_at ? 'text-gray-400 line-through' : 'text-gray-700'}`}>
                                {item.lot?.lot_code || '-'} • {Number(item.quantity_kg).toLocaleString()} KG
                              </div>
                            ))}

                            {lotsForBatch.length > 3 && (
                              <div className="text-xs text-gray-500">+{lotsForBatch.length - 3} more</div>
                            )}
                          </div>
                        )}
                      </td>

                      <td className="px-6 py-4">
                        <StatusBadge status={batch.status} />
                      </td>

                      <td className="px-6 py-4">
                        <BatchRowActions
                          batch={batch}
                          canUpdate={canUpdate}
                          busy={updating === batch.id}
                          onView={() => setDetailId(batch.id)}
                          onStatus={(status, label) => changeStatus(batch, status, label)}
                          onCancel={() => cancelBatch(batch)}
                        />
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
        <Pagination page={page} limit={PAGE_SIZE} total={totalBatches} onPage={setPage} />
      </div>

      {detailId && (
        <BatchDetailModal
          id={detailId}
          canUpdate={canUpdate}
          onClose={() => setDetailId(null)}
          onSaved={(msg) => flash.success(msg)}
        />
      )}

      {dialog}
    </div>
  )
}

// -----------------------------------------------------------------------------
// Row actions: only the workflow moves the user's role may make
// -----------------------------------------------------------------------------
function BatchRowActions({
  batch,
  canUpdate,
  busy,
  onView,
  onStatus,
  onCancel,
}: {
  batch: ExportBatch
  canUpdate: boolean
  busy: boolean
  onView: () => void
  onStatus: (status: ManualStatus, label: string) => void
  onCancel: () => void
}) {
  const moves = useNextStatuses('export_batch', batch.status).filter((t): t is typeof t & { to_status: ManualStatus } =>
    (MANUAL_STATUSES as readonly string[]).includes(t.to_status)
  )
  const shippable = ['ready', 'approved'].includes(batch.status) && !hasActiveShipment(batch)

  return (
    <div className="flex flex-col items-end gap-2">
      <div className="flex flex-wrap justify-end gap-2">
        <button
          type="button"
          onClick={onView}
          className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-xs font-medium text-gray-700 hover:bg-gray-50"
        >
          View
        </button>

        {canUpdate &&
          moves.map((move) => {
            const label = move.label ?? prettyStatus(move.to_status)
            const forward = (move.from_status === 'preparing' && move.to_status === 'ready') || move.to_status === 'approved'
            return (
              <button
                key={move.to_status}
                type="button"
                disabled={busy}
                onClick={() => onStatus(move.to_status, label)}
                className={
                  forward
                    ? 'rounded-lg bg-black px-3 py-2 text-xs font-medium text-white hover:bg-gray-800 disabled:opacity-50'
                    : 'rounded-lg border border-gray-300 bg-white px-3 py-2 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50'
                }
              >
                {label}
              </button>
            )
          })}

        {canUpdate && CANCELLABLE.includes(batch.status) && (
          <button
            type="button"
            disabled={busy}
            onClick={onCancel}
            className="rounded-lg border border-red-200 bg-white px-3 py-2 text-xs font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
          >
            Cancel batch
          </button>
        )}
      </div>

      {shippable && (
        <p className="text-right text-xs text-gray-500">
          Next:{' '}
          <Link to="/admin/shipments" className="font-medium text-gray-900 underline">
            Create shipment
          </Link>{' '}
          — shipped/completed follow the shipment.
        </p>
      )}
    </div>
  )
}

// -----------------------------------------------------------------------------
// Detail modal
// -----------------------------------------------------------------------------
function BatchDetailModal({
  id,
  canUpdate,
  onClose,
  onSaved,
}: {
  id: string
  canUpdate: boolean
  onClose: () => void
  onSaved: (message: string) => void
}) {
  const detailQuery = useExportBatch(id)
  const batch = detailQuery.data
  const { update } = useBatchActions()
  const [notes, setNotes] = useState<string | null>(null)
  const [notesError, setNotesError] = useState('')

  const notesValue = notes ?? batch?.notes ?? ''
  const notesDirty = notes !== null && notes.trim() !== (batch?.notes ?? '').trim()

  async function saveNotes() {
    if (!batch) return
    setNotesError('')
    try {
      await update.mutateAsync({ id: batch.id, notes: notesValue.trim() || null })
      setNotes(null)
      onSaved(`Notes of ${batch.batch_number} saved.`)
    } catch (err) {
      setNotesError(errorMessage(err, 'Could not save notes.'))
    }
  }

  return (
    <Modal open size="xl" title={batch ? `Export batch ${batch.batch_number}` : 'Export batch'} onClose={onClose}>
      {detailQuery.isLoading ? (
        <LoadingState label="Loading batch..." />
      ) : detailQuery.error || !batch ? (
        <ErrorState error={detailQuery.error} onRetry={() => detailQuery.refetch()} />
      ) : (
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            <Field label="Status" value={<StatusBadge status={batch.status} />} />
            <Field label="Total quantity" value={formatKg(batch.total_quantity_kg)} />
            <Field label="Created" value={formatDateTime(batch.created_at)} />
            <Field label="Export manager" value={batch.export_manager?.full_name || batch.export_manager?.email} />
            <Field label="Sales order" value={batch.sales_order?.order_number} />
            <Field
              label="Customer"
              value={
                batch.sales_order?.customer
                  ? `${batch.sales_order.customer.company_name}${batch.sales_order.customer.customer_code ? ` (${batch.sales_order.customer.customer_code})` : ''}`
                  : null
              }
            />
            <Field label="Product" value={batch.sales_order?.product_name} />
            <Field
              label="Destination"
              value={
                [batch.destination_country || batch.sales_order?.destination_country, batch.destination_port || batch.sales_order?.destination_port]
                  .filter(Boolean)
                  .join(' • ') || null
              }
            />
            {batch.shipped_at && <Field label="Shipped" value={formatDateTime(batch.shipped_at)} />}
            {batch.completed_at && <Field label="Completed" value={formatDateTime(batch.completed_at)} />}
            {batch.cancelled_at && <Field label="Cancelled" value={formatDateTime(batch.cancelled_at)} />}
          </div>

          {/* Allocations */}
          <div>
            <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-700">Allocated stock</h3>
            {(batch.lots ?? []).length === 0 ? (
              <p className="text-sm text-gray-500">No allocations.</p>
            ) : (
              <div className="overflow-x-auto rounded-lg border border-gray-200">
                <table className="min-w-full">
                  <thead className="bg-gray-50">
                    <tr>
                      {['Lot', 'Origin', 'Grade', 'Warehouse', 'Quantity', 'Stock'].map((h) => (
                        <th key={h} className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {(batch.lots ?? []).map((a) => (
                      <tr key={a.id}>
                        <td className="px-4 py-2 text-sm font-medium text-gray-900">{a.lot?.lot_code || '-'}</td>
                        <td className="px-4 py-2 text-sm text-gray-700">{a.lot?.origin || '-'}</td>
                        <td className="px-4 py-2 text-sm text-gray-700">{a.lot?.grade || '-'}</td>
                        <td className="px-4 py-2 text-sm text-gray-700">
                          {a.warehouse ? `${a.warehouse.code} — ${a.warehouse.name}` : '-'}
                        </td>
                        <td className="px-4 py-2 text-sm text-gray-700">{formatKg(a.quantity_kg)}</td>
                        <td className="px-4 py-2 text-xs">
                          {a.released_at ? (
                            <span className="text-gray-500">Released {formatDate(a.released_at)}</span>
                          ) : (
                            <span className="text-green-700">Allocated</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Shipments */}
          <div>
            <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-700">Shipments</h3>
            {(batch.shipments ?? []).length === 0 ? (
              <p className="text-sm text-gray-500">
                No shipment yet.
                {['ready', 'approved'].includes(batch.status) && (
                  <>
                    {' '}
                    <Link to="/admin/shipments" className="font-medium text-gray-900 underline">
                      Create shipment
                    </Link>
                  </>
                )}
              </p>
            ) : (
              <ul className="space-y-2">
                {(batch.shipments ?? []).map((s) => (
                  <li key={s.id} className="flex items-center gap-3 text-sm">
                    <Link to="/admin/shipments" className="font-medium text-gray-900 hover:underline">
                      {s.shipment_number}
                    </Link>
                    <StatusBadge status={s.status} />
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Notes */}
          <div>
            <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-700">Notes</h3>
            {canUpdate ? (
              <>
                <textarea
                  rows={3}
                  maxLength={2000}
                  value={notesValue}
                  onChange={(e) => setNotes(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm outline-none focus:border-black"
                />
                {notesError && <p className="mt-1 text-xs text-red-600">{notesError}</p>}
                <div className="mt-2 flex justify-end">
                  <button
                    type="button"
                    disabled={!notesDirty || update.isPending}
                    onClick={saveNotes}
                    className="rounded-lg bg-black px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50"
                  >
                    {update.isPending ? 'Saving...' : 'Save notes'}
                  </button>
                </div>
              </>
            ) : (
              <p className="whitespace-pre-wrap text-sm text-gray-700">{batch.notes || '-'}</p>
            )}
          </div>

          <DocumentsPanel relatedType="export_batch" relatedId={batch.id} defaultType="packing_list" />
        </div>
      )}
    </Modal>
  )
}
