import { useMemo, useState, type FormEvent } from 'react'
import DocumentsPanel from '../../components/admin/DocumentsPanel'
import {
  EmptyState,
  ErrorState,
  LoadingState,
  Modal,
  StatusActions,
  StatusBadge,
  formatDate,
  formatDateTime,
  formatKg,
  prettyStatus,
  useConfirm,
  useFlash,
} from '../../components/admin/ui'
import { useAuth } from '../../contexts/AuthContext'
import { useDebounce } from '../../hooks'
import { useEligibleBatches, useShipment, useShipmentActions, useShipments } from '../../queries/admin'
import type { Shipment, ShipmentStatus } from '../../types'

const STATUS_OPTIONS: ShipmentStatus[] = ['preparing', 'booked', 'in_transit', 'arrived', 'completed', 'cancelled']

/** Status moves that ask for an optional location / note. */
const STATUS_WITH_DETAILS: ShipmentStatus[] = ['in_transit', 'arrived', 'completed']

const CONTAINER_PATTERN = /^[A-Z]{4}\d{7}$/

type DetailsForm = {
  destination_country: string
  destination_port: string
  port_of_loading: string
  carrier: string
  container_number: string
  vessel_name: string
  booking_reference: string
  bill_of_lading_number: string
  tracking_number: string
  shipping_date: string
  estimated_arrival: string
  notes: string
}

const emptyDetails: DetailsForm = {
  destination_country: '',
  destination_port: '',
  port_of_loading: '',
  carrier: '',
  container_number: '',
  vessel_name: '',
  booking_reference: '',
  bill_of_lading_number: '',
  tracking_number: '',
  shipping_date: '',
  estimated_arrival: '',
  notes: '',
}

const emptyForm = {
  ...emptyDetails,
  export_batch_id: '',
  status: 'preparing' as 'preparing' | 'booked',
}

type EditForm = DetailsForm & { actual_arrival: string }

const inputClass = 'w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm outline-none focus:border-black'
const labelClass = 'mb-1.5 block text-sm font-medium text-gray-700'

/** Client-side checks mirroring the API validator. Returns an error message or null. */
function validateDetails(form: DetailsForm): string | null {
  const container = form.container_number.trim().toUpperCase()
  if (container && !CONTAINER_PATTERN.test(container)) {
    return 'Container number must look like ABCU1234567 (4 letters followed by 7 digits).'
  }
  if (form.shipping_date && form.estimated_arrival && form.estimated_arrival < form.shipping_date) {
    return 'Estimated arrival cannot be before the shipping date.'
  }
  return null
}

const TEXT_FIELDS = [
  'destination_country',
  'destination_port',
  'port_of_loading',
  'carrier',
  'vessel_name',
  'booking_reference',
  'bill_of_lading_number',
  'tracking_number',
  'notes',
] as const

/** Payload for create: empty values are omitted. */
function createPayload(form: typeof emptyForm): Record<string, unknown> {
  const body: Record<string, unknown> = { export_batch_id: form.export_batch_id, status: form.status }
  for (const key of TEXT_FIELDS) {
    const value = form[key].trim()
    if (value) body[key] = value
  }
  const container = form.container_number.trim().toUpperCase()
  if (container) body.container_number = container
  if (form.shipping_date) body.shipping_date = form.shipping_date
  if (form.estimated_arrival) body.estimated_arrival = form.estimated_arrival
  return body
}

/** Payload for update: empty values clear the field. */
function updatePayload(form: EditForm): Record<string, unknown> {
  const body: Record<string, unknown> = {}
  for (const key of TEXT_FIELDS) body[key] = form[key].trim() || null
  body.container_number = form.container_number.trim().toUpperCase() || null
  body.shipping_date = form.shipping_date || null
  body.estimated_arrival = form.estimated_arrival || null
  body.actual_arrival = form.actual_arrival || null
  return body
}

function toEditForm(s: Shipment): EditForm {
  return {
    destination_country: s.destination_country ?? '',
    destination_port: s.destination_port ?? '',
    port_of_loading: s.port_of_loading ?? '',
    carrier: s.carrier ?? '',
    container_number: s.container_number ?? '',
    vessel_name: s.vessel_name ?? '',
    booking_reference: s.booking_reference ?? '',
    bill_of_lading_number: s.bill_of_lading_number ?? '',
    tracking_number: s.tracking_number ?? '',
    shipping_date: s.shipping_date ?? '',
    estimated_arrival: s.estimated_arrival ?? '',
    actual_arrival: s.actual_arrival ?? '',
    notes: s.notes ?? '',
  }
}

