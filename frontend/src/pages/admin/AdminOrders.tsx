import { type FormEvent, useEffect, useMemo, useState } from 'react'
import { useAuth } from '../../contexts/AuthContext'
import { useDebounce } from '../../hooks'
import { errorMessage } from '../../lib/api'
import {
  useCustomers,
  useNextStatuses,
  useOrderActions,
  useSalesOrder,
  useSalesOrders,
} from '../../queries/admin'
import {
  Alert,
  EmptyState,
  ErrorState,
  Field,
  LoadingState,
  Modal,
  StatusBadge,
  formatDate,
  formatDateTime,
  formatKg,
  formatMoney,
  prettyStatus,
  useConfirm,
  useFlash,
} from '../../components/admin/ui'
import DocumentsPanel from '../../components/admin/DocumentsPanel'
import type {
  Customer,
  OrderStatus,
  SalesOrder,
  SalesOrderDetail,
  SalesOrderItem,
} from '../../types'

type OrderForm = {
  customer_id: string
  product_name: string
  origin: string
  grade: string
  processing_method: string
  quantity_kg: string
  unit_price: string
  currency: string
  incoterm: string
  payment_terms: string
  destination_country: string
  destination_port: string
  requested_ship_date: string
  customer_notes: string
}

const initialForm: OrderForm = {
  customer_id: '',
  product_name: '',
  origin: '',
  grade: '',
  processing_method: '',
  quantity_kg: '',
  unit_price: '',
  currency: 'USD',
  incoterm: '',
  payment_terms: '',
  destination_country: '',
  destination_port: '',
  requested_ship_date: '',
  customer_notes: '',
}

const statusLabels: Record<string, string> = {
  draft: 'Draft',
  confirmed: 'Confirmed',
  sent_to_export: 'Sent to Export',
  export_accepted: 'Export Accepted',
  processing: 'Processing',
  shipped: 'Shipped',
  completed: 'Completed',
  cancelled: 'Cancelled',
}

/** Orders can only be edited (fields and items) in these statuses. */
const EDITABLE: OrderStatus[] = ['draft', 'confirmed']
const CURRENCIES = ['USD', 'EUR', 'GBP', 'ETB', 'JPY', 'CNY', 'AED', 'SAR']
const INCOTERMS = ['FOB', 'FCA', 'CFR', 'CIF', 'CPT', 'CIP', 'DAP', 'DDP', 'EXW']

const inputClass =
  'w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm outline-none focus:border-black'

