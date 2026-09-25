import { useState } from 'react'
import type { FormEvent } from 'react'

import { downloadCsv, errorMessage } from '../../lib/api'
import { canonicalRole } from '../../lib/permissions'
import { useAuth } from '../../contexts/AuthContext'
import { useDebounce } from '../../hooks'
import {
  useInventory,
  useInventoryActions,
  useReceivableLots,
  useStockMovements,
  useWarehouses,
} from '../../queries/admin'
import {
  EmptyState,
  ErrorState,
  LoadingState,
  Modal,
  Pagination,
  formatDate,
  formatDateTime,
  formatKg,
  prettyStatus,
  useFlash,
} from '../../components/admin/ui'
import type { InventoryItem, TransactionType, Warehouse } from '../../types'

type ReceiveForm = {
  lot_id: string
  warehouse_id: string
  quantity_kg: string
  bag_count: string
  weight_per_bag_kg: string
  unit_cost_per_kg: string
  shipping_cost: string
  par_level_bags: string
  received_date: string
  notes: string
}

const today = () => new Date().toISOString().split('T')[0]

const emptyForm = (): ReceiveForm => ({
  lot_id: '',
  warehouse_id: '',
  quantity_kg: '',
  bag_count: '',
  weight_per_bag_kg: '',
  unit_cost_per_kg: '',
  shipping_cost: '',
  par_level_bags: '',
  received_date: today(),
  notes: '',
})

const STOCK_ROLES = ['warehouse_officer', 'admin', 'super_admin']

const MOVEMENT_TYPES: TransactionType[] = [
  'receipt',
  'issue',
  'adjustment_in',
  'adjustment_out',
  'transfer_in',
  'transfer_out',
  'export_allocation',
  'export_release',
]
const INCOMING: TransactionType[] = ['receipt', 'adjustment_in', 'transfer_in', 'export_release', 'in']

const PAGE_SIZE = 50
const MOVEMENT_PAGE_SIZE = 25

const inputClass =
  'w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm outline-none focus:border-black'
const labelClass = 'mb-1.5 block text-sm font-medium text-gray-700'

/** '' → null; otherwise the number (NaN when invalid, caught by validation). */
function optionalNumber(value: string): number | null {
  return value.trim() === '' ? null : Number(value)
}

function invalidOptional(value: number | null, { int = false, max }: { int?: boolean; max?: number } = {}) {
  if (value === null) return false
  if (!Number.isFinite(value) || value < 0) return true
  if (int && !Number.isInteger(value)) return true
  return max !== undefined && value > max
}

function warehouseLabel(w: Pick<Warehouse, 'code' | 'name'> | null | undefined) {
  if (!w) return '—'
  return `${w.code || 'Warehouse'} — ${w.name || ''}`
}

function trueCost(item: InventoryItem): number | null {
  if (item.total_cost !== undefined) return item.total_cost
  if (item.unit_cost_per_kg === null) return null
  return Number(item.quantity_kg || 0) * Number(item.unit_cost_per_kg) + Number(item.shipping_cost || 0)
}

type RowAction = { kind: 'edit' | 'adjust' | 'issue' | 'transfer'; item: InventoryItem }

