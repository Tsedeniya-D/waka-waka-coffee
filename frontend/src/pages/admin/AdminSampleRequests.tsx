import { useEffect, useState } from 'react'
import {
  Download,
  Eye,
  Pencil,
  Trash2,
  Search,
  X,
  CheckCircle2,
  Truck,
} from 'lucide-react'
import { downloadCsv, errorMessage } from '../../lib/api'
import { useAuth } from '../../contexts/AuthContext'
import { useDebounce } from '../../hooks'
import {
  useDirectory,
  useSampleActions,
  useSampleRequest,
  useSampleRequests,
} from '../../queries/admin'
import {
  Alert,
  ErrorState,
  LoadingState,
  Modal,
  StatusActions,
  StatusBadge,
  formatDate,
  formatDateTime,
  prettyStatus,
  useConfirm,
  useFlash,
} from '../../components/admin/ui'
import DocumentsPanel from '../../components/admin/DocumentsPanel'
import type { SampleRequest, SampleStatus } from '../../types'

const statuses: SampleStatus[] = [
  'new',
  'reviewing',
  'approved',
  'preparing',
  'dispatched',
  'delivered',
  'completed',
  'rejected',
  'cancelled',
]

/** Editable copy of a sample request (numbers kept as strings for inputs). */
type SampleForm = {
  id: string
  reference_number: string
  status: SampleStatus
  full_name: string
  company: string
  email: string
  phone: string
  country: string
  product_name: string
  sample_quantity: string
  shipping_address: string
  message: string
  courier: string
  tracking_number: string
  admin_notes: string
}

const toForm = (r: SampleRequest): SampleForm => ({
  id: r.id,
  reference_number: r.reference_number,
  status: r.status,
  full_name: r.full_name ?? '',
  company: r.company ?? '',
  email: r.email ?? '',
  phone: r.phone ?? '',
  country: r.country ?? '',
  product_name: r.product_name ?? '',
  sample_quantity:
    r.sample_quantity !== null && r.sample_quantity !== undefined
      ? String(r.sample_quantity)
      : '',
  shipping_address: r.shipping_address ?? '',
  message: r.message ?? '',
  courier: r.courier ?? '',
  tracking_number: r.tracking_number ?? '',
  admin_notes: r.admin_notes ?? '',
})

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

const inputClass =
  'w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm outline-none focus:border-black disabled:bg-gray-50 disabled:text-gray-500'