/** Shipping detail inputs shared by the create form and the edit dialog. */
function ShippingDetailInputs<F extends DetailsForm>({ form, setForm }: { form: F; setForm: (next: F) => void }) {
  const text = (key: keyof DetailsForm, label: string, placeholder: string, upper = false) => (
    <div>
      <label className={labelClass}>{label}</label>
      <input
        type="text"
        value={form[key]}
        onChange={(e) => setForm({ ...form, [key]: upper ? e.target.value.toUpperCase() : e.target.value })}
        className={inputClass}
        placeholder={placeholder}
      />
    </div>
  )
  return (
    <>
      {text('port_of_loading', 'Port of Loading', 'e.g. Djibouti')}
      {text('carrier', 'Carrier', 'e.g. Maersk')}
      <div>
        <label className={labelClass}>Container Number</label>
        <input
          type="text"
          value={form.container_number}
          maxLength={11}
          onChange={(e) => setForm({ ...form, container_number: e.target.value.toUpperCase().replace(/\s/g, '') })}
          className={inputClass}
          placeholder="ABCU1234567"
        />
        <p className="mt-1 text-xs text-gray-500">4 letters followed by 7 digits.</p>
      </div>
      {text('vessel_name', 'Vessel Name', 'Vessel name')}
      {text('booking_reference', 'Booking Reference', 'Booking reference')}
      {text('bill_of_lading_number', 'Bill of Lading Number', 'B/L number')}
      {text('tracking_number', 'Tracking Number', 'Carrier tracking number')}
    </>
  )
}