export default function AdminOrders() {
  const { can, hasRole, isAdmin } = useAuth()
  const isSales = hasRole(['sales', 'admin', 'super_admin'])
  const canCreate = isSales && can('orders', 'create')
  const canEdit = isSales && can('orders', 'update')
  const canDelete = isAdmin && can('orders', 'delete')

  const flash = useFlash()
  const { confirm, dialog } = useConfirm()
  const actions = useOrderActions()

  const [form, setForm] = useState<OrderForm>(initialForm)
  const [showForm, setShowForm] = useState(false)
  const [formError, setFormError] = useState('')
  const [editingOrder, setEditingOrder] = useState<SalesOrder | null>(null)
  const [viewId, setViewId] = useState<string | null>(null)

  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const debouncedSearch = useDebounce(search.trim(), { delay: 350 })

  const ordersQuery = useSalesOrders({
    search: debouncedSearch || undefined,
    status: statusFilter === 'all' ? undefined : statusFilter,
    sort: '-created_at',
    limit: 200,
  })
  const pendingExportQuery = useSalesOrders({
    status: 'sent_to_export,export_accepted',
    limit: 1,
  })
  const customersQuery = useCustomers({
    status: 'active',
    limit: 500,
    sort: 'company_name',
  })

  const orders: SalesOrder[] = ordersQuery.data?.data ?? []
  const customers: Customer[] = customersQuery.data?.data ?? []
  const totalOrders = ordersQuery.data?.meta.total ?? orders.length

  // Busy flag per order row (shows "Sending..." etc. on the right row)
  const [busy, setBusy] = useState<{ id: string; action: string } | null>(null)

  function updateForm(field: keyof OrderForm, value: string) {
    setForm((current) => ({
      ...current,
      [field]: value,
    }))
  }

  function resetForm() {
    setForm(initialForm)
    setEditingOrder(null)
    setShowForm(false)
    setFormError('')
  }

  function openCreateForm() {
    flash.clear()
    setFormError('')
    setEditingOrder(null)
    setForm(initialForm)
    setShowForm(true)
  }

  function openEditForm(order: SalesOrder) {
    flash.clear()
    setFormError('')
    setEditingOrder(order)

    setForm({
      customer_id: order.customer_id || '',
      product_name: order.product_name || '',
      origin: order.origin || '',
      grade: order.grade || '',
      processing_method: order.processing_method || '',
      quantity_kg: String(order.quantity_kg || ''),
      unit_price:
        order.unit_price !== null && order.unit_price !== undefined
          ? String(order.unit_price)
          : '',
      currency: order.currency || 'USD',
      incoterm: order.incoterm || '',
      payment_terms: order.payment_terms || '',
      destination_country: order.destination_country || '',
      destination_port: order.destination_port || '',
      requested_ship_date: order.requested_ship_date || '',
      customer_notes: order.customer_notes || '',
    })

    setShowForm(true)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  function handleCustomerChange(customerId: string) {
    const customer = customers.find((item) => item.id === customerId)

    setForm((current) => ({
      ...current,
      customer_id: customerId,
      destination_country:
        current.destination_country || customer?.country || '',
      destination_port:
        current.destination_port || customer?.destination_port || '',
    }))
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()

    setFormError('')

    if (!form.customer_id) {
      setFormError('Please select a customer.')
      return
    }

    if (!form.product_name.trim()) {
      setFormError('Please enter the product name.')
      return
    }

    const quantity = Number(form.quantity_kg)

    if (!quantity || Number.isNaN(quantity) || quantity <= 0) {
      setFormError('Quantity must be greater than 0.')
      return
    }

    const price =
      form.unit_price.trim() === '' ? null : Number(form.unit_price)

    if (price !== null && (Number.isNaN(price) || price < 0)) {
      setFormError('Please enter a valid unit price.')
      return
    }

    if (editingOrder && !EDITABLE.includes(editingOrder.status)) {
      setFormError(
        `${editingOrder.order_number} is ${prettyStatus(editingOrder.status).toLowerCase()} and can no longer be edited.`
      )
      return
    }

    const payload = {
      customer_id: form.customer_id,
      product_name: form.product_name.trim(),
      origin: form.origin.trim() || null,
      grade: form.grade.trim() || null,
      processing_method: form.processing_method.trim() || null,
      quantity_kg: quantity,
      unit_price: price,
      currency: form.currency,
      incoterm: form.incoterm.trim() || null,
      payment_terms: form.payment_terms.trim() || null,
      destination_country: form.destination_country.trim() || null,
      destination_port: form.destination_port.trim() || null,
      requested_ship_date: form.requested_ship_date || null,
      customer_notes: form.customer_notes.trim() || null,
    }

    try {
      if (editingOrder) {
        await actions.update.mutateAsync({
          id: editingOrder.id,
          body: payload,
        })
        flash.success(
          `Order ${editingOrder.order_number} was updated successfully.`
        )
      } else {
        // Status defaults to draft and the sales person to the creator (API).
        const created = await actions.create.mutateAsync(payload)
        flash.success(
          `Draft sales order ${created.order_number} was created.`
        )
      }

      resetForm()
    } catch (err) {
      setFormError(errorMessage(err, 'Failed to save the order.'))
    }
  }

  async function runStatus(
    order: SalesOrder,
    next: OrderStatus,
    label: string,
    successMessage: string
  ) {
    const ok = await confirm({
      title: `${label}?`,
      message: `${order.order_number} — ${order.customer?.company_name || 'customer'}`,
      confirmLabel: label,
    })
    if (!ok) return

    setBusy({ id: order.id, action: next })
    try {
      await actions.setStatus.mutateAsync({ id: order.id, status: next })
      flash.success(successMessage)
    } catch (err) {
      flash.error(err)
    } finally {
      setBusy(null)
    }
  }

  async function sendToExport(order: SalesOrder) {
    const ok = await confirm({
      title: 'Send to Export?',
      message: `${order.order_number} will be handed to the Export Manager for acceptance. It can no longer be edited unless Export returns it to Sales.`,
      confirmLabel: 'Send to Export',
    })
    if (!ok) return

    setBusy({ id: order.id, action: 'send' })
    try {
      await actions.sendToExport.mutateAsync(order.id)
      flash.success(
        `${order.order_number} was sent to Export. The Export Manager has been notified.`
      )
    } catch (err) {
      flash.error(err, 'Failed to send the order to Export.')
    } finally {
      setBusy(null)
    }
  }

  async function acceptExportOrder(order: SalesOrder) {
    const ok = await confirm({
      title: 'Accept order for export?',
      message: `${order.order_number}: ${formatKg(order.quantity_kg)} of ${order.product_name}. Export batches can be created once accepted.`,
      confirmLabel: 'Accept Order',
    })
    if (!ok) return

    setBusy({ id: order.id, action: 'accept' })
    try {
      await actions.accept.mutateAsync(order.id)
      flash.success(
        `${order.order_number} has been accepted by Export. The sales person has been notified.`
      )
    } catch (err) {
      flash.error(err, 'Failed to accept the export order.')
    } finally {
      setBusy(null)
    }
  }

  async function cancelOrder(order: SalesOrder) {
    const reason = await confirm({
      title: `Cancel ${order.order_number}?`,
      message: 'The cancellation reason is saved on the order and shared with the team.',
      confirmLabel: 'Cancel Order',
      danger: true,
      withReason: true,
      reasonLabel: 'Cancellation reason',
      reasonRequired: true,
    })
    if (typeof reason !== 'string' || !reason) return

    setBusy({ id: order.id, action: 'cancelled' })
    try {
      await actions.setStatus.mutateAsync({
        id: order.id,
        status: 'cancelled',
        reason,
      })
      flash.success(`${order.order_number} was cancelled.`)
    } catch (err) {
      flash.error(err)
    } finally {
      setBusy(null)
    }
  }

  async function deleteOrder(order: SalesOrder) {
    const ok = await confirm({
      title: `Delete ${order.order_number}?`,
      message: 'The order and its items are permanently deleted. This cannot be undone.',
      confirmLabel: 'Delete',
      danger: true,
    })
    if (!ok) return

    setBusy({ id: order.id, action: 'delete' })
    try {
      await actions.remove.mutateAsync(order.id)
      if (viewId === order.id) setViewId(null)
      flash.success(`${order.order_number} was deleted.`)
    } catch (err) {
      flash.error(err)
    } finally {
      setBusy(null)
    }
  }

  const rowHandlers: RowHandlers = {
    edit: openEditForm,
    view: (order) => setViewId(order.id),
    confirm: (order) =>
      runStatus(order, 'confirmed', 'Confirm order', `${order.order_number} has been confirmed.`),
    backToDraft: (order) =>
      runStatus(order, 'draft', 'Back to draft', `${order.order_number} is a draft again.`),
    returnToSales: (order) =>
      runStatus(
        order,
        'confirmed',
        'Return to Sales',
        `${order.order_number} was returned to Sales. The sales person has been notified.`
      ),
    sendToExport,
    accept: acceptExportOrder,
    cancel: cancelOrder,
    remove: deleteOrder,
  }

  const totalQuantity = useMemo(() => {
    return orders.reduce(
      (total, order) => total + Number(order.quantity_kg || 0),
      0
    )
  }, [orders])

  // Keep an inactive/current customer selectable while editing.
  const customerOptions = useMemo(() => {
    const list: { id: string; label: string }[] = customers.map((c) => ({
      id: c.id,
      label: `${c.company_name} (${c.customer_code})`,
    }))
    if (
      editingOrder?.customer_id &&
      editingOrder.customer &&
      !list.some((c) => c.id === editingOrder.customer_id)
    ) {
      list.unshift({
        id: editingOrder.customer_id,
        label: `${editingOrder.customer.company_name} (${editingOrder.customer.customer_code})`,
      })
    }
    return list
  }, [customers, editingOrder])

  const saving = actions.create.isPending || actions.update.isPending

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            Sales Orders
          </h1>
          <p className="mt-1 text-sm text-gray-500">
            {isSales
              ? 'Create, manage, confirm, and send customer orders to Export.'
              : 'Review orders sent by Sales and accept them for export.'}
          </p>
        </div>

        {canCreate && (
          <button
            type="button"
            onClick={openCreateForm}
            className="rounded-lg bg-black px-4 py-2.5 text-sm font-medium text-white hover:bg-gray-800"
          >
            + New Order
          </button>
        )}
      </div>

      {/* Messages */}
      {flash.banner}

      {/* Order Form */}
      {showForm && canEdit && (
        <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
          <div className="mb-6 flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">
                {editingOrder
                  ? `Edit Sales Order ${editingOrder.order_number}`
                  : 'Create Sales Order'}
              </h2>
              <p className="mt-1 text-sm text-gray-500">
                {editingOrder
                  ? 'Orders can be edited while they are a draft or confirmed.'
                  : 'Enter the customer and coffee order information. The order number is assigned automatically and the order starts as a draft.'}
              </p>
            </div>

            <button
              type="button"
              onClick={resetForm}
              className="text-sm font-medium text-gray-500 hover:text-gray-900"
            >
              Cancel
            </button>
          </div>

          {formError && (
            <div className="mb-6">
              <Alert type="error" onClose={() => setFormError('')}>
                {formError}
              </Alert>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Customer */}
            <div>
              <h3 className="mb-4 text-sm font-semibold uppercase tracking-wide text-gray-700">
                Customer Information
              </h3>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-gray-700">
                    Customer *
                  </label>

                  <select
                    value={form.customer_id}
                    onChange={(e) =>
                      handleCustomerChange(e.target.value)
                    }
                    disabled={customersQuery.isLoading}
                    className={inputClass}
                    required
                  >
                    <option value="">
                      {customersQuery.isLoading ? 'Loading customers…' : 'Select customer'}
                    </option>

                    {customerOptions.map((customer) => (
                      <option key={customer.id} value={customer.id}>
                        {customer.label}
                      </option>
                    ))}
                  </select>

                  {customersQuery.isError && (
                    <p className="mt-1 text-xs text-red-600">
                      {errorMessage(customersQuery.error, 'Could not load customers.')}{' '}
                      <button
                        type="button"
                        onClick={() => customersQuery.refetch()}
                        className="underline"
                      >
                        Retry
                      </button>
                    </p>
                  )}

                  {!customersQuery.isLoading &&
                    !customersQuery.isError &&
                    customers.length === 0 && (
                      <p className="mt-1 text-xs text-gray-500">
                        No active customers found. Add a customer first.
                      </p>
                    )}
                </div>

                <div>
                  <label className="mb-1.5 block text-sm font-medium text-gray-700">
                    Destination Country
                  </label>

                  <input
                    type="text"
                    value={form.destination_country}
                    onChange={(e) =>
                      updateForm(
                        'destination_country',
                        e.target.value
                      )
                    }
                    placeholder="e.g. Germany"
                    className={inputClass}
                  />
                </div>

                <div>
                  <label className="mb-1.5 block text-sm font-medium text-gray-700">
                    Destination Port
                  </label>

                  <input
                    type="text"
                    value={form.destination_port}
                    onChange={(e) =>
                      updateForm(
                        'destination_port',
                        e.target.value
                      )
                    }
                    placeholder="e.g. Hamburg"
                    className={inputClass}
                  />
                </div>
              </div>
            </div>

            {/* Coffee Information */}
            <div>
              <h3 className="mb-4 text-sm font-semibold uppercase tracking-wide text-gray-700">
                Coffee Order
              </h3>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-gray-700">
                    Product *
                  </label>

                  <input
                    type="text"
                    value={form.product_name}
                    onChange={(e) =>
                      updateForm('product_name', e.target.value)
                    }
                    placeholder="e.g. Yirgacheffe G1 Washed"
                    className={inputClass}
                    required
                  />
                </div>

                <div>
                  <label className="mb-1.5 block text-sm font-medium text-gray-700">
                    Origin
                  </label>

                  <input
                    type="text"
                    value={form.origin}
                    onChange={(e) =>
                      updateForm('origin', e.target.value)
                    }
                    placeholder="e.g. Yirgacheffe"
                    className={inputClass}
                  />
                </div>

                <div>
                  <label className="mb-1.5 block text-sm font-medium text-gray-700">
                    Grade
                  </label>

                  <input
                    type="text"
                    value={form.grade}
                    onChange={(e) =>
                      updateForm('grade', e.target.value)
                    }
                    placeholder="e.g. G1"
                    className={inputClass}
                  />
                </div>

                <div>
                  <label className="mb-1.5 block text-sm font-medium text-gray-700">
                    Processing Method
                  </label>

                  <select
                    value={form.processing_method}
                    onChange={(e) =>
                      updateForm(
                        'processing_method',
                        e.target.value
                      )
                    }
                    className={inputClass}
                  >
                    <option value="">Select processing method</option>
                    <option value="Washed">Washed</option>
                    <option value="Natural">Natural</option>
                    <option value="Honey">Honey</option>
                    <option value="Anaerobic">Anaerobic</option>
                    <option value="Other">Other</option>
                    {form.processing_method &&
                      !['Washed', 'Natural', 'Honey', 'Anaerobic', 'Other'].includes(form.processing_method) && (
                        <option value={form.processing_method}>{form.processing_method}</option>
                      )}
                  </select>
                </div>
              </div>
            </div>

            {/* Commercial Information */}
            <div>
              <h3 className="mb-4 text-sm font-semibold uppercase tracking-wide text-gray-700">
                Commercial Information
              </h3>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-gray-700">
                    Quantity (KG) *
                  </label>

                  <input
                    type="number"
                    min="0.01"
                    step="0.01"
                    value={form.quantity_kg}
                    onChange={(e) =>
                      updateForm('quantity_kg', e.target.value)
                    }
                    placeholder="0.00"
                    className={inputClass}
                    required
                  />
                </div>

                <div>
                  <label className="mb-1.5 block text-sm font-medium text-gray-700">
                    Unit Price (per KG)
                  </label>

                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={form.unit_price}
                    onChange={(e) =>
                      updateForm('unit_price', e.target.value)
                    }
                    placeholder="0.00"
                    className={inputClass}
                  />
                </div>

                <div>
                  <label className="mb-1.5 block text-sm font-medium text-gray-700">
                    Currency
                  </label>

                  <select
                    value={form.currency}
                    onChange={(e) =>
                      updateForm('currency', e.target.value)
                    }
                    className={inputClass}
                  >
                    {CURRENCIES.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="mb-1.5 block text-sm font-medium text-gray-700">
                    Incoterm
                  </label>

                  <input
                    type="text"
                    list="order-incoterms"
                    value={form.incoterm}
                    onChange={(e) =>
                      updateForm('incoterm', e.target.value)
                    }
                    placeholder="e.g. FOB Djibouti"
                    maxLength={60}
                    className={inputClass}
                  />
                  <datalist id="order-incoterms">
                    {INCOTERMS.map((term) => (
                      <option key={term} value={term} />
                    ))}
                  </datalist>
                </div>

                <div className="md:col-span-2">
                  <label className="mb-1.5 block text-sm font-medium text-gray-700">
                    Payment Terms
                  </label>

                  <input
                    type="text"
                    value={form.payment_terms}
                    onChange={(e) =>
                      updateForm('payment_terms', e.target.value)
                    }
                    placeholder="e.g. CAD, 30% advance / 70% against documents"
                    maxLength={200}
                    className={inputClass}
                  />
                </div>
              </div>
            </div>

            {/* Shipping */}
            <div>
              <h3 className="mb-4 text-sm font-semibold uppercase tracking-wide text-gray-700">
                Shipping Information
              </h3>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-gray-700">
                    Requested Ship Date
                  </label>

                  <input
                    type="date"
                    value={form.requested_ship_date}
                    onChange={(e) =>
                      updateForm(
                        'requested_ship_date',
                        e.target.value
                      )
                    }
                    className={inputClass}
                  />
                </div>

                <div>
                  <label className="mb-1.5 block text-sm font-medium text-gray-700">
                    Destination
                  </label>

                  <input
                    type="text"
                    value={form.destination_country}
                    onChange={(e) =>
                      updateForm(
                        'destination_country',
                        e.target.value
                      )
                    }
                    placeholder="Country"
                    className={inputClass}
                  />
                </div>
              </div>
            </div>

            {/* Notes */}
            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700">
                Customer Notes
              </label>

              <textarea
                value={form.customer_notes}
                onChange={(e) =>
                  updateForm('customer_notes', e.target.value)
                }
                rows={4}
                placeholder="Additional customer requirements or order notes..."
                className={inputClass}
              />
            </div>

            {/* Buttons */}
            <div className="flex flex-wrap justify-end gap-3 border-t border-gray-200 pt-5">
              <button
                type="button"
                onClick={resetForm}
                className="rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>

              <button
                type="submit"
                disabled={saving}
                className="rounded-lg bg-black px-5 py-2.5 text-sm font-medium text-white hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {saving
                  ? 'Saving...'
                  : editingOrder
                    ? 'Update Order'
                    : 'Save Draft'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Filters */}
      <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <div className="md:col-span-2">
            <label className="mb-1.5 block text-sm font-medium text-gray-700">
              Search
            </label>

            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search order number, product, origin, destination..."
              className={inputClass}
            />
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700">
              Status
            </label>

            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className={inputClass}
            >
              <option value="all">All statuses</option>
              {Object.entries(statusLabels).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <p className="text-sm text-gray-500">Orders</p>
          <p className="mt-1 text-2xl font-bold text-gray-900">
            {totalOrders.toLocaleString()}
          </p>
        </div>

        <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <p className="text-sm text-gray-500">Total Quantity</p>
          <p className="mt-1 text-2xl font-bold text-gray-900">
            {totalQuantity.toLocaleString()} KG
          </p>
        </div>

        <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <p className="text-sm text-gray-500">Pending Export</p>
          <p className="mt-1 text-2xl font-bold text-gray-900">
            {pendingExportQuery.data?.meta.total ?? '-'}
          </p>
        </div>
      </div>

      {/* Orders Table */}
      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-700">
            Order List
          </h2>
          {ordersQuery.isFetching && !ordersQuery.isLoading && (
            <span className="text-xs text-gray-400">Refreshing…</span>
          )}
        </div>

        {ordersQuery.isLoading ? (
          <LoadingState label="Loading orders..." />
        ) : ordersQuery.isError ? (
          <ErrorState error={ordersQuery.error} onRetry={() => ordersQuery.refetch()} />
        ) : orders.length === 0 ? (
          <EmptyState
            title="No orders found"
            description={
              debouncedSearch || statusFilter !== 'all'
                ? 'Try a different search or status filter.'
                : canCreate
                  ? 'Create a new sales order to get started.'
                  : 'Orders sent by Sales will appear here.'
            }
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                    Order
                  </th>

                  <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                    Customer
                  </th>

                  <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                    Product
                  </th>

                  <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                    Quantity
                  </th>

                  <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                    Destination
                  </th>

                  <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                    Status
                  </th>

                  <th className="px-6 py-3 text-right text-xs font-semibold uppercase tracking-wide text-gray-500">
                    Actions
                  </th>
                </tr>
              </thead>

              <tbody className="divide-y divide-gray-100">
                {orders.map((order) => (
                  <tr key={order.id} className="hover:bg-gray-50">
                    <td className="whitespace-nowrap px-6 py-4">
                      <button
                        type="button"
                        onClick={() => setViewId(order.id)}
                        className="text-sm font-semibold text-gray-900 hover:underline"
                      >
                        {order.order_number}
                      </button>

                      <div className="mt-1 text-xs text-gray-500">
                        {formatDate(order.created_at)}
                      </div>

                      {order.sales_person?.full_name && (
                        <div className="mt-1 text-xs text-gray-400">
                          {order.sales_person.full_name}
                        </div>
                      )}
                    </td>

                    <td className="px-6 py-4">
                      <div className="text-sm font-medium text-gray-900">
                        {order.customer?.company_name || 'Unknown'}
                      </div>

                      <div className="mt-1 text-xs text-gray-500">
                        {order.customer?.customer_code || '-'}
                      </div>
                    </td>

                    <td className="px-6 py-4">
                      <div className="text-sm font-medium text-gray-900">
                        {order.product_name}
                      </div>

                      <div className="mt-1 text-xs text-gray-500">
                        {[order.origin, order.grade, order.processing_method]
                          .filter(Boolean)
                          .join(' • ') || '-'}
                      </div>
                    </td>

                    <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-700">
                      {Number(order.quantity_kg).toLocaleString()} KG
                      {order.unit_price !== null && (
                        <div className="mt-1 text-xs text-gray-500">
                          {formatMoney(order.unit_price, order.currency)}/kg
                          {order.incoterm ? ` · ${order.incoterm}` : ''}
                        </div>
                      )}
                    </td>

                    <td className="px-6 py-4">
                      <div className="text-sm text-gray-700">
                        {order.destination_country || '-'}
                      </div>

                      <div className="mt-1 text-xs text-gray-500">
                        {order.destination_port || '-'}
                      </div>
                    </td>

                    <td className="px-6 py-4">
                      <StatusBadge
                        status={order.status}
                        label={statusLabels[order.status] || prettyStatus(order.status)}
                      />
                      {order.status === 'cancelled' && order.cancellation_reason && (
                        <div className="mt-1 max-w-[12rem] truncate text-xs text-gray-500" title={order.cancellation_reason}>
                          {order.cancellation_reason}
                        </div>
                      )}
                    </td>

                    <td className="px-6 py-4">
                      <OrderRowActions
                        order={order}
                        canEdit={canEdit}
                        canDelete={canDelete}
                        busy={busy?.id === order.id ? busy.action : null}
                        anyBusy={busy !== null}
                        handlers={rowHandlers}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {viewId && (
        <OrderDetailModal
          id={viewId}
          canEdit={canEdit}
          onClose={() => setViewId(null)}
          onEdit={(order) => {
            setViewId(null)
            openEditForm(order)
          }}
        />
      )}

      {dialog}
    </div>
  )
}

// -----------------------------------------------------------------------------
// Row actions: driven by the workflow table (useNextStatuses) and the role
// -----------------------------------------------------------------------------
type RowHandlers = {
  edit: (order: SalesOrder) => void
  view: (order: SalesOrder) => void
  confirm: (order: SalesOrder) => void
  backToDraft: (order: SalesOrder) => void
  returnToSales: (order: SalesOrder) => void
  sendToExport: (order: SalesOrder) => void
  accept: (order: SalesOrder) => void
  cancel: (order: SalesOrder) => void
  remove: (order: SalesOrder) => void
}

function OrderRowActions({
  order,
  canEdit,
  canDelete,
  busy,
  anyBusy,
  handlers,
}: {
  order: SalesOrder
  canEdit: boolean
  canDelete: boolean
  busy: string | null
  anyBusy: boolean
  handlers: RowHandlers
}) {
  const next = useNextStatuses('sales_order', order.status).map((t) => t.to_status)
  const has = (s: OrderStatus) => next.includes(s)

  const secondary =
    'rounded-lg border border-gray-300 bg-white px-3 py-2 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50'
  const primary =
    'rounded-lg bg-black px-3 py-2 text-xs font-medium text-white hover:bg-gray-800 disabled:opacity-50'

  const editable = EDITABLE.includes(order.status)
  const withExport = order.status === 'export_accepted' || order.status === 'processing'

  return (
    <div className="flex flex-wrap justify-end gap-2">
      <button type="button" onClick={() => handlers.view(order)} className={secondary}>
        View
      </button>

      {canEdit && editable && (
        <button type="button" onClick={() => handlers.edit(order)} className={secondary}>
          Edit
        </button>
      )}

      {order.status === 'draft' && has('confirmed') && (
        <button type="button" disabled={anyBusy} onClick={() => handlers.confirm(order)} className={primary}>
          {busy === 'confirmed' ? 'Confirming...' : 'Confirm'}
        </button>
      )}

      {order.status === 'confirmed' && has('draft') && (
        <button type="button" disabled={anyBusy} onClick={() => handlers.backToDraft(order)} className={secondary}>
          {busy === 'draft' ? 'Saving...' : 'Back to draft'}
        </button>
      )}

      {editable && has('sent_to_export') && (
        <button type="button" disabled={anyBusy} onClick={() => handlers.sendToExport(order)} className={primary}>
          {busy === 'send' ? 'Sending...' : 'Send to Export'}
        </button>
      )}

      {order.status === 'sent_to_export' && has('export_accepted') && (
        <button type="button" disabled={anyBusy} onClick={() => handlers.accept(order)} className={primary}>
          {busy === 'accept' ? 'Accepting...' : 'Accept Order'}
        </button>
      )}

      {order.status === 'sent_to_export' && has('confirmed') && (
        <button type="button" disabled={anyBusy} onClick={() => handlers.returnToSales(order)} className={secondary}>
          {busy === 'confirmed' ? 'Returning...' : 'Return to Sales'}
        </button>
      )}

      {withExport && (
        <span className="px-2 py-2 text-xs font-medium text-gray-500">
          With Export
        </span>
      )}

      {has('cancelled') && (
        <button
          type="button"
          disabled={anyBusy}
          onClick={() => handlers.cancel(order)}
          className="rounded-lg border border-red-200 bg-white px-3 py-2 text-xs font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
        >
          {busy === 'cancelled' ? 'Cancelling...' : 'Cancel'}
        </button>
      )}

      {canDelete && (order.status === 'draft' || order.status === 'cancelled') && (
        <button
          type="button"
          disabled={anyBusy}
          onClick={() => handlers.remove(order)}
          className="rounded-lg border border-red-200 bg-white px-3 py-2 text-xs font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
        >
          {busy === 'delete' ? 'Deleting...' : 'Delete'}
        </button>
      )}
    </div>
  )
}

// -----------------------------------------------------------------------------
// Order detail: customer, commercial info, timeline, items, export batches, docs
// -----------------------------------------------------------------------------
type ItemForm = {
  description: string
  quantity_kg: string
  grade: string
  processing_method: string
  unit_price: string
}
const emptyItem: ItemForm = { description: '', quantity_kg: '', grade: '', processing_method: '', unit_price: '' }

function itemPayload(f: ItemForm): { body?: Record<string, unknown>; error?: string } {
  if (!f.description.trim()) return { error: 'Enter an item description.' }
  const qty = Number(f.quantity_kg)
  if (!qty || Number.isNaN(qty) || qty <= 0) return { error: 'Item quantity must be greater than 0.' }
  const price = f.unit_price.trim() === '' ? null : Number(f.unit_price)
  if (price !== null && (Number.isNaN(price) || price < 0)) return { error: 'Enter a valid unit price.' }
  return {
    body: {
      description: f.description.trim(),
      quantity_kg: qty,
      grade: f.grade.trim() || null,
      processing_method: f.processing_method.trim() || null,
      unit_price: price,
    },
  }
}

function OrderDetailModal({
  id,
  canEdit,
  onClose,
  onEdit,
}: {
  id: string
  canEdit: boolean
  onClose: () => void
  onEdit: (order: SalesOrder) => void
}) {
  const detail = useSalesOrder(id)
  const order = detail.data
  const actions = useOrderActions()
  const flash = useFlash()
  const { confirm, dialog } = useConfirm()

  const [newItem, setNewItem] = useState<ItemForm>(emptyItem)
  const [editingItem, setEditingItem] = useState<{ id: string; form: ItemForm } | null>(null)

  useEffect(() => {
    setNewItem(emptyItem)
    setEditingItem(null)
  }, [id])

  const editable = Boolean(order && EDITABLE.includes(order.status) && canEdit)

  const addItem = async (e: FormEvent) => {
    e.preventDefault()
    if (!order) return
    const { body, error } = itemPayload(newItem)
    if (!body) return flash.error(new Error(error))
    try {
      await actions.addItem.mutateAsync({ id: order.id, body })
      setNewItem(emptyItem)
      flash.success('Item added.')
    } catch (err) {
      flash.error(err)
    }
  }

  const saveItem = async () => {
    if (!order || !editingItem) return
    const { body, error } = itemPayload(editingItem.form)
    if (!body) return flash.error(new Error(error))
    try {
      await actions.updateItem.mutateAsync({ id: order.id, itemId: editingItem.id, body })
      setEditingItem(null)
      flash.success('Item updated.')
    } catch (err) {
      flash.error(err)
    }
  }

  const removeItem = async (item: SalesOrderItem) => {
    if (!order) return
    const ok = await confirm({
      title: 'Remove item?',
      message: item.description,
      confirmLabel: 'Remove',
      danger: true,
    })
    if (!ok) return
    try {
      await actions.removeItem.mutateAsync({ id: order.id, itemId: item.id })
      flash.success('Item removed.')
    } catch (err) {
      flash.error(err)
    }
  }

  const itemInput = 'w-full rounded-lg border border-gray-300 px-2 py-1.5 text-xs outline-none focus:border-black'

  return (
    <Modal
      open
      size="xl"
      onClose={onClose}
      title={
        order ? (
          <span className="flex flex-wrap items-center gap-3">
            Sales Order {order.order_number}
            <StatusBadge status={order.status} label={statusLabels[order.status]} />
          </span>
        ) : (
          'Sales Order'
        )
      }
      footer={
        <>
          {order && editable && (
            <button
              type="button"
              onClick={() => onEdit(order)}
              className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              Edit order
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg bg-black px-4 py-2 text-sm font-medium text-white hover:bg-gray-800"
          >
            Close
          </button>
        </>
      }
    >
      {detail.isLoading ? (
        <LoadingState label="Loading order..." />
      ) : detail.isError || !order ? (
        <ErrorState error={detail.error} onRetry={() => detail.refetch()} />
      ) : (
        <div className="space-y-6">
          {flash.banner}

          {order.status === 'cancelled' && (
            <Alert type="warning">
              Cancelled {formatDateTime(order.cancelled_at)}
              {order.cancellation_reason ? ` — ${order.cancellation_reason}` : ''}
            </Alert>
          )}

          {/* Customer */}
          <section>
            <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-700">Customer</h3>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <Field
                label="Company"
                value={order.customer ? `${order.customer.company_name} (${order.customer.customer_code})` : null}
              />
              <Field label="Customer country" value={order.customer?.country} />
              <Field label="Linked quote" value={order.quote?.reference_number} />
              <Field label="Sales person" value={order.sales_person?.full_name} />
              <Field label="Destination" value={[order.destination_country, order.destination_port].filter(Boolean).join(' · ')} />
              <Field label="Requested ship date" value={formatDate(order.requested_ship_date)} />
            </div>
          </section>

          {/* Commercial */}
          <section>
            <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-700">Commercial Information</h3>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <Field
                label="Product"
                value={[order.product_name, order.origin, order.grade, order.processing_method].filter(Boolean).join(' • ')}
              />
              <Field label="Quantity" value={formatKg(order.quantity_kg)} />
              <Field
                label="Unit price"
                value={order.unit_price !== null ? `${formatMoney(order.unit_price, order.currency)} / kg` : null}
              />
              <Field
                label="Order value"
                value={
                  order.unit_price !== null
                    ? formatMoney(Number(order.unit_price) * Number(order.quantity_kg), order.currency)
                    : null
                }
              />
              <Field label="Incoterm" value={order.incoterm} />
              <Field label="Payment terms" value={order.payment_terms} />
              <div className="sm:col-span-3">
                <Field
                  label="Customer notes"
                  value={order.customer_notes ? <span className="whitespace-pre-wrap">{order.customer_notes}</span> : null}
                />
              </div>
            </div>
          </section>

          {/* Timeline */}
          <section>
            <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-700">Timeline</h3>
            <ol className="space-y-2 border-l border-gray-200 pl-4 text-sm">
              <TimelineRow label="Created" at={order.created_at} note={order.sales_person?.full_name ? `by ${order.sales_person.full_name}` : undefined} />
              <TimelineRow label="Sent to Export" at={order.sent_to_export_at} />
              <TimelineRow
                label="Accepted by Export"
                at={order.export_accepted_at}
                note={order.accepted_by?.full_name ? `by ${order.accepted_by.full_name}` : undefined}
              />
              <TimelineRow label="Shipped" at={order.shipped_at} />
              <TimelineRow label="Completed" at={order.completed_at} />
              {order.cancelled_at && (
                <TimelineRow label="Cancelled" at={order.cancelled_at} note={order.cancellation_reason ?? undefined} danger />
              )}
            </ol>
          </section>

          {/* Items */}
          <OrderItemsSection
            order={order}
            editable={editable}
            editingItem={editingItem}
            setEditingItem={setEditingItem}
            newItem={newItem}
            setNewItem={setNewItem}
            onAdd={addItem}
            onSave={saveItem}
            onRemove={removeItem}
            itemInput={itemInput}
            pending={actions.addItem.isPending || actions.updateItem.isPending || actions.removeItem.isPending}
          />

          {/* Export batches */}
          <section>
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-semibold uppercase tracking-wide text-gray-700">Export Batches & Shipments</h3>
              <span className="text-xs text-gray-500">
                Allocated {formatKg(order.allocated_kg)} of {formatKg(order.quantity_kg)}
                {' · '}Remaining {formatKg(Math.max(0, Number(order.quantity_kg) - Number(order.allocated_kg || 0)))}
              </span>
            </div>
            <div className="mb-3 h-2 w-full overflow-hidden rounded-full bg-gray-100">
              <div
                className="h-full bg-black"
                style={{
                  width: `${Math.min(100, (Number(order.allocated_kg || 0) / Math.max(1, Number(order.quantity_kg))) * 100)}%`,
                }}
              />
            </div>
            {order.export_batches.length === 0 ? (
              <p className="text-sm text-gray-500">
                No export batches yet.
                {order.status === 'export_accepted' ? ' The Export Manager can now create a batch for this order.' : ''}
              </p>
            ) : (
              <div className="overflow-x-auto rounded-lg border border-gray-200">
                <table className="min-w-full text-sm">
                  <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
                    <tr>
                      <th className="px-3 py-2 text-left">Batch</th>
                      <th className="px-3 py-2 text-left">Quantity</th>
                      <th className="px-3 py-2 text-left">Status</th>
                      <th className="px-3 py-2 text-left">Shipments</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {order.export_batches.map((batch) => (
                      <tr key={batch.id}>
                        <td className="px-3 py-2 font-medium text-gray-900">
                          {batch.batch_number}
                          <div className="text-xs font-normal text-gray-500">{formatDate(batch.created_at)}</div>
                        </td>
                        <td className="px-3 py-2">{formatKg(batch.total_quantity_kg)}</td>
                        <td className="px-3 py-2"><StatusBadge status={batch.status} /></td>
                        <td className="px-3 py-2">
                          {batch.shipments?.length ? (
                            <div className="space-y-1">
                              {batch.shipments.map((s) => (
                                <div key={s.id} className="flex flex-wrap items-center gap-2">
                                  <span className="font-medium">{s.shipment_number}</span>
                                  <StatusBadge status={s.status} />
                                  {s.estimated_arrival && (
                                    <span className="text-xs text-gray-500">ETA {formatDate(s.estimated_arrival)}</span>
                                  )}
                                </div>
                              ))}
                            </div>
                          ) : (
                            <span className="text-xs text-gray-500">No shipment yet</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <DocumentsPanel relatedType="sales_order" relatedId={order.id} defaultType="contract" />
        </div>
      )}
      {dialog}
    </Modal>
  )
}

function TimelineRow({ label, at, note, danger }: { label: string; at: string | null | undefined; note?: string; danger?: boolean }) {
  return (
    <li className="relative">
      <span
        className={`absolute -left-[21px] top-1.5 h-2.5 w-2.5 rounded-full ${
          at ? (danger ? 'bg-red-500' : 'bg-black') : 'bg-gray-300'
        }`}
      />
      <span className={`font-medium ${at ? 'text-gray-900' : 'text-gray-400'}`}>{label}</span>
      <span className="ml-2 text-gray-500">{at ? formatDateTime(at) : 'Pending'}</span>
      {note && at && <span className="ml-2 text-xs text-gray-500">{note}</span>}
    </li>
  )
}

function OrderItemsSection({
  order,
  editable,
  editingItem,
  setEditingItem,
  newItem,
  setNewItem,
  onAdd,
  onSave,
  onRemove,
  itemInput,
  pending,
}: {
  order: SalesOrderDetail
  editable: boolean
  editingItem: { id: string; form: ItemForm } | null
  setEditingItem: (v: { id: string; form: ItemForm } | null) => void
  newItem: ItemForm
  setNewItem: (v: ItemForm) => void
  onAdd: (e: FormEvent) => void
  onSave: () => void
  onRemove: (item: SalesOrderItem) => void
  itemInput: string
  pending: boolean
}) {
  const toItemForm = (item: SalesOrderItem): ItemForm => ({
    description: item.description,
    quantity_kg: String(item.quantity_kg),
    grade: item.grade ?? '',
    processing_method: item.processing_method ?? '',
    unit_price: item.unit_price !== null ? String(item.unit_price) : '',
  })
  const itemsKg = order.items.reduce((s, i) => s + Number(i.quantity_kg || 0), 0)

  return (
    <section>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-gray-700">Items</h3>
        {order.items.length > 0 && (
          <span className="text-xs text-gray-500">
            {formatKg(itemsKg)} in items · order quantity {formatKg(order.quantity_kg)}
          </span>
        )}
      </div>

      {!editable && EDITABLE.includes(order.status) === false && (
        <p className="mb-2 text-xs text-gray-500">Items are locked once the order is sent to Export.</p>
      )}

      <div className="overflow-x-auto rounded-lg border border-gray-200">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
            <tr>
              <th className="px-3 py-2 text-left">Description</th>
              <th className="px-3 py-2 text-left">Quantity (kg)</th>
              <th className="px-3 py-2 text-left">Grade</th>
              <th className="px-3 py-2 text-left">Processing</th>
              <th className="px-3 py-2 text-left">Unit price</th>
              {editable && <th className="px-3 py-2 text-right">Actions</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {order.items.length === 0 && (
              <tr>
                <td colSpan={editable ? 6 : 5} className="px-3 py-4 text-center text-sm text-gray-500">
                  No line items. The order header quantity and product apply.
                </td>
              </tr>
            )}
            {order.items.map((item) =>
              editingItem?.id === item.id ? (
                <tr key={item.id} className="bg-gray-50">
                  {(['description', 'quantity_kg', 'grade', 'processing_method', 'unit_price'] as const).map((key) => (
                    <td key={key} className="px-3 py-2">
                      <input
                        type={key === 'quantity_kg' || key === 'unit_price' ? 'number' : 'text'}
                        min={key === 'quantity_kg' ? '0.01' : key === 'unit_price' ? '0' : undefined}
                        step={key === 'quantity_kg' || key === 'unit_price' ? '0.01' : undefined}
                        value={editingItem.form[key]}
                        onChange={(e) =>
                          setEditingItem({ id: item.id, form: { ...editingItem.form, [key]: e.target.value } })
                        }
                        className={itemInput}
                      />
                    </td>
                  ))}
                  <td className="whitespace-nowrap px-3 py-2 text-right">
                    <button
                      type="button"
                      disabled={pending}
                      onClick={onSave}
                      className="mr-2 rounded-lg bg-black px-2.5 py-1.5 text-xs font-medium text-white disabled:opacity-50"
                    >
                      Save
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditingItem(null)}
                      className="rounded-lg border border-gray-300 bg-white px-2.5 py-1.5 text-xs font-medium text-gray-700"
                    >
                      Cancel
                    </button>
                  </td>
                </tr>
              ) : (
                <tr key={item.id}>
                  <td className="px-3 py-2 text-gray-900">{item.description}</td>
                  <td className="px-3 py-2">{formatKg(item.quantity_kg)}</td>
                  <td className="px-3 py-2">{item.grade || '-'}</td>
                  <td className="px-3 py-2">{item.processing_method || '-'}</td>
                  <td className="px-3 py-2">{formatMoney(item.unit_price, order.currency)}</td>
                  {editable && (
                    <td className="whitespace-nowrap px-3 py-2 text-right">
                      <button
                        type="button"
                        disabled={pending}
                        onClick={() => setEditingItem({ id: item.id, form: toItemForm(item) })}
                        className="mr-2 rounded-lg border border-gray-300 bg-white px-2.5 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        disabled={pending}
                        onClick={() => onRemove(item)}
                        className="rounded-lg border border-red-200 bg-white px-2.5 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
                      >
                        Remove
                      </button>
                    </td>
                  )}
                </tr>
              )
            )}
          </tbody>
        </table>
      </div>

      {editable && (
        <form onSubmit={onAdd} className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-6">
          <input
            value={newItem.description}
            onChange={(e) => setNewItem({ ...newItem, description: e.target.value })}
            placeholder="Description *"
            className={`${itemInput} col-span-2`}
          />
          <input
            type="number"
            min="0.01"
            step="0.01"
            value={newItem.quantity_kg}
            onChange={(e) => setNewItem({ ...newItem, quantity_kg: e.target.value })}
            placeholder="Kg *"
            className={itemInput}
          />
          <input
            value={newItem.grade}
            onChange={(e) => setNewItem({ ...newItem, grade: e.target.value })}
            placeholder="Grade"
            className={itemInput}
          />
          <input
            type="number"
            min="0"
            step="0.01"
            value={newItem.unit_price}
            onChange={(e) => setNewItem({ ...newItem, unit_price: e.target.value })}
            placeholder={`Price (${order.currency || 'USD'})`}
            className={itemInput}
          />
          <button
            type="submit"
            disabled={pending}
            className="rounded-lg bg-black px-3 py-1.5 text-xs font-medium text-white hover:bg-gray-800 disabled:opacity-50"
          >
            {pending ? 'Saving...' : '+ Add item'}
          </button>
        </form>
      )}
    </section>
  )
}