export default function AdminSampleRequests() {
  const { can, isAdmin } = useAuth()
  const canUpdate = can('sample_requests', 'update')
  const canDelete = isAdmin && can('sample_requests', 'delete')

  const flash = useFlash()
  const { confirm, dialog } = useConfirm()
  const actions = useSampleActions()

  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const debouncedSearch = useDebounce(search.trim(), { delay: 350 })

  const listQuery = useSampleRequests({
    search: debouncedSearch || undefined,
    status: statusFilter === 'all' ? undefined : statusFilter,
    limit: 200,
    sort: '-created_at',
  })
  const requests: SampleRequest[] = listQuery.data?.data ?? []
  const total = listQuery.data?.meta.total ?? requests.length

  const [rawSelectedIds, setSelectedIds] = useState<string[]>([])
  // Only rows that are currently loaded can be selected.
  const selectedIds = rawSelectedIds.filter((id) =>
    requests.some((r) => r.id === id)
  )
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [editingRequest, setEditingRequest] = useState<SampleForm | null>(null)
  const [editError, setEditError] = useState<string | null>(null)

  // Dispatch form (courier + tracking number are required to dispatch)
  const [dispatching, setDispatching] = useState<{
    id: string
    reference: string
    courier: string
    tracking_number: string
  } | null>(null)
  const [dispatchError, setDispatchError] = useState<string | null>(null)

  const allVisibleSelected =
    requests.length > 0 &&
    requests.every((request) => selectedIds.includes(request.id))

  const toggleSelectAll = () => {
    if (allVisibleSelected) {
      setSelectedIds([])
    } else {
      setSelectedIds(requests.map((request) => request.id))
    }
  }

  const toggleSelect = (id: string) => {
    setSelectedIds((current) =>
      current.includes(id)
        ? current.filter((item) => item !== id)
        : [...current, id]
    )
  }

  const changeStatus = async (request: SampleRequest, next: string) => {
    if (next === 'dispatched') {
      setDispatchError(null)
      setDispatching({
        id: request.id,
        reference: request.reference_number,
        courier: request.courier ?? '',
        tracking_number: request.tracking_number ?? '',
      })
      return
    }

    let reason: string | undefined
    if (next === 'rejected' || next === 'cancelled') {
      const answer = await confirm({
        title: `${prettyStatus(next)} ${request.reference_number}?`,
        message: 'The reason is added to the internal notes.',
        withReason: true,
        reasonLabel: 'Reason',
        confirmLabel: prettyStatus(next),
        danger: true,
      })
      if (answer === false) return
      reason = typeof answer === 'string' && answer ? answer : undefined
    }

    try {
      await actions.setStatus.mutateAsync({
        id: request.id,
        status: next as SampleStatus,
        reason,
      })
      flash.success(
        `${request.reference_number} is now ${prettyStatus(next)}.`
      )
    } catch (err) {
      flash.error(err)
    }
  }

  const submitDispatch = async () => {
    if (!dispatching) return
    const courier = dispatching.courier.trim()
    const tracking = dispatching.tracking_number.trim()
    if (!courier || !tracking) {
      setDispatchError('Enter the courier and tracking number to dispatch the sample.')
      return
    }
    setDispatchError(null)
    try {
      await actions.setStatus.mutateAsync({
        id: dispatching.id,
        status: 'dispatched',
        courier,
        tracking_number: tracking,
      })
      flash.success(
        `${dispatching.reference} was dispatched via ${courier} (tracking ${tracking}).`
      )
      setDispatching(null)
    } catch (err) {
      setDispatchError(errorMessage(err))
    }
  }

  const deleteRequest = async (request: SampleRequest) => {
    const ok = await confirm({
      title: 'Delete sample request?',
      message: `${request.reference_number} will be permanently deleted.`,
      confirmLabel: 'Delete',
      danger: true,
    })
    if (!ok) return

    try {
      await actions.remove.mutateAsync(request.id)
      setSelectedIds((current) => current.filter((item) => item !== request.id))
      if (selectedId === request.id) setSelectedId(null)
      flash.success(`${request.reference_number} was deleted.`)
    } catch (err) {
      flash.error(err)
    }
  }

  const bulkDelete = async () => {
    if (selectedIds.length === 0) return
    const ok = await confirm({
      title: 'Delete selected requests?',
      message: `Delete ${selectedIds.length} selected sample request(s)? This cannot be undone.`,
      confirmLabel: 'Delete',
      danger: true,
    })
    if (!ok) return

    try {
      const result = await actions.bulkRemove.mutateAsync(selectedIds)
      const count = result?.deleted?.length ?? selectedIds.length
      setSelectedIds([])
      flash.success(`${count} sample request(s) deleted.`)
    } catch (err) {
      flash.error(err)
    }
  }

  const locked =
    editingRequest?.status === 'completed' ||
    editingRequest?.status === 'cancelled'

  const saveEdit = async () => {
    if (!editingRequest) return
    const f = editingRequest

    let body: Record<string, unknown>
    if (locked) {
      body = { admin_notes: f.admin_notes.trim() || null }
    } else {
      if (!f.full_name.trim()) return setEditError('Full name is required.')
      if (!EMAIL_RE.test(f.email.trim())) return setEditError('Enter a valid email address.')
      if (!f.country.trim()) return setEditError('Country is required.')
      if (f.shipping_address.trim().length < 10)
        return setEditError('Enter a complete shipping address (at least 10 characters).')

      let quantity: number | null = null
      if (f.sample_quantity.trim() !== '') {
        quantity = Number(f.sample_quantity)
        if (Number.isNaN(quantity) || quantity < 0.01 || quantity > 10) {
          return setEditError('Sample quantity must be between 0.01 and 10 kg.')
        }
      }

      body = {
        full_name: f.full_name.trim(),
        company: f.company.trim() || null,
        email: f.email.trim(),
        phone: f.phone.trim() || null,
        country: f.country.trim(),
        product_name: f.product_name.trim() || null,
        sample_quantity: quantity,
        sample_quantity_unit: 'kg',
        shipping_address: f.shipping_address.trim(),
        message: f.message.trim() || null,
        courier: f.courier.trim() || null,
        tracking_number: f.tracking_number.trim() || null,
        admin_notes: f.admin_notes.trim() || null,
      }
    }

    setEditError(null)
    try {
      await actions.update.mutateAsync({ id: f.id, body })
      flash.success(`${f.reference_number} was updated.`)
      setEditingRequest(null)
    } catch (err) {
      setEditError(errorMessage(err))
    }
  }

  const downloadCSV = () => {
    const headers = [
      'Reference',
      'Full Name',
      'Company',
      'Email',
      'Phone',
      'Country',
      'Product',
      'Sample Quantity (kg)',
      'Shipping Address',
      'Message',
      'Status',
      'Courier',
      'Tracking Number',
      'Shipped At',
      'Delivered At',
      'Customer',
      'Assigned To',
      'Created At',
    ]

    const rows = requests.map((request) => [
      request.reference_number || '',
      request.full_name || '',
      request.company || '',
      request.email || '',
      request.phone || '',
      request.country || '',
      request.product_name || '',
      request.sample_quantity ?? '',
      request.shipping_address || '',
      request.message || '',
      prettyStatus(request.status),
      request.courier || '',
      request.tracking_number || '',
      request.shipped_at ? formatDateTime(request.shipped_at) : '',
      request.delivered_at ? formatDateTime(request.delivered_at) : '',
      request.customer?.company_name || '',
      request.assigned?.full_name || '',
      formatDateTime(request.created_at),
    ])

    downloadCsv(
      `sample-requests-${new Date().toISOString().slice(0, 10)}.csv`,
      headers,
      rows
    )
  }

  const statusBusy = actions.setStatus.isPending

  return (
    <div className="space-y-6">

      {/* HEADER */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            Sample Requests
          </h1>

          <p className="mt-1 text-sm text-gray-500">
            Manage sample requests submitted from the Waka Coffee website.
          </p>
        </div>

        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={downloadCSV}
            disabled={requests.length === 0}
            className="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            <Download className="h-4 w-4" />
            Download CSV
          </button>

          {canDelete && selectedIds.length > 0 && (
            <button
              type="button"
              onClick={bulkDelete}
              disabled={actions.bulkRemove.isPending}
              className="inline-flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-60"
            >
              <Trash2 className="h-4 w-4" />
              {actions.bulkRemove.isPending
                ? 'Deleting...'
                : `Delete Selected (${selectedIds.length})`}
            </button>
          )}
        </div>
      </div>

      {/* WORKFLOW NOTE */}
      <Alert type="info">
        Samples are a separate workflow: review → approve → prepare → dispatch
        (courier + tracking number) → delivered → completed. A sample request
        never becomes a sales order — commercial orders start from a quote
        request or are created under Sales Orders.
      </Alert>

      {/* FEEDBACK */}
      {flash.banner}

      {/* FILTERS */}
      <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">

          <div className="relative md:col-span-2">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />

            <input
              type="text"
              value={search}
              onChange={(e) =>
                setSearch(e.target.value)
              }
              placeholder="Search reference, name, company, email, country, product or tracking number..."
              className="w-full rounded-lg border border-gray-300 py-2.5 pl-10 pr-3 text-sm outline-none focus:border-black"
            />
          </div>

          <select
            value={statusFilter}
            onChange={(e) =>
              setStatusFilter(e.target.value)
            }
            className="rounded-lg border border-gray-300 px-3 py-2.5 text-sm outline-none focus:border-black"
          >
            <option value="all">
              All Statuses
            </option>

            {statuses.map((status) => (
              <option key={status} value={status}>
                {prettyStatus(status)}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* SUMMARY */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-gray-500">
          Showing {requests.length} of {total} request(s)
          {listQuery.isFetching && !listQuery.isLoading ? ' · refreshing…' : ''}
        </p>

        {selectedIds.length > 0 && (
          <p className="text-sm font-medium text-gray-700">
            {selectedIds.length} selected
          </p>
        )}
      </div>

      {/* TABLE */}
      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">

        {listQuery.isLoading ? (
          <LoadingState label="Loading sample requests..." />
        ) : listQuery.isError ? (
          <ErrorState error={listQuery.error} onRetry={() => listQuery.refetch()} />
        ) : requests.length === 0 ? (
          <div className="p-10 text-center">
            <CheckCircle2 className="mx-auto h-10 w-10 text-gray-300" />

            <p className="mt-3 text-sm font-medium text-gray-700">
              No sample requests found.
            </p>

            <p className="mt-1 text-xs text-gray-500">
              {debouncedSearch || statusFilter !== 'all'
                ? 'Try a different search or status filter.'
                : 'Requests submitted from the website will appear here.'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">

              <thead className="bg-gray-50">
                <tr>

                  <th className="px-4 py-3 text-left">
                    {canDelete && (
                      <input
                        type="checkbox"
                        checked={allVisibleSelected}
                        onChange={toggleSelectAll}
                        aria-label="Select all"
                      />
                    )}
                  </th>

                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                    Reference
                  </th>

                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                    Customer
                  </th>

                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                    Product
                  </th>

                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                    Country
                  </th>

                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                    Status
                  </th>

                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                    Date
                  </th>

                  <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-gray-500">
                    Actions
                  </th>

                </tr>
              </thead>

              <tbody className="divide-y divide-gray-100">
                {requests.map((request) => (
                  <tr
                    key={request.id}
                    className="hover:bg-gray-50"
                  >

                    <td className="px-4 py-4">
                      {canDelete && (
                        <input
                          type="checkbox"
                          checked={selectedIds.includes(
                            request.id
                          )}
                          onChange={() =>
                            toggleSelect(request.id)
                          }
                          aria-label={`Select ${request.reference_number}`}
                        />
                      )}
                    </td>

                    <td className="px-4 py-4">
                      <span className="font-semibold text-gray-900">
                        {request.reference_number ||
                          'Pending'}
                      </span>
                    </td>

                    <td className="px-4 py-4">
                      <div>
                        <p className="font-medium text-gray-900">
                          {request.full_name}
                        </p>

                        {request.company && (
                          <p className="text-xs text-gray-500">
                            {request.company}
                          </p>
                        )}

                        <p className="text-xs text-gray-400">
                          {request.email}
                        </p>

                        {request.customer && (
                          <p className="text-xs text-gray-400">
                            {request.customer.customer_code}
                          </p>
                        )}
                      </div>
                    </td>

                    <td className="px-4 py-4 text-gray-700">
                      <p>
                        {request.product_name ||
                          'Multiple / Not specified'}
                      </p>
                      {request.sample_quantity !== null && (
                        <p className="text-xs text-gray-500">
                          {request.sample_quantity}{' '}
                          {request.sample_quantity_unit || 'kg'}
                        </p>
                      )}
                    </td>

                    <td className="px-4 py-4 text-gray-700">
                      {request.country || '-'}
                    </td>

                    <td className="px-4 py-4">
                      <div className="flex flex-col items-start gap-2">
                        <StatusBadge status={request.status} />

                        {request.tracking_number && (
                          <span className="text-xs text-gray-500">
                            {request.courier} · {request.tracking_number}
                          </span>
                        )}

                        {canUpdate && (
                          <StatusActions
                            entity="sample_request"
                            status={request.status}
                            disabled={statusBusy}
                            onChange={(next) =>
                              changeStatus(request, next)
                            }
                          />
                        )}
                      </div>
                    </td>

                    <td className="px-4 py-4 text-xs text-gray-500">
                      <p>{formatDate(request.created_at)}</p>
                      {request.shipped_at && (
                        <p>Shipped {formatDate(request.shipped_at)}</p>
                      )}
                      {request.delivered_at && (
                        <p>Delivered {formatDate(request.delivered_at)}</p>
                      )}
                    </td>

                    <td className="px-4 py-4">
                      <div className="flex justify-end gap-2">

                        <button
                          type="button"
                          title="View"
                          onClick={() =>
                            setSelectedId(request.id)
                          }
                          className="rounded-lg border border-gray-200 p-2 text-gray-600 hover:bg-gray-100"
                        >
                          <Eye className="h-4 w-4" />
                        </button>

                        {canUpdate && (
                          <button
                            type="button"
                            title="Edit"
                            onClick={() => {
                              setEditError(null)
                              setEditingRequest(toForm(request))
                            }}
                            className="rounded-lg border border-gray-200 p-2 text-gray-600 hover:bg-gray-100"
                          >
                            <Pencil className="h-4 w-4" />
                          </button>
                        )}

                        {canDelete && (
                          <button
                            type="button"
                            title="Delete"
                            disabled={actions.remove.isPending}
                            onClick={() =>
                              deleteRequest(request)
                            }
                            className="rounded-lg border border-red-200 p-2 text-red-600 hover:bg-red-50 disabled:opacity-50"
                          >
                            <Trash2 className="h-4 w-4" />
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

      {/* VIEW MODAL */}
      {selectedId && (
        <SampleDetailModal
          id={selectedId}
          canUpdate={canUpdate}
          onClose={() => setSelectedId(null)}
          onStatus={changeStatus}
          statusBusy={statusBusy}
        />
      )}

      {/* DISPATCH MODAL */}
      <Modal
        open={Boolean(dispatching)}
        size="md"
        title={`Dispatch ${dispatching?.reference ?? ''}`}
        onClose={() => setDispatching(null)}
        footer={
          <>
            <button
              type="button"
              onClick={() => setDispatching(null)}
              className="rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={actions.setStatus.isPending}
              onClick={submitDispatch}
              className="inline-flex items-center gap-2 rounded-lg bg-black px-4 py-2.5 text-sm font-medium text-white disabled:opacity-60 hover:bg-gray-800"
            >
              <Truck className="h-4 w-4" />
              {actions.setStatus.isPending ? 'Dispatching...' : 'Mark as Dispatched'}
            </button>
          </>
        }
      >
        {dispatching && (
          <div className="space-y-4">
            <p className="text-sm text-gray-600">
              Enter the courier and tracking number. The customer's sample is
              marked as dispatched and the shipping date is recorded.
            </p>
            {dispatchError && <Alert type="error">{dispatchError}</Alert>}
            <EditField
              label="Courier *"
              value={dispatching.courier}
              onChange={(value) =>
                setDispatching({ ...dispatching, courier: value })
              }
            />
            <EditField
              label="Tracking Number *"
              value={dispatching.tracking_number}
              onChange={(value) =>
                setDispatching({ ...dispatching, tracking_number: value })
              }
            />
          </div>
        )}
      </Modal>

      {/* EDIT MODAL */}
      {editingRequest && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-2xl bg-white shadow-2xl">

            <div className="flex items-center justify-between border-b border-gray-200 px-6 py-5">
              <div>
                <h2 className="text-xl font-bold text-gray-900">
                  Edit Sample Request
                </h2>

                <p className="mt-1 text-sm text-gray-500">
                  {editingRequest.reference_number} ·{' '}
                  {prettyStatus(editingRequest.status)}
                </p>
              </div>

              <button
                type="button"
                onClick={() =>
                  setEditingRequest(null)
                }
                className="rounded-lg p-2 text-gray-500 hover:bg-gray-100"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="grid grid-cols-1 gap-5 p-6 md:grid-cols-2">

              {locked && (
                <div className="md:col-span-2">
                  <Alert type="warning">
                    This request is {prettyStatus(editingRequest.status).toLowerCase()};
                    only the internal notes can change.
                  </Alert>
                </div>
              )}

              {editError && (
                <div className="md:col-span-2">
                  <Alert type="error" onClose={() => setEditError(null)}>
                    {editError}
                  </Alert>
                </div>
              )}

              <EditField
                label="Full Name *"
                value={editingRequest.full_name}
                disabled={locked}
                onChange={(value) =>
                  setEditingRequest({
                    ...editingRequest,
                    full_name: value,
                  })
                }
              />

              <EditField
                label="Company"
                value={editingRequest.company}
                disabled={locked}
                onChange={(value) =>
                  setEditingRequest({
                    ...editingRequest,
                    company: value,
                  })
                }
              />

              <EditField
                label="Email *"
                type="email"
                value={editingRequest.email}
                disabled={locked}
                onChange={(value) =>
                  setEditingRequest({
                    ...editingRequest,
                    email: value,
                  })
                }
              />

              <EditField
                label="Phone"
                value={editingRequest.phone}
                disabled={locked}
                onChange={(value) =>
                  setEditingRequest({
                    ...editingRequest,
                    phone: value,
                  })
                }
              />

              <EditField
                label="Country *"
                value={editingRequest.country}
                disabled={locked}
                onChange={(value) =>
                  setEditingRequest({
                    ...editingRequest,
                    country: value,
                  })
                }
              />

              <EditField
                label="Product"
                value={editingRequest.product_name}
                disabled={locked}
                onChange={(value) =>
                  setEditingRequest({
                    ...editingRequest,
                    product_name: value,
                  })
                }
              />

              <EditField
                label="Sample Quantity (kg)"
                type="number"
                value={editingRequest.sample_quantity}
                disabled={locked}
                onChange={(value) =>
                  setEditingRequest({
                    ...editingRequest,
                    sample_quantity: value,
                  })
                }
              />

              <div />

              <EditField
                label="Courier"
                value={editingRequest.courier}
                disabled={locked}
                onChange={(value) =>
                  setEditingRequest({
                    ...editingRequest,
                    courier: value,
                  })
                }
              />

              <EditField
                label="Tracking Number"
                value={editingRequest.tracking_number}
                disabled={locked}
                onChange={(value) =>
                  setEditingRequest({
                    ...editingRequest,
                    tracking_number: value,
                  })
                }
              />

              <div className="md:col-span-2">
                <EditTextarea
                  label="Shipping Address *"
                  value={editingRequest.shipping_address}
                  disabled={locked}
                  onChange={(value) =>
                    setEditingRequest({
                      ...editingRequest,
                      shipping_address: value,
                    })
                  }
                />
              </div>

              <div className="md:col-span-2">
                <EditTextarea
                  label="Customer Message"
                  value={editingRequest.message}
                  disabled={locked}
                  onChange={(value) =>
                    setEditingRequest({
                      ...editingRequest,
                      message: value,
                    })
                  }
                />
              </div>

              <div className="md:col-span-2">
                <EditTextarea
                  label="Internal Notes"
                  value={editingRequest.admin_notes}
                  onChange={(value) =>
                    setEditingRequest({
                      ...editingRequest,
                      admin_notes: value,
                    })
                  }
                />
              </div>

              <p className="text-xs text-gray-500 md:col-span-2">
                Status changes are made with the “Change status…” menu so only
                valid workflow steps are offered.
              </p>

            </div>

            <div className="flex justify-end gap-3 border-t border-gray-200 px-6 py-4">

              <button
                type="button"
                onClick={() =>
                  setEditingRequest(null)
                }
                className="rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>

              <button
                type="button"
                disabled={actions.update.isPending}
                onClick={saveEdit}
                className="inline-flex items-center gap-2 rounded-lg bg-black px-4 py-2.5 text-sm font-medium text-white disabled:opacity-60 hover:bg-gray-800"
              >
                <CheckCircle2 className="h-4 w-4" />
                {actions.update.isPending ? 'Saving...' : 'Save Changes'}
              </button>

            </div>
          </div>
        </div>
      )}

      {dialog}
    </div>
  )
}

// -----------------------------------------------------------------------------
// Detail modal: full record, workflow, assignment, customer link, notes, docs
// -----------------------------------------------------------------------------
function SampleDetailModal({
  id,
  canUpdate,
  onClose,
  onStatus,
  statusBusy,
}: {
  id: string
  canUpdate: boolean
  onClose: () => void
  onStatus: (request: SampleRequest, next: string) => void
  statusBusy: boolean
}) {
  const detail = useSampleRequest(id)
  const directory = useDirectory(['sales', 'admin', 'super_admin'])
  const actions = useSampleActions()
  const flash = useFlash()
  const request = detail.data

  const [notes, setNotes] = useState('')
  useEffect(() => {
    setNotes(request?.admin_notes ?? '')
  }, [request?.id, request?.admin_notes])

  const assign = async (assignedTo: string) => {
    if (!request) return
    try {
      await actions.assign.mutateAsync({
        id: request.id,
        assigned_to: assignedTo || null,
      })
      flash.success(assignedTo ? 'Responsible employee updated.' : 'Assignment removed.')
    } catch (err) {
      flash.error(err)
    }
  }

  const linkCustomer = async () => {
    if (!request) return
    try {
      const updated = await actions.linkCustomer.mutateAsync(request.id)
      flash.success(
        updated.customer
          ? `Linked to customer ${updated.customer.company_name} (${updated.customer.customer_code}).`
          : 'Customer linked.'
      )
    } catch (err) {
      flash.error(err)
    }
  }

  const saveNotes = async () => {
    if (!request) return
    try {
      await actions.update.mutateAsync({
        id: request.id,
        body: { admin_notes: notes.trim() || null },
      })
      flash.success('Internal notes saved.')
    } catch (err) {
      flash.error(err)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-2xl bg-white shadow-2xl">

        <div className="flex items-center justify-between border-b border-gray-200 px-6 py-5">
          <div>
            <h2 className="text-xl font-bold text-gray-900">
              Sample Request Details
            </h2>

            <p className="mt-1 text-sm text-gray-500">
              {request?.reference_number ?? ''}
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-gray-500 hover:bg-gray-100"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {detail.isLoading ? (
          <LoadingState label="Loading sample request..." />
        ) : detail.isError || !request ? (
          <ErrorState error={detail.error} onRetry={() => detail.refetch()} />
        ) : (
          <>
            {flash.banner && <div className="px-6 pt-5">{flash.banner}</div>}

            <div className="grid grid-cols-1 gap-6 p-6 md:grid-cols-2">

              <InfoItem label="Full Name" value={request.full_name} />

              <InfoItem label="Company" value={request.company} />

              <InfoItem label="Email" value={request.email} />

              <InfoItem label="Phone" value={request.phone} />

              <InfoItem label="Country" value={request.country} />

              <InfoItem label="Product" value={request.product_name} />

              <InfoItem
                label="Sample Quantity"
                value={
                  request.sample_quantity !== null
                    ? `${request.sample_quantity} ${request.sample_quantity_unit || 'kg'}`
                    : null
                }
              />

              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                  Status
                </p>
                <div className="mt-1 flex flex-wrap items-center gap-2">
                  <StatusBadge status={request.status} />
                  {canUpdate && (
                    <StatusActions
                      entity="sample_request"
                      status={request.status}
                      disabled={statusBusy}
                      onChange={(next) => onStatus(request, next)}
                    />
                  )}
                </div>
              </div>

              <div className="md:col-span-2">
                <InfoItem label="Shipping Address" value={request.shipping_address} />
              </div>

              <div className="md:col-span-2">
                <InfoItem label="Customer Message" value={request.message} />
              </div>

              <InfoItem label="Courier" value={request.courier} />

              <InfoItem label="Tracking Number" value={request.tracking_number} />

              <InfoItem
                label="Shipped At"
                value={request.shipped_at ? formatDateTime(request.shipped_at) : null}
              />

              <InfoItem
                label="Delivered At"
                value={request.delivered_at ? formatDateTime(request.delivered_at) : null}
              />

              <InfoItem label="Submitted" value={formatDateTime(request.created_at)} />

              <InfoItem label="Last Updated" value={formatDateTime(request.updated_at)} />

              {/* Customer link */}
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                  Customer Record
                </p>
                {request.customer ? (
                  <p className="mt-1 text-sm text-gray-900">
                    {request.customer.company_name} ({request.customer.customer_code})
                  </p>
                ) : (
                  <div className="mt-1 flex flex-wrap items-center gap-2">
                    <span className="text-sm text-gray-500">Not linked</span>
                    {canUpdate && (
                      <button
                        type="button"
                        disabled={actions.linkCustomer.isPending}
                        onClick={linkCustomer}
                        className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                      >
                        {actions.linkCustomer.isPending
                          ? 'Linking...'
                          : 'Link / create customer'}
                      </button>
                    )}
                  </div>
                )}
              </div>

              {/* Assignment */}
              <div>
                <label className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                  Responsible Employee
                </label>
                {canUpdate ? (
                  <select
                    value={request.assigned_to ?? ''}
                    disabled={actions.assign.isPending || directory.isLoading}
                    onChange={(e) => assign(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-black disabled:opacity-60"
                  >
                    <option value="">Unassigned</option>
                    {(directory.data ?? []).map((person) => (
                      <option key={person.id} value={person.id}>
                        {person.full_name || person.email || person.id}
                      </option>
                    ))}
                    {request.assigned_to &&
                      !(directory.data ?? []).some((p) => p.id === request.assigned_to) && (
                        <option value={request.assigned_to}>
                          {request.assigned?.full_name || 'Current assignee'}
                        </option>
                      )}
                  </select>
                ) : (
                  <p className="mt-1 text-sm text-gray-900">
                    {request.assigned?.full_name || 'Unassigned'}
                  </p>
                )}
              </div>

              {/* Internal notes */}
              <div className="md:col-span-2">
                <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-gray-500">
                  Internal Notes
                </label>
                <textarea
                  rows={3}
                  value={notes}
                  disabled={!canUpdate}
                  onChange={(e) => setNotes(e.target.value)}
                  className="w-full resize-none rounded-lg border border-gray-300 px-3 py-2.5 text-sm outline-none focus:border-black disabled:bg-gray-50"
                />
                {canUpdate && (
                  <div className="mt-2 text-right">
                    <button
                      type="button"
                      disabled={
                        actions.update.isPending ||
                        notes.trim() === (request.admin_notes ?? '').trim()
                      }
                      onClick={saveNotes}
                      className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                    >
                      {actions.update.isPending ? 'Saving...' : 'Save notes'}
                    </button>
                  </div>
                )}
              </div>

              <div className="md:col-span-2">
                <DocumentsPanel relatedType="sample_request" relatedId={request.id} />
              </div>

            </div>
          </>
        )}

        <div className="border-t border-gray-200 px-6 py-4 text-right">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg bg-black px-4 py-2.5 text-sm font-medium text-white hover:bg-gray-800"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  )
}

function InfoItem({
  label,
  value,
}: {
  label: string
  value: string | null | undefined
}) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
        {label}
      </p>

      <p className="mt-1 whitespace-pre-wrap text-sm text-gray-900">
        {value || 'Not provided'}
      </p>
    </div>
  )
}

function EditField({
  label,
  value,
  onChange,
  disabled,
  type = 'text',
}: {
  label: string
  value: string
  onChange: (value: string) => void
  disabled?: boolean
  type?: 'text' | 'email' | 'number'
}) {
  return (
    <div>
      <label className="mb-2 block text-sm font-medium text-gray-700">
        {label}
      </label>

      <input
        type={type}
        value={value}
        disabled={disabled}
        step={type === 'number' ? '0.01' : undefined}
        min={type === 'number' ? '0.01' : undefined}
        max={type === 'number' ? '10' : undefined}
        onChange={(e) =>
          onChange(e.target.value)
        }
        className={inputClass}
      />
    </div>
  )
}

function EditTextarea({
  label,
  value,
  onChange,
  disabled,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  disabled?: boolean
}) {
  return (
    <div>
      <label className="mb-2 block text-sm font-medium text-gray-700">
        {label}
      </label>

      <textarea
        rows={4}
        value={value}
        disabled={disabled}
        onChange={(e) =>
          onChange(e.target.value)
        }
        className={`${inputClass} resize-none`}
      />
    </div>
  )
}