export default function AdminShipments() {
  const { can, isAdmin } = useAuth()
  const canCreate = can('shipments', 'create')
  const canUpdate = can('shipments', 'update')

  const flash = useFlash()
  const { confirm, dialog } = useConfirm()
  const actions = useShipmentActions()

  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState(emptyForm)
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const debouncedSearch = useDebounce(search.trim(), { delay: 350 })

  const [editing, setEditing] = useState<{ shipment: Shipment; form: EditForm } | null>(null)
  const [statusDialog, setStatusDialog] = useState<{ shipment: Shipment; status: ShipmentStatus; location: string; note: string } | null>(null)
  const [updateForm, setUpdateForm] = useState({ description: '', location: '', event_time: '' })

  const shipmentsQuery = useShipments({
    limit: 200,
    search: debouncedSearch || undefined,
    status: statusFilter === 'all' ? undefined : statusFilter,
  })
  // Unfiltered list for the summary cards.
  const summaryQuery = useShipments({ limit: 1000 })
  const eligibleQuery = useEligibleBatches()
  const detailQuery = useShipment(selectedId)

  const shipments = shipmentsQuery.data?.data ?? []
  const batches = eligibleQuery.data ?? []
  const selectedShipment = detailQuery.data ?? null

  const summary = useMemo(() => {
    const all = summaryQuery.data?.data ?? []
    return {
      total: summaryQuery.data?.meta.total ?? all.length,
      preparing: all.filter((s) => s.status === 'preparing').length,
      booked: all.filter((s) => s.status === 'booked').length,
      transit: all.filter((s) => s.status === 'in_transit').length,
      completed: all.filter((s) => s.status === 'completed').length,
    }
  }, [summaryQuery.data])

  function openCreateForm() {
    setForm(emptyForm)
    flash.clear()
    setShowForm(true)
  }

  function closeForm() {
    setShowForm(false)
    setForm(emptyForm)
  }

  function handleBatchChange(batchId: string) {
    const batch = batches.find((item) => item.id === batchId)
    setForm((current) => ({
      ...current,
      export_batch_id: batchId,
      destination_country: batch?.destination_country || current.destination_country,
      destination_port: batch?.destination_port || current.destination_port,
    }))
  }

  async function createShipment(e: FormEvent) {
    e.preventDefault()
    if (!form.export_batch_id) return flash.error(new Error('Please select an export batch.'))
    const invalid = validateDetails(form)
    if (invalid) return flash.error(new Error(invalid))

    try {
      const created = await actions.create.mutateAsync(createPayload(form))
      flash.success(`Shipment ${created.shipment_number} created successfully.`)
      closeForm()
      setSelectedId(created.id)
    } catch (err) {
      flash.error(err, 'Failed to create shipment.')
    }
  }

  async function applyStatus(shipment: Shipment, status: ShipmentStatus, extra: { location?: string; note?: string } = {}) {
    try {
      await actions.setStatus.mutateAsync({ id: shipment.id, status, ...extra })
      flash.success(`${shipment.shipment_number} updated to ${prettyStatus(status)}.`)
      return true
    } catch (err) {
      flash.error(err, 'Failed to update shipment status.')
      return false
    }
  }

  async function handleStatusChange(shipment: Shipment, next: string) {
    const status = next as ShipmentStatus
    if (status === 'in_transit' && !shipment.vessel_name && !shipment.container_number) {
      flash.error(new Error('Record the vessel or container number (Edit) before marking the shipment as departed.'))
      return
    }
    if (status === 'cancelled') {
      const reason = await confirm({
        title: `Cancel ${shipment.shipment_number}`,
        message: 'The shipment will be cancelled and the export batch becomes available for a new shipment.',
        confirmLabel: 'Cancel shipment',
        danger: true,
        withReason: true,
        reasonLabel: 'Reason (optional)',
      })
      if (reason === false) return
      await applyStatus(shipment, status, typeof reason === 'string' && reason ? { note: `Cancelled: ${reason}` } : {})
      return
    }
    if (STATUS_WITH_DETAILS.includes(status)) {
      setStatusDialog({ shipment, status, location: '', note: '' })
      return
    }
    await applyStatus(shipment, status)
  }

  async function submitStatusDialog(e: FormEvent) {
    e.preventDefault()
    if (!statusDialog) return
    const ok = await applyStatus(statusDialog.shipment, statusDialog.status, {
      location: statusDialog.location.trim() || undefined,
      note: statusDialog.note.trim() || undefined,
    })
    if (ok) setStatusDialog(null)
  }

  async function saveEdit(e: FormEvent) {
    e.preventDefault()
    if (!editing) return
    const invalid = validateDetails(editing.form)
    if (invalid) return flash.error(new Error(invalid))
    if (editing.form.actual_arrival && editing.form.shipping_date && editing.form.actual_arrival < editing.form.shipping_date) {
      return flash.error(new Error('Actual arrival cannot be before the shipping date.'))
    }
    try {
      await actions.update.mutateAsync({ id: editing.shipment.id, body: updatePayload(editing.form) })
      flash.success(`${editing.shipment.shipment_number} updated.`)
      setEditing(null)
    } catch (err) {
      flash.error(err, 'Failed to update shipment.')
    }
  }

  async function deleteShipment(shipment: Shipment) {
    const ok = await confirm({
      title: 'Delete shipment',
      message: `Delete shipment ${shipment.shipment_number}? This cannot be undone.`,
      confirmLabel: 'Delete',
      danger: true,
    })
    if (!ok) return
    try {
      await actions.remove.mutateAsync(shipment.id)
      flash.success(`${shipment.shipment_number} deleted successfully.`)
      if (selectedId === shipment.id) setSelectedId(null)
    } catch (err) {
      flash.error(err, 'Failed to delete shipment.')
    }
  }

  async function addTrackingUpdate(e: FormEvent) {
    e.preventDefault()
    if (!selectedShipment) return
    if (!updateForm.description.trim()) return flash.error(new Error('Describe the tracking update.'))
    let eventTime: string | undefined
    if (updateForm.event_time) {
      const d = new Date(updateForm.event_time)
      if (Number.isNaN(d.getTime())) return flash.error(new Error('Enter a valid event time.'))
      eventTime = d.toISOString()
    }
    try {
      await actions.addUpdate.mutateAsync({
        id: selectedShipment.id,
        description: updateForm.description.trim(),
        location: updateForm.location.trim() || undefined,
        event_time: eventTime,
      })
      setUpdateForm({ description: '', location: '', event_time: '' })
      flash.success('Tracking update added.')
    } catch (err) {
      flash.error(err, 'Failed to add tracking update.')
    }
  }

  const isEditable = (s: Shipment) => canUpdate && !['completed', 'cancelled'].includes(s.status)
  const isDeletable = (s: Shipment) => isAdmin && ['preparing', 'cancelled'].includes(s.status)
  const statusBusy = actions.setStatus.isPending

  return (
    <div className="space-y-6">
      {dialog}

      {/* Header */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Shipment Management</h1>
          <p className="mt-1 text-sm text-gray-500">Manage coffee export shipments, shipping details, and documents.</p>
        </div>

        {canCreate && (
          <button type="button" onClick={openCreateForm} className="rounded-lg bg-black px-4 py-2.5 text-sm font-medium text-white hover:bg-gray-800">
            + Create Shipment
          </button>
        )}
      </div>

      {/* Messages */}
      {flash.banner}

      <div className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-700">
        Status moves follow the shipment workflow: Preparing → Booked → In Transit → Arrived → Completed. Marking a shipment as{' '}
        <strong>In Transit</strong> (departed) automatically marks its export batch and sales order as shipped; marking it{' '}
        <strong>Completed</strong> completes them. Sales is notified of every change.
      </div>

      {/* Summary */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {[
          ['Total Shipments', summary.total],
          ['Preparing', summary.preparing],
          ['Booked', summary.booked],
          ['In Transit', summary.transit],
          ['Completed', summary.completed],
        ].map(([label, value]) => (
          <div key={label} className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
            <p className="text-sm text-gray-500">{label}</p>
            <p className="mt-2 text-2xl font-bold text-gray-900">{summaryQuery.isLoading ? '…' : value}</p>
          </div>
        ))}
      </div>

      {/* Create Form */}
      {showForm && canCreate && (
        <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
          <div className="mb-6 flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Create Shipment</h2>
              <p className="mt-1 text-sm text-gray-500">
                Create a shipment from a ready or approved export batch. The shipment number (SHP-YYYY-NNNN) is assigned automatically.
              </p>
            </div>

            <button type="button" onClick={closeForm} className="text-sm font-medium text-gray-500 hover:text-gray-900">
              Close
            </button>
          </div>

          <form onSubmit={createShipment} className="space-y-6">
            <div>
              <h3 className="mb-4 text-sm font-semibold uppercase tracking-wide text-gray-700">Export Information</h3>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div className="md:col-span-2">
                  <label className={labelClass}>Export Batch *</label>

                  <select
                    value={form.export_batch_id}
                    onChange={(e) => handleBatchChange(e.target.value)}
                    className={inputClass}
                    disabled={eligibleQuery.isLoading}
                    required
                  >
                    <option value="">{eligibleQuery.isLoading ? 'Loading batches…' : 'Select export batch'}</option>

                    {batches.map((batch) => (
                      <option key={batch.id} value={batch.id}>
                        {batch.batch_number} - {batch.sales_order?.order_number || 'No order'}
                        {batch.sales_order?.customer?.company_name ? ` - ${batch.sales_order.customer.company_name}` : ''} -{' '}
                        {formatKg(batch.total_quantity_kg)} ({prettyStatus(batch.status)})
                      </option>
                    ))}
                  </select>

                  {eligibleQuery.error ? (
                    <p className="mt-2 text-xs text-red-600">
                      Could not load export batches.{' '}
                      <button type="button" className="underline" onClick={() => eligibleQuery.refetch()}>
                        Try again
                      </button>
                    </p>
                  ) : (
                    !eligibleQuery.isLoading &&
                    batches.length === 0 && (
                      <p className="mt-2 text-xs text-amber-600">
                        No ready or approved export batches without an active shipment are available.
                      </p>
                    )
                  )}
                </div>

                <div>
                  <label className={labelClass}>Destination Country</label>
                  <input
                    type="text"
                    value={form.destination_country}
                    onChange={(e) => setForm({ ...form, destination_country: e.target.value })}
                    className={inputClass}
                    placeholder="e.g. Germany"
                  />
                </div>

                <div>
                  <label className={labelClass}>Destination Port</label>
                  <input
                    type="text"
                    value={form.destination_port}
                    onChange={(e) => setForm({ ...form, destination_port: e.target.value })}
                    className={inputClass}
                    placeholder="e.g. Hamburg"
                  />
                </div>
              </div>
            </div>

            <div>
              <h3 className="mb-4 text-sm font-semibold uppercase tracking-wide text-gray-700">Shipping Details</h3>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <ShippingDetailInputs form={form} setForm={setForm} />

                <div>
                  <label className={labelClass}>Initial Status</label>
                  <select
                    value={form.status}
                    onChange={(e) => setForm({ ...form, status: e.target.value as 'preparing' | 'booked' })}
                    className={inputClass}
                  >
                    <option value="preparing">Preparing</option>
                    <option value="booked">Booked</option>
                  </select>
                </div>
              </div>
            </div>

            <div>
              <h3 className="mb-4 text-sm font-semibold uppercase tracking-wide text-gray-700">Dates</h3>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                <div>
                  <label className={labelClass}>Shipping Date</label>
                  <input
                    type="date"
                    value={form.shipping_date}
                    onChange={(e) => setForm({ ...form, shipping_date: e.target.value })}
                    className={inputClass}
                  />
                </div>

                <div>
                  <label className={labelClass}>Estimated Arrival</label>
                  <input
                    type="date"
                    value={form.estimated_arrival}
                    min={form.shipping_date || undefined}
                    onChange={(e) => setForm({ ...form, estimated_arrival: e.target.value })}
                    className={inputClass}
                  />
                </div>
              </div>
            </div>

            <div>
              <label className={labelClass}>Notes</label>
              <textarea
                rows={4}
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                className={inputClass}
                placeholder="Additional shipment notes..."
              />
            </div>

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
                disabled={actions.create.isPending || batches.length === 0}
                className="rounded-lg bg-black px-5 py-2.5 text-sm font-medium text-white hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {actions.create.isPending ? 'Creating...' : 'Create Shipment'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Filters */}
      <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <div className="md:col-span-2">
            <label className={labelClass}>Search</label>

            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search shipment, container, vessel, booking, B/L, destination, carrier..."
              className={inputClass}
            />
          </div>

          <div>
            <label className={labelClass}>Status</label>

            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className={inputClass}>
              <option value="all">All Statuses</option>
              {STATUS_OPTIONS.map((status) => (
                <option key={status} value={status}>
                  {prettyStatus(status)}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Shipment Table */}
      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        {shipmentsQuery.isLoading ? (
          <LoadingState label="Loading shipments..." />
        ) : shipmentsQuery.error ? (
          <ErrorState error={shipmentsQuery.error} onRetry={() => shipmentsQuery.refetch()} />
        ) : shipments.length === 0 ? (
          <EmptyState
            title="No shipments found."
            description={search || statusFilter !== 'all' ? 'Try a different search or status.' : 'Create a shipment from an available export batch.'}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 font-semibold text-gray-700">Shipment</th>
                  <th className="px-6 py-3 font-semibold text-gray-700">Export Batch</th>
                  <th className="px-6 py-3 font-semibold text-gray-700">Customer</th>
                  <th className="px-6 py-3 font-semibold text-gray-700">Destination</th>
                  <th className="px-6 py-3 font-semibold text-gray-700">Vessel</th>
                  <th className="px-6 py-3 font-semibold text-gray-700">Status</th>
                  <th className="px-6 py-3 text-right font-semibold text-gray-700">Actions</th>
                </tr>
              </thead>

              <tbody className="divide-y divide-gray-100">
                {shipments.map((shipment) => (
                  <tr key={shipment.id} className={`hover:bg-gray-50 ${selectedId === shipment.id ? 'bg-gray-50' : ''}`}>
                    <td className="px-6 py-4">
                      <p className="font-semibold text-gray-900">{shipment.shipment_number}</p>
                      <p className="mt-1 text-xs text-gray-500">{shipment.container_number || 'No container'}</p>
                    </td>

                    <td className="px-6 py-4">
                      <p className="font-medium text-gray-900">{shipment.export_batch?.batch_number || 'N/A'}</p>
                      <p className="mt-1 text-xs text-gray-500">{shipment.export_batch?.sales_order?.order_number || 'No order'}</p>
                    </td>

                    <td className="px-6 py-4">{shipment.export_batch?.sales_order?.customer?.company_name || 'N/A'}</td>

                    <td className="px-6 py-4">
                      <p className="text-gray-900">{shipment.destination_country || 'N/A'}</p>
                      <p className="mt-1 text-xs text-gray-500">{shipment.destination_port || 'No port'}</p>
                    </td>

                    <td className="px-6 py-4">{shipment.vessel_name || 'N/A'}</td>

                    <td className="px-6 py-4">
                      <StatusBadge status={shipment.status} />
                    </td>

                    <td className="px-6 py-4">
                      <div className="flex flex-wrap justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => setSelectedId(shipment.id)}
                          className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
                        >
                          View
                        </button>

                        {canUpdate && (
                          <StatusActions
                            entity="shipment"
                            status={shipment.status}
                            disabled={statusBusy}
                            onChange={(next) => handleStatusChange(shipment, next)}
                          />
                        )}

                        {isEditable(shipment) && (
                          <button
                            type="button"
                            onClick={() => setEditing({ shipment, form: toEditForm(shipment) })}
                            className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
                          >
                            Edit
                          </button>
                        )}

                        {isDeletable(shipment) && (
                          <button
                            type="button"
                            onClick={() => deleteShipment(shipment)}
                            disabled={actions.remove.isPending}
                            className="rounded-lg border border-red-200 px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
                          >
                            Delete
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Details */}
      {selectedId && (
        <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
          {detailQuery.isLoading ? (
            <LoadingState label="Loading shipment..." />
          ) : detailQuery.error || !selectedShipment ? (
            <ErrorState error={detailQuery.error ?? new Error('Shipment not found.')} onRetry={() => detailQuery.refetch()} />
          ) : (
            <>
              <div className="flex flex-col gap-4 border-b border-gray-200 pb-5 md:flex-row md:items-center md:justify-between">
                <div>
                  <h2 className="text-xl font-bold text-gray-900">{selectedShipment.shipment_number}</h2>
                  <p className="mt-1 text-sm text-gray-500">Shipment details, tracking and documents</p>
                </div>

                <div className="flex flex-wrap items-center gap-3">
                  <StatusBadge status={selectedShipment.status} />

                  {canUpdate && (
                    <StatusActions
                      entity="shipment"
                      status={selectedShipment.status}
                      disabled={statusBusy}
                      onChange={(next) => handleStatusChange(selectedShipment, next)}
                    />
                  )}

                  {isEditable(selectedShipment) && (
                    <button
                      type="button"
                      onClick={() => setEditing({ shipment: selectedShipment, form: toEditForm(selectedShipment) })}
                      className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
                    >
                      Edit details
                    </button>
                  )}

                  <button type="button" onClick={() => setSelectedId(null)} className="text-sm font-medium text-gray-500 hover:text-gray-900">
                    Close
                  </button>
                </div>
              </div>

              <div className="mt-6 grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
                {(
                  [
                    ['Export Batch', selectedShipment.export_batch?.batch_number ? `${selectedShipment.export_batch.batch_number} (${prettyStatus(selectedShipment.export_batch.status)})` : null],
                    ['Sales Order', selectedShipment.export_batch?.sales_order?.order_number],
                    ['Customer', selectedShipment.export_batch?.sales_order?.customer?.company_name],
                    ['Product', selectedShipment.export_batch?.sales_order?.product_name],
                    ['Quantity', formatKg(selectedShipment.export_batch?.total_quantity_kg)],
                    [
                      'Destination',
                      selectedShipment.destination_country
                        ? `${selectedShipment.destination_country}${selectedShipment.destination_port ? `, ${selectedShipment.destination_port}` : ''}`
                        : selectedShipment.destination_port,
                    ],
                    ['Port of Loading', selectedShipment.port_of_loading],
                    ['Carrier', selectedShipment.carrier],
                    ['Container', selectedShipment.container_number],
                    ['Vessel', selectedShipment.vessel_name],
                    ['Booking Reference', selectedShipment.booking_reference],
                    ['Bill of Lading', selectedShipment.bill_of_lading_number],
                    ['Tracking Number', selectedShipment.tracking_number],
                    ['Shipping Date', selectedShipment.shipping_date ? formatDate(selectedShipment.shipping_date) : null],
                    ['Estimated Arrival', selectedShipment.estimated_arrival ? formatDate(selectedShipment.estimated_arrival) : null],
                    ['Actual Arrival', selectedShipment.actual_arrival ? formatDate(selectedShipment.actual_arrival) : null],
                    ['Export Manager', selectedShipment.export_manager?.full_name],
                  ] as [string, string | null | undefined][]
                ).map(([label, value]) => (
                  <div key={label}>
                    <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">{label}</p>
                    <p className="mt-1 text-sm font-medium text-gray-900">{value || 'N/A'}</p>
                  </div>
                ))}
              </div>

              {selectedShipment.notes && (
                <div className="mt-6 rounded-lg bg-gray-50 p-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Notes</p>
                  <p className="mt-2 whitespace-pre-wrap text-sm text-gray-700">{selectedShipment.notes}</p>
                </div>
              )}

              {/* Tracking timeline */}
              <div className="mt-8 border-t border-gray-200 pt-6">
                <div className="mb-5">
                  <h3 className="text-lg font-semibold text-gray-900">Tracking Timeline</h3>
                  <p className="mt-1 text-sm text-gray-500">Status changes are logged automatically; add port calls, delays and other events here.</p>
                </div>

                {canUpdate && (
                  <form onSubmit={addTrackingUpdate} className="rounded-lg border border-gray-200 bg-gray-50 p-4">
                    <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                      <div className="md:col-span-3">
                        <label className={labelClass}>Description *</label>
                        <input
                          type="text"
                          value={updateForm.description}
                          maxLength={1000}
                          onChange={(e) => setUpdateForm({ ...updateForm, description: e.target.value })}
                          placeholder="e.g. Container loaded on vessel"
                          className={`${inputClass} bg-white`}
                        />
                      </div>
                      <div>
                        <label className={labelClass}>Location</label>
                        <input
                          type="text"
                          value={updateForm.location}
                          maxLength={200}
                          onChange={(e) => setUpdateForm({ ...updateForm, location: e.target.value })}
                          placeholder="e.g. Port of Djibouti"
                          className={`${inputClass} bg-white`}
                        />
                      </div>
                      <div>
                        <label className={labelClass}>Event Time</label>
                        <input
                          type="datetime-local"
                          value={updateForm.event_time}
                          onChange={(e) => setUpdateForm({ ...updateForm, event_time: e.target.value })}
                          className={`${inputClass} bg-white`}
                        />
                        <p className="mt-1 text-xs text-gray-500">Leave empty for now.</p>
                      </div>
                      <div className="flex items-end justify-end">
                        <button
                          type="submit"
                          disabled={actions.addUpdate.isPending}
                          className="rounded-lg bg-black px-4 py-2.5 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50"
                        >
                          {actions.addUpdate.isPending ? 'Adding...' : 'Add Tracking Update'}
                        </button>
                      </div>
                    </div>
                  </form>
                )}

                <div className="mt-5 overflow-hidden rounded-lg border border-gray-200">
                  {selectedShipment.updates.length === 0 ? (
                    <div className="p-6 text-center text-sm text-gray-500">No tracking events yet.</div>
                  ) : (
                    <ol className="divide-y divide-gray-100">
                      {selectedShipment.updates.map((update) => (
                        <li key={update.id} className="flex flex-col gap-2 p-4 md:flex-row md:items-start md:justify-between">
                          <div className="min-w-0">
                            <p className="font-medium text-gray-900">{update.description}</p>
                            <p className="mt-1 text-xs text-gray-500">
                              {update.location ? `${update.location} · ` : ''}
                              {formatDateTime(update.event_time)}
                              {update.author?.full_name ? ` · ${update.author.full_name}` : ''}
                            </p>
                          </div>
                          {update.status && <StatusBadge status={update.status} />}
                        </li>
                      ))}
                    </ol>
                  )}
                </div>
              </div>

              {/* Documents */}
              <div className="mt-8 border-t border-gray-200 pt-6">
                <div className="mb-5">
                  <h3 className="text-lg font-semibold text-gray-900">Shipment Documents</h3>
                  <p className="mt-1 text-sm text-gray-500">
                    Upload invoices, packing lists, certificates, bills of lading, and other shipment documents. Files are stored privately
                    and opened through short-lived links.
                  </p>
                </div>

                <DocumentsPanel relatedType="shipment" relatedId={selectedShipment.id} defaultType="commercial_invoice" />
              </div>
            </>
          )}
        </div>
      )}

      {/* Status change with location / note */}
      <Modal
        open={Boolean(statusDialog)}
        size="md"
        title={statusDialog ? `Mark ${statusDialog.shipment.shipment_number} as ${prettyStatus(statusDialog.status)}` : ''}
        onClose={() => setStatusDialog(null)}
      >
        {statusDialog && (
          <form onSubmit={submitStatusDialog} className="space-y-4">
            {flash.banner}
            <p className="text-sm text-gray-600">
              {statusDialog.status === 'in_transit' &&
                'Departure marks the export batch and sales order as shipped and notifies Sales.'}
              {statusDialog.status === 'arrived' && 'The shipment will be marked as arrived at its destination and Sales is notified.'}
              {statusDialog.status === 'completed' &&
                'Completion completes the export batch and the sales order. This cannot be undone.'}
            </p>
            <div>
              <label className={labelClass}>Location</label>
              <input
                type="text"
                value={statusDialog.location}
                maxLength={200}
                onChange={(e) => setStatusDialog({ ...statusDialog, location: e.target.value })}
                placeholder="e.g. Port of Djibouti"
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass}>Note</label>
              <textarea
                rows={3}
                value={statusDialog.note}
                maxLength={1000}
                onChange={(e) => setStatusDialog({ ...statusDialog, note: e.target.value })}
                placeholder="Optional tracking note"
                className={inputClass}
              />
            </div>
            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setStatusDialog(null)}
                className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Back
              </button>
              <button
                type="submit"
                disabled={statusBusy}
                className="rounded-lg bg-black px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50"
              >
                {statusBusy ? 'Updating...' : `Mark as ${prettyStatus(statusDialog.status)}`}
              </button>
            </div>
          </form>
        )}
      </Modal>

      {/* Edit shipment details */}
      <Modal open={Boolean(editing)} title={editing ? `Edit ${editing.shipment.shipment_number}` : ''} onClose={() => setEditing(null)}>
        {editing && (
          <form onSubmit={saveEdit} className="space-y-6">
            {flash.banner}
            <p className="text-sm text-gray-500">
              The export batch and status cannot be changed here; use the status menu for workflow moves.
            </p>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div>
                <label className={labelClass}>Destination Country</label>
                <input
                  type="text"
                  value={editing.form.destination_country}
                  onChange={(e) => setEditing({ ...editing, form: { ...editing.form, destination_country: e.target.value } })}
                  className={inputClass}
                />
              </div>
              <div>
                <label className={labelClass}>Destination Port</label>
                <input
                  type="text"
                  value={editing.form.destination_port}
                  onChange={(e) => setEditing({ ...editing, form: { ...editing.form, destination_port: e.target.value } })}
                  className={inputClass}
                />
              </div>
              <ShippingDetailInputs form={editing.form} setForm={(next) => setEditing({ ...editing, form: next })} />
            </div>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              <div>
                <label className={labelClass}>Shipping Date</label>
                <input
                  type="date"
                  value={editing.form.shipping_date}
                  onChange={(e) => setEditing({ ...editing, form: { ...editing.form, shipping_date: e.target.value } })}
                  className={inputClass}
                />
              </div>
              <div>
                <label className={labelClass}>Estimated Arrival</label>
                <input
                  type="date"
                  value={editing.form.estimated_arrival}
                  min={editing.form.shipping_date || undefined}
                  onChange={(e) => setEditing({ ...editing, form: { ...editing.form, estimated_arrival: e.target.value } })}
                  className={inputClass}
                />
              </div>
              <div>
                <label className={labelClass}>Actual Arrival</label>
                <input
                  type="date"
                  value={editing.form.actual_arrival}
                  min={editing.form.shipping_date || undefined}
                  onChange={(e) => setEditing({ ...editing, form: { ...editing.form, actual_arrival: e.target.value } })}
                  className={inputClass}
                />
              </div>
            </div>
            <div>
              <label className={labelClass}>Notes</label>
              <textarea
                rows={4}
                value={editing.form.notes}
                onChange={(e) => setEditing({ ...editing, form: { ...editing.form, notes: e.target.value } })}
                className={inputClass}
              />
            </div>
            <div className="flex justify-end gap-3 border-t border-gray-200 pt-5">
              <button
                type="button"
                onClick={() => setEditing(null)}
                className="rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={actions.update.isPending}
                className="rounded-lg bg-black px-5 py-2.5 text-sm font-medium text-white hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {actions.update.isPending ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  )
}