export default function AdminInventory() {
  const { role, can } = useAuth()
  const flash = useFlash()
  const canMoveStock = STOCK_ROLES.includes(canonicalRole(role) ?? '') && can('inventory', 'update')

  // --- filters -------------------------------------------------------------
  const [search, setSearch] = useState('')
  const debouncedSearch = useDebounce(search.trim(), { delay: 400 })
  const [warehouseFilter, setWarehouseFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [lowStockOnly, setLowStockOnly] = useState(false)
  const [inStockOnly, setInStockOnly] = useState(false)
  const [page, setPage] = useState(1)

  const inventoryQuery = useInventory({
    page,
    limit: PAGE_SIZE,
    sort: '-updated_at',
    search: debouncedSearch || undefined,
    warehouse_id: warehouseFilter || undefined,
    status: statusFilter || undefined,
    low_stock: lowStockOnly || undefined,
    in_stock: inStockOnly || undefined,
  })
  const inventory = inventoryQuery.data?.data ?? []
  const total = inventoryQuery.data?.meta.total ?? 0

  const warehousesQuery = useWarehouses({ status: 'active', limit: 200, sort: 'name' })
  const warehouses = warehousesQuery.data?.data ?? []

  const receivableQuery = useReceivableLots()
  const receivableLots = receivableQuery.data ?? []

  // --- receive form --------------------------------------------------------
  const [form, setForm] = useState<ReceiveForm>(emptyForm)
  const [showForm, setShowForm] = useState(false)
  const { receive } = useInventoryActions()

  const [action, setAction] = useState<RowAction | null>(null)

  function resetForm() {
    setForm(emptyForm())
    setShowForm(false)
  }

  const selectedLot = receivableLots.find((lot) => lot.id === form.lot_id)
  const remainingQuantity = selectedLot ? Number(selectedLot.remaining_kg) : null

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()

    if (!form.lot_id || !selectedLot) {
      flash.error(new Error('Please select an approved coffee lot.'))
      return
    }
    if (!form.warehouse_id) {
      flash.error(new Error('Please select a warehouse.'))
      return
    }
    const quantity = Number(form.quantity_kg)
    if (!Number.isFinite(quantity) || quantity <= 0) {
      flash.error(new Error('Please enter a valid quantity greater than 0.'))
      return
    }
    if (remainingQuantity !== null && quantity > remainingQuantity) {
      flash.error(
        new Error(`Only ${remainingQuantity.toLocaleString()} kg of lot ${selectedLot.lot_code} is still to be received.`)
      )
      return
    }

    const bagCount = optionalNumber(form.bag_count)
    const weightPerBag = optionalNumber(form.weight_per_bag_kg)
    const unitCost = optionalNumber(form.unit_cost_per_kg)
    const shipping = optionalNumber(form.shipping_cost)
    const parLevel = optionalNumber(form.par_level_bags)

    if (invalidOptional(bagCount, { int: true }) || invalidOptional(parLevel, { int: true })) {
      flash.error(new Error('Bag count and par level must be whole numbers of 0 or more.'))
      return
    }
    if (invalidOptional(weightPerBag) || invalidOptional(unitCost) || invalidOptional(shipping)) {
      flash.error(new Error('Weights and costs must be numbers of 0 or more.'))
      return
    }

    try {
      await receive.mutateAsync({
        lot_id: form.lot_id,
        warehouse_id: form.warehouse_id,
        quantity_kg: quantity,
        bag_count: bagCount,
        weight_per_bag_kg: weightPerBag,
        unit_cost_per_kg: unitCost,
        shipping_cost: shipping,
        par_level_bags: parLevel,
        received_date: form.received_date || null,
        notes: form.notes.trim() || null,
      })
      flash.success(`${quantity.toLocaleString()} kg of ${selectedLot.lot_code} received into inventory.`)
      resetForm()
    } catch (err) {
      flash.error(err)
    }
  }

  function downloadCSV() {
    const headers = [
      'Lot ID',
      'Origin',
      'Warehouse',
      'Location',
      'Coffee Type',
      'Inventory Type',
      'Quantity (kg)',
      'Bag Count',
      'Weight per Bag (kg)',
      'Unit Cost per kg',
      'Shipping Cost',
      'True Cost',
      'Par Level (bags)',
      'Status',
      'Received Date',
      'Notes',
    ]

    const rows = inventory.map((item) => {
      const cost = trueCost(item)
      return [
        item.lot?.lot_code || '',
        item.lot?.origin || '',
        item.warehouse?.name || '',
        item.warehouse?.location || '',
        item.coffee_type || '',
        item.inventory_type || '',
        item.quantity_kg,
        item.bag_count ?? '',
        item.weight_per_bag_kg ?? '',
        item.unit_cost_per_kg ?? '',
        item.shipping_cost ?? '',
        cost === null ? '' : cost.toFixed(2),
        item.par_level_bags ?? '',
        item.status || '',
        item.received_date || '',
        item.notes || '',
      ]
    })

    downloadCsv('coffee-inventory.csv', headers, rows)
  }

  function calculateTrueCost() {
    const quantity = Number(form.quantity_kg) || 0
    const unitCost = Number(form.unit_cost_per_kg) || 0
    const shipping = Number(form.shipping_cost) || 0
    return quantity * unitCost + shipping
  }

  function getStockWarning(item: InventoryItem) {
    if (item.is_low_stock !== undefined) return item.is_low_stock
    return (
      item.par_level_bags !== null &&
      item.bag_count !== null &&
      item.bag_count <= item.par_level_bags &&
      Number(item.quantity_kg) > 0
    )
  }

  function resetPage<T>(setter: (v: T) => void) {
    return (v: T) => {
      setter(v)
      setPage(1)
    }
  }

  const colSpan = canMoveStock ? 9 : 8

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Coffee Inventory</h1>

          <p className="mt-1 text-sm text-gray-500">
            Receive, track, and manage coffee stock across warehouses.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            onClick={downloadCSV}
            disabled={inventory.length === 0}
            className="rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            Download CSV
          </button>

          {canMoveStock && (
            <button
              onClick={() => {
                setForm(emptyForm())
                setShowForm(true)
              }}
              className="rounded-lg bg-black px-4 py-2.5 text-sm font-medium text-white hover:bg-gray-800"
            >
              Receive Coffee
            </button>
          )}
        </div>
      </div>

      {/* Messages */}
      {flash.banner}

      {/* Form */}
      {showForm && canMoveStock && (
        <form onSubmit={handleSubmit} className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
          <div className="mb-6 flex items-center justify-between">
            <div>
              <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-700">Receive Coffee</h2>

              <p className="mt-1 text-xs text-gray-500">
                Only quality-approved lots can be received. Receiving into a warehouse that already holds the lot adds to
                that stock record.
              </p>
            </div>

            <button type="button" onClick={resetForm} className="text-sm text-gray-500 hover:text-black">
              Close
            </button>
          </div>

          {/* Coffee Information */}
          <div className="mb-8">
            <h3 className="mb-4 text-sm font-semibold uppercase tracking-wide text-gray-700">Coffee Information</h3>

            <div className="grid gap-5 md:grid-cols-2">
              <div>
                <label className={labelClass}>Coffee Lot *</label>

                <select
                  value={form.lot_id}
                  onChange={(e) => setForm({ ...form, lot_id: e.target.value })}
                  className={inputClass}
                  required
                  disabled={receivableQuery.isLoading}
                >
                  <option value="">
                    {receivableQuery.isLoading ? 'Loading approved lots…' : 'Select approved coffee lot'}
                  </option>

                  {receivableLots.map((lot) => (
                    <option key={lot.id} value={lot.id}>
                      {lot.lot_code} — {lot.origin} ({Number(lot.remaining_kg).toLocaleString()} kg to receive)
                    </option>
                  ))}
                </select>

                {receivableQuery.error ? (
                  <p className="mt-1 text-xs text-red-600">
                    Could not load lots.{' '}
                    <button type="button" className="underline" onClick={() => receivableQuery.refetch()}>
                      Retry
                    </button>
                  </p>
                ) : (
                  !receivableQuery.isLoading &&
                  receivableLots.length === 0 && (
                    <p className="mt-1 text-xs text-gray-500">
                      No approved lots are waiting to be received.
                    </p>
                  )
                )}

                {selectedLot && (
                  <div className="mt-2 rounded-lg bg-gray-50 p-3 text-xs text-gray-600">
                    <div>
                      <strong>Lot quantity:</strong> {Number(selectedLot.quantity_kg).toLocaleString()} kg
                    </div>

                    <div>
                      <strong>Already received:</strong> {Number(selectedLot.received_kg).toLocaleString()} kg
                    </div>

                    <div>
                      <strong>Grade:</strong> {selectedLot.grade || '—'}
                    </div>

                    <div>
                      <strong>Processing:</strong> {selectedLot.processing_method || '—'}
                    </div>

                    {remainingQuantity !== null && (
                      <div className="mt-1 font-medium text-gray-900">
                        Remaining to receive: {remainingQuantity.toLocaleString()} kg
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div>
                <label className={labelClass}>Warehouse *</label>

                <select
                  value={form.warehouse_id}
                  onChange={(e) => setForm({ ...form, warehouse_id: e.target.value })}
                  className={inputClass}
                  required
                >
                  <option value="">Select warehouse</option>

                  {warehouses.map((warehouse) => (
                    <option key={warehouse.id} value={warehouse.id}>
                      {warehouseLabel(warehouse)}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* Stock Information */}
          <div className="mb-8">
            <h3 className="mb-4 text-sm font-semibold uppercase tracking-wide text-gray-700">Stock Information</h3>

            <div className="grid gap-5 md:grid-cols-3">
              <div>
                <label className={labelClass}>Quantity (kg) *</label>

                <input
                  type="number"
                  min="0.01"
                  step="0.01"
                  max={remainingQuantity !== null ? remainingQuantity : undefined}
                  value={form.quantity_kg}
                  onChange={(e) => setForm({ ...form, quantity_kg: e.target.value })}
                  placeholder="e.g. 600"
                  className={inputClass}
                  required
                />

                {remainingQuantity !== null && (
                  <p className="mt-1 text-xs text-gray-500">
                    Maximum available: {remainingQuantity.toLocaleString()} kg
                  </p>
                )}
              </div>

              <div>
                <label className={labelClass}>Bag Count</label>

                <input
                  type="number"
                  min="0"
                  step="1"
                  value={form.bag_count}
                  onChange={(e) => setForm({ ...form, bag_count: e.target.value })}
                  placeholder="e.g. 10"
                  className={inputClass}
                />
              </div>

              <div>
                <label className={labelClass}>Weight per Bag (kg)</label>

                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.weight_per_bag_kg}
                  onChange={(e) => setForm({ ...form, weight_per_bag_kg: e.target.value })}
                  placeholder="e.g. 60"
                  className={inputClass}
                />
              </div>

              <div>
                <label className={labelClass}>Received Date *</label>

                <input
                  type="date"
                  value={form.received_date}
                  max={today()}
                  onChange={(e) => setForm({ ...form, received_date: e.target.value })}
                  className={inputClass}
                  required
                />
              </div>

              <div>
                <label className={labelClass}>Par Level (bags)</label>

                <input
                  type="number"
                  min="0"
                  step="1"
                  value={form.par_level_bags}
                  onChange={(e) => setForm({ ...form, par_level_bags: e.target.value })}
                  placeholder="e.g. 15"
                  className={inputClass}
                />
              </div>
            </div>
          </div>

          {/* Cost Information */}
          <div className="mb-8">
            <h3 className="mb-4 text-sm font-semibold uppercase tracking-wide text-gray-700">Cost Information</h3>

            <div className="grid gap-5 md:grid-cols-3">
              <div>
                <label className={labelClass}>Unit Cost per kg</label>

                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.unit_cost_per_kg}
                  onChange={(e) => setForm({ ...form, unit_cost_per_kg: e.target.value })}
                  placeholder="e.g. 450"
                  className={inputClass}
                />
              </div>

              <div>
                <label className={labelClass}>Shipping Cost</label>

                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.shipping_cost}
                  onChange={(e) => setForm({ ...form, shipping_cost: e.target.value })}
                  placeholder="e.g. 5000"
                  className={inputClass}
                />
              </div>

              <div>
                <label className={labelClass}>True Cost</label>

                <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm font-semibold text-gray-900">
                  {calculateTrueCost().toFixed(2)}
                </div>
              </div>
            </div>

            <p className="mt-2 text-xs text-gray-500">True cost = quantity × unit cost + shipping cost.</p>
          </div>

          {/* Notes */}
          <div className="mb-6">
            <h3 className="mb-4 text-sm font-semibold uppercase tracking-wide text-gray-700">Additional Notes</h3>

            <textarea
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              rows={4}
              maxLength={2000}
              placeholder="Add inventory notes..."
              className={inputClass}
            />
          </div>

          <div className="flex justify-end gap-3">
            <button
              type="button"
              onClick={resetForm}
              className="rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              Cancel
            </button>

            <button
              type="submit"
              disabled={receive.isPending}
              className="rounded-lg bg-black px-5 py-2.5 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50"
            >
              {receive.isPending ? 'Saving...' : 'Receive Coffee'}
            </button>
          </div>
        </form>
      )}

      {/* Filters */}
      <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
          <div>
            <label className={labelClass}>Search</label>
            <input
              type="text"
              value={search}
              onChange={(e) => resetPage(setSearch)(e.target.value)}
              placeholder="Lot code, origin, grade..."
              className={inputClass}
            />
          </div>

          <div>
            <label className={labelClass}>Warehouse</label>
            <select value={warehouseFilter} onChange={(e) => resetPage(setWarehouseFilter)(e.target.value)} className={inputClass}>
              <option value="">All warehouses</option>
              {warehouses.map((w) => (
                <option key={w.id} value={w.id}>
                  {warehouseLabel(w)}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className={labelClass}>Status</label>
            <select value={statusFilter} onChange={(e) => resetPage(setStatusFilter)(e.target.value)} className={inputClass}>
              <option value="">All statuses</option>
              <option value="available">Available</option>
              <option value="depleted">Depleted</option>
            </select>
          </div>

          <div className="flex flex-col justify-end gap-2 text-sm text-gray-700">
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={lowStockOnly} onChange={(e) => resetPage(setLowStockOnly)(e.target.checked)} />
              Low stock only
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={inStockOnly} onChange={(e) => resetPage(setInStockOnly)(e.target.checked)} />
              In stock only
            </label>
          </div>
        </div>
      </div>

      {/* Inventory Table */}
      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="min-w-full text-left">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-gray-500">Lot</th>
                <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-gray-500">Warehouse</th>
                <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-gray-500">Quantity</th>
                <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-gray-500">Bags</th>
                <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-gray-500">Cost/kg</th>
                <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-gray-500">True Cost</th>
                <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-gray-500">Received</th>
                <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-gray-500">Status</th>
                {canMoveStock && (
                  <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-gray-500">Actions</th>
                )}
              </tr>
            </thead>

            <tbody className="divide-y divide-gray-100">
              {inventoryQuery.isLoading ? (
                <tr>
                  <td colSpan={colSpan}>
                    <LoadingState label="Loading inventory..." />
                  </td>
                </tr>
              ) : inventoryQuery.error ? (
                <tr>
                  <td colSpan={colSpan}>
                    <ErrorState error={inventoryQuery.error} onRetry={() => inventoryQuery.refetch()} />
                  </td>
                </tr>
              ) : inventory.length === 0 ? (
                <tr>
                  <td colSpan={colSpan}>
                    <EmptyState
                      title="No inventory records found."
                      description={
                        search || warehouseFilter || statusFilter || lowStockOnly || inStockOnly
                          ? 'Try clearing the filters.'
                          : 'Receive an approved coffee lot to start tracking stock.'
                      }
                    />
                  </td>
                </tr>
              ) : (
                inventory.map((item) => {
                  const cost = trueCost(item)
                  const hasStock = Number(item.quantity_kg) > 0
                  return (
                    <tr key={item.id} className={`hover:bg-gray-50 ${getStockWarning(item) ? 'bg-yellow-50' : ''}`}>
                      <td className="px-4 py-4">
                        <div className="font-medium text-gray-900">{item.lot?.lot_code || '—'}</div>
                        <div className="text-xs text-gray-500">
                          {item.lot?.origin || ''}
                          {item.inventory_type ? ` · ${prettyStatus(item.inventory_type)}` : ''}
                        </div>
                      </td>

                      <td className="px-4 py-4">
                        <div className="text-sm font-medium text-gray-900">{item.warehouse?.name || '—'}</div>
                        <div className="text-xs text-gray-500">{item.warehouse?.location || ''}</div>
                      </td>

                      <td className="px-4 py-4 text-sm text-gray-700">{formatKg(item.quantity_kg)}</td>

                      <td className="px-4 py-4 text-sm text-gray-700">
                        {item.bag_count ?? '—'}
                        {item.par_level_bags !== null && (
                          <div className="text-xs text-gray-500">Par {item.par_level_bags}</div>
                        )}
                      </td>

                      <td className="px-4 py-4 text-sm text-gray-700">
                        {item.unit_cost_per_kg !== null ? Number(item.unit_cost_per_kg).toFixed(2) : '—'}
                      </td>

                      <td className="px-4 py-4 text-sm text-gray-700">{cost !== null ? cost.toFixed(2) : '—'}</td>

                      <td className="px-4 py-4 text-sm text-gray-700">{formatDate(item.received_date)}</td>

                      <td className="px-4 py-4">
                        <div className="flex flex-col gap-1">
                          <span className="text-sm capitalize text-gray-700">{prettyStatus(item.status)}</span>
                          {getStockWarning(item) && (
                            <span className="text-xs font-medium text-yellow-700">Reorder level</span>
                          )}
                        </div>
                      </td>

                      {canMoveStock && (
                        <td className="px-4 py-4">
                          <div className="flex flex-wrap gap-3 text-sm">
                            <button
                              onClick={() => setAction({ kind: 'edit', item })}
                              className="font-medium text-gray-700 hover:text-black"
                            >
                              Edit details
                            </button>
                            <button
                              onClick={() => setAction({ kind: 'adjust', item })}
                              className="font-medium text-gray-700 hover:text-black"
                            >
                              Adjust
                            </button>
                            {hasStock && (
                              <button
                                onClick={() => setAction({ kind: 'issue', item })}
                                className="font-medium text-gray-700 hover:text-black"
                              >
                                Issue
                              </button>
                            )}
                            {hasStock && (
                              <button
                                onClick={() => setAction({ kind: 'transfer', item })}
                                className="font-medium text-gray-700 hover:text-black"
                              >
                                Transfer
                              </button>
                            )}
                          </div>
                        </td>
                      )}
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
        <Pagination page={page} limit={PAGE_SIZE} total={total} onPage={setPage} />
      </div>

      {canMoveStock && action && (
        <StockActionModal
          key={`${action.kind}-${action.item.id}`}
          action={action}
          warehouses={warehouses}
          onClose={() => setAction(null)}
          onDone={(msg) => {
            flash.success(msg)
            setAction(null)
          }}
        />
      )}

      <StockMovements />
    </div>
  )
}

// -----------------------------------------------------------------------------
// Row action modals: edit details / adjust / issue / transfer
// -----------------------------------------------------------------------------
function StockActionModal({
  action,
  warehouses,
  onClose,
  onDone,
}: {
  action: RowAction
  warehouses: Warehouse[]
  onClose: () => void
  onDone: (message: string) => void
}) {
  const { item, kind } = action
  const { updateDetails, adjust, issue, transfer } = useInventoryActions()
  const [error, setError] = useState('')
  const lotCode = item.lot?.lot_code || 'this lot'
  const onHand = Number(item.quantity_kg)

  // edit details
  const [details, setDetails] = useState({
    bag_count: item.bag_count?.toString() ?? '',
    weight_per_bag_kg: item.weight_per_bag_kg?.toString() ?? '',
    unit_cost_per_kg: item.unit_cost_per_kg?.toString() ?? '',
    shipping_cost: item.shipping_cost?.toString() ?? '',
    par_level_bags: item.par_level_bags?.toString() ?? '',
    roast_loss_percent: item.roast_loss_percent?.toString() ?? '',
    coffee_type: item.coffee_type ?? '',
    inventory_type: (item.inventory_type ?? 'green') as 'green' | 'roasted',
    notes: item.notes ?? '',
  })

  // adjust / issue / transfer
  const [direction, setDirection] = useState<'in' | 'out'>('in')
  const [quantity, setQuantity] = useState('')
  const [reason, setReason] = useState('')
  const [toWarehouse, setToWarehouse] = useState('')

  const pending = updateDetails.isPending || adjust.isPending || issue.isPending || transfer.isPending
  const targetWarehouses = warehouses.filter((w) => w.id !== item.warehouse_id)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setError('')

    try {
      if (kind === 'edit') {
        const bagCount = optionalNumber(details.bag_count)
        const weight = optionalNumber(details.weight_per_bag_kg)
        const unitCost = optionalNumber(details.unit_cost_per_kg)
        const shipping = optionalNumber(details.shipping_cost)
        const parLevel = optionalNumber(details.par_level_bags)
        const roastLoss = optionalNumber(details.roast_loss_percent)
        if (invalidOptional(bagCount, { int: true }) || invalidOptional(parLevel, { int: true })) {
          throw new Error('Bag count and par level must be whole numbers of 0 or more.')
        }
        if (invalidOptional(weight) || invalidOptional(unitCost) || invalidOptional(shipping)) {
          throw new Error('Weights and costs must be numbers of 0 or more.')
        }
        if (invalidOptional(roastLoss, { max: 100 })) {
          throw new Error('Roast loss must be between 0 and 100 %.')
        }
        await updateDetails.mutateAsync({
          id: item.id,
          body: {
            bag_count: bagCount,
            weight_per_bag_kg: weight,
            unit_cost_per_kg: unitCost,
            shipping_cost: shipping,
            par_level_bags: parLevel,
            roast_loss_percent: roastLoss,
            coffee_type: details.coffee_type.trim() || null,
            inventory_type: details.inventory_type,
            notes: details.notes.trim() || null,
          },
        })
        onDone(`Details of ${lotCode} updated.`)
        return
      }

      const qty = Number(quantity)
      if (!Number.isFinite(qty) || qty <= 0) throw new Error('Enter a quantity greater than 0.')

      if (kind === 'adjust') {
        if (reason.trim().length < 3) throw new Error('Give a reason for the adjustment.')
        if (direction === 'out' && qty > onHand) {
          throw new Error(`Only ${onHand.toLocaleString()} kg is in stock; stock cannot go negative.`)
        }
        const delta = direction === 'in' ? qty : -qty
        await adjust.mutateAsync({ id: item.id, delta_kg: delta, reason: reason.trim() })
        onDone(`${lotCode} adjusted by ${delta > 0 ? '+' : ''}${delta.toLocaleString()} kg.`)
      } else if (kind === 'issue') {
        if (reason.trim().length < 3) throw new Error('Give a reason for issuing stock.')
        if (qty > onHand) throw new Error(`Only ${onHand.toLocaleString()} kg is in stock.`)
        await issue.mutateAsync({ id: item.id, quantity_kg: qty, reason: reason.trim() })
        onDone(`${qty.toLocaleString()} kg of ${lotCode} issued.`)
      } else {
        if (!toWarehouse) throw new Error('Select the destination warehouse.')
        if (qty > onHand) throw new Error(`Only ${onHand.toLocaleString()} kg is in stock.`)
        await transfer.mutateAsync({
          id: item.id,
          to_warehouse_id: toWarehouse,
          quantity_kg: qty,
          notes: reason.trim() || undefined,
        })
        const dest = warehouses.find((w) => w.id === toWarehouse)
        onDone(`${qty.toLocaleString()} kg of ${lotCode} transferred to ${dest?.name ?? 'the selected warehouse'}.`)
      }
    } catch (err) {
      setError(errorMessage(err))
    }
  }

  const titles = {
    edit: `Edit details — ${lotCode}`,
    adjust: `Adjust stock — ${lotCode}`,
    issue: `Issue stock — ${lotCode}`,
    transfer: `Transfer stock — ${lotCode}`,
  }
  const submitLabels = { edit: 'Save details', adjust: 'Record adjustment', issue: 'Issue stock', transfer: 'Transfer' }

  return (
    <Modal
      open
      size="md"
      title={titles[kind]}
      onClose={onClose}
      footer={
        <>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            form="stock-action-form"
            disabled={pending}
            className="rounded-lg bg-black px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50"
          >
            {pending ? 'Saving...' : submitLabels[kind]}
          </button>
        </>
      }
    >
      <form id="stock-action-form" onSubmit={submit} className="space-y-4">
        <div className="rounded-lg bg-gray-50 p-3 text-xs text-gray-600">
          <div>
            <strong>Warehouse:</strong> {warehouseLabel(item.warehouse)}
          </div>
          <div>
            <strong>On hand:</strong> {formatKg(item.quantity_kg)}
          </div>
        </div>

        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
        )}

        {kind === 'edit' && (
          <>
            <p className="text-xs text-gray-500">
              Quantity and status change only through receipts, adjustments, issues and transfers.
            </p>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className={labelClass}>Bag Count</label>
                <input type="number" min="0" step="1" value={details.bag_count} onChange={(e) => setDetails({ ...details, bag_count: e.target.value })} className={inputClass} />
              </div>
              <div>
                <label className={labelClass}>Weight per Bag (kg)</label>
                <input type="number" min="0" step="0.01" value={details.weight_per_bag_kg} onChange={(e) => setDetails({ ...details, weight_per_bag_kg: e.target.value })} className={inputClass} />
              </div>
              <div>
                <label className={labelClass}>Unit Cost per kg</label>
                <input type="number" min="0" step="0.01" value={details.unit_cost_per_kg} onChange={(e) => setDetails({ ...details, unit_cost_per_kg: e.target.value })} className={inputClass} />
              </div>
              <div>
                <label className={labelClass}>Shipping Cost</label>
                <input type="number" min="0" step="0.01" value={details.shipping_cost} onChange={(e) => setDetails({ ...details, shipping_cost: e.target.value })} className={inputClass} />
              </div>
              <div>
                <label className={labelClass}>Par Level (bags)</label>
                <input type="number" min="0" step="1" value={details.par_level_bags} onChange={(e) => setDetails({ ...details, par_level_bags: e.target.value })} className={inputClass} />
              </div>
              <div>
                <label className={labelClass}>Roast Loss (%)</label>
                <input type="number" min="0" max="100" step="0.1" value={details.roast_loss_percent} onChange={(e) => setDetails({ ...details, roast_loss_percent: e.target.value })} className={inputClass} />
              </div>
              <div>
                <label className={labelClass}>Coffee Type</label>
                <input type="text" maxLength={80} value={details.coffee_type} onChange={(e) => setDetails({ ...details, coffee_type: e.target.value })} placeholder="e.g. Green Coffee" className={inputClass} />
              </div>
              <div>
                <label className={labelClass}>Inventory Type</label>
                <select value={details.inventory_type} onChange={(e) => setDetails({ ...details, inventory_type: e.target.value as 'green' | 'roasted' })} className={inputClass}>
                  <option value="green">Green</option>
                  <option value="roasted">Roasted</option>
                </select>
              </div>
            </div>
            <div>
              <label className={labelClass}>Notes</label>
              <textarea rows={3} maxLength={2000} value={details.notes} onChange={(e) => setDetails({ ...details, notes: e.target.value })} className={inputClass} />
            </div>
          </>
        )}

        {kind === 'adjust' && (
          <>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className={labelClass}>Direction *</label>
                <select value={direction} onChange={(e) => setDirection(e.target.value as 'in' | 'out')} className={inputClass}>
                  <option value="in">Increase (+)</option>
                  <option value="out">Decrease (−)</option>
                </select>
              </div>
              <div>
                <label className={labelClass}>Quantity (kg) *</label>
                <input
                  type="number"
                  min="0.01"
                  step="0.01"
                  max={direction === 'out' ? onHand : undefined}
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                  className={inputClass}
                  required
                />
              </div>
            </div>
            <div>
              <label className={labelClass}>Reason *</label>
              <textarea rows={3} maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Stock count correction, moisture loss" className={inputClass} required />
            </div>
          </>
        )}

        {kind === 'issue' && (
          <>
            <div>
              <label className={labelClass}>Quantity (kg) *</label>
              <input type="number" min="0.01" step="0.01" max={onHand} value={quantity} onChange={(e) => setQuantity(e.target.value)} className={inputClass} required />
              <p className="mt-1 text-xs text-gray-500">Maximum: {formatKg(onHand)}</p>
            </div>
            <div>
              <label className={labelClass}>Reason *</label>
              <input
                type="text"
                list="issue-reasons"
                maxLength={500}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="e.g. Sample dispatch, local sale"
                className={inputClass}
                required
              />
              <datalist id="issue-reasons">
                <option value="Sample dispatch" />
                <option value="Local sale" />
                <option value="Roasting" />
                <option value="Damaged / written off" />
              </datalist>
            </div>
          </>
        )}

        {kind === 'transfer' && (
          <>
            <div>
              <label className={labelClass}>To warehouse *</label>
              <select value={toWarehouse} onChange={(e) => setToWarehouse(e.target.value)} className={inputClass} required>
                <option value="">Select destination warehouse</option>
                {targetWarehouses.map((w) => (
                  <option key={w.id} value={w.id}>
                    {warehouseLabel(w)}
                  </option>
                ))}
              </select>
              {targetWarehouses.length === 0 && (
                <p className="mt-1 text-xs text-gray-500">There is no other active warehouse.</p>
              )}
            </div>
            <div>
              <label className={labelClass}>Quantity (kg) *</label>
              <input type="number" min="0.01" step="0.01" max={onHand} value={quantity} onChange={(e) => setQuantity(e.target.value)} className={inputClass} required />
              <p className="mt-1 text-xs text-gray-500">Maximum: {formatKg(onHand)}</p>
            </div>
            <div>
              <label className={labelClass}>Notes</label>
              <textarea rows={2} maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} className={inputClass} />
            </div>
          </>
        )}
      </form>
    </Modal>
  )
}

// -----------------------------------------------------------------------------
// Stock movements ledger
// -----------------------------------------------------------------------------
function StockMovements() {
  const [type, setType] = useState('')
  const [page, setPage] = useState(1)
  const movementsQuery = useStockMovements({
    page,
    limit: MOVEMENT_PAGE_SIZE,
    sort: '-created_at',
    transaction_type: type || undefined,
  })
  const movements = movementsQuery.data?.data ?? []
  const total = movementsQuery.data?.meta.total ?? 0

  return (
    <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
      <div className="flex flex-col gap-3 border-b border-gray-200 px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-700">Stock movements</h2>
          <p className="mt-1 text-xs text-gray-500">Every change to stock is recorded here.</p>
        </div>
        <select
          value={type}
          onChange={(e) => {
            setType(e.target.value)
            setPage(1)
          }}
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-black"
        >
          <option value="">All movement types</option>
          {MOVEMENT_TYPES.map((t) => (
            <option key={t} value={t}>
              {prettyStatus(t)}
            </option>
          ))}
        </select>
      </div>

      {movementsQuery.isLoading ? (
        <LoadingState label="Loading stock movements..." />
      ) : movementsQuery.error ? (
        <ErrorState error={movementsQuery.error} onRetry={() => movementsQuery.refetch()} />
      ) : movements.length === 0 ? (
        <EmptyState title="No stock movements found." />
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full text-left">
            <thead className="bg-gray-50">
              <tr>
                {['Date', 'Lot', 'Warehouse', 'Type', 'Quantity', 'Balance After', 'Performed By', 'Notes'].map((h) => (
                  <th key={h} className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-gray-500">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {movements.map((m) => {
                const incoming = INCOMING.includes(m.transaction_type)
                return (
                  <tr key={m.id} className="hover:bg-gray-50">
                    <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-700">{formatDateTime(m.created_at)}</td>
                    <td className="px-4 py-3">
                      <div className="text-sm font-medium text-gray-900">{m.lot?.lot_code || '—'}</div>
                      <div className="text-xs text-gray-500">{m.lot?.origin || ''}</div>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-700">{warehouseLabel(m.warehouse)}</td>
                    <td className="px-4 py-3 text-sm text-gray-700">{prettyStatus(m.transaction_type)}</td>
                    <td className={`whitespace-nowrap px-4 py-3 text-sm font-medium ${incoming ? 'text-green-700' : 'text-red-700'}`}>
                      {incoming ? '+' : '−'}
                      {formatKg(m.quantity_kg)}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-700">{formatKg(m.balance_after)}</td>
                    <td className="px-4 py-3 text-sm text-gray-700">{m.performer?.full_name || m.performer?.email || '—'}</td>
                    <td className="max-w-xs px-4 py-3 text-sm text-gray-500">{m.notes || '—'}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
      <Pagination page={page} limit={MOVEMENT_PAGE_SIZE} total={total} onPage={setPage} />
    </div>
  )
}

