import { useState } from 'react'
import { useAuth } from '../../contexts/AuthContext'
import { useDebounce } from '../../hooks'
import { downloadCsv } from '../../lib/api'
import { useSupplier, useSupplierActions, useSuppliers } from '../../queries/admin'
import type { Supplier } from '../../types'
import {
  EmptyState,
  ErrorState,
  Field,
  LoadingState,
  Modal,
  Pagination,
  StatusBadge,
  SummaryCard,
  formatDate,
  formatKg,
  prettyStatus,
  useConfirm,
  useFlash,
} from '../../components/admin/ui'

type FormData = {
  name: string
  supplier_type: string
  contact_person: string
  phone: string
  email: string
  region: string
  zone: string
  woreda: string
  kebele: string
  address: string
  notes: string
}

const SUPPLIER_TYPES = [
  { value: 'farmer', label: 'Farmer' },
  { value: 'cooperative', label: 'Cooperative' },
  { value: 'union', label: 'Union' },
  { value: 'trader', label: 'Trader' },
  { value: 'washing_station', label: 'Washing Station' },
  { value: 'supplier', label: 'Supplier' },
  { value: 'other', label: 'Other' },
]

const LOCATION_DATA: Record<string, string[]> = {
  Oromia: [
    'Jimma',
    'Guji',
    'West Arsi',
    'East Hararghe',
    'West Hararghe',
    'West Wollega',
    'East Wollega',
    'Illubabor',
    'Bale',
  ],

  'Sidama Region': [
    'Sidama',
  ],

  'South Ethiopia Region': [
    'Gedeo',
    'Gamo',
    'Wolayita',
  ],

  'South West Ethiopia Peoples Region': [
    'Kaffa',
    'Sheka',
    'Bench Sheko',
  ],
}

/** Region options, keeping a stored value that is not in the reference list. */
function regionOptions(current: string): string[] {
  const list = Object.keys(LOCATION_DATA)
  return current && !list.includes(current) ? [...list, current] : list
}

function zoneOptions(region: string, current: string): string[] {
  const list = LOCATION_DATA[region] ?? []
  return current && !list.includes(current) ? [...list, current] : list
}

const initialForm: FormData = {
  name: '',
  supplier_type: 'farmer',
  contact_person: '',
  phone: '',
  email: '',
  region: '',
  zone: '',
  woreda: '',
  kebele: '',
  address: '',
  notes: '',
}

const PAGE_SIZE = 50

function toForm(supplier: Supplier): FormData {
  return {
    name: supplier.name ?? '',
    supplier_type: supplier.supplier_type ?? 'farmer',
    contact_person: supplier.contact_person ?? '',
    phone: supplier.phone ?? '',
    email: supplier.email ?? '',
    region: supplier.region ?? '',
    zone: supplier.zone ?? '',
    woreda: supplier.woreda ?? '',
    kebele: supplier.kebele ?? '',
    address: supplier.address ?? '',
    notes: supplier.notes ?? '',
  }
}

const typeLabel = (value: string | null | undefined) =>
  SUPPLIER_TYPES.find((t) => t.value === value)?.label ?? prettyStatus(value)

export default function AdminSuppliers() {
  const { can } = useAuth()
  const canCreate = can('suppliers', 'create')
  const canUpdate = can('suppliers', 'update')
  const canDelete = can('suppliers', 'delete')

  const flash = useFlash()
  const { confirm, dialog } = useConfirm()
  const actions = useSupplierActions()

  const [form, setForm] = useState<FormData>(initialForm)
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<Supplier | null>(null)
  const [formError, setFormError] = useState('')
  const [viewId, setViewId] = useState<string | null>(null)

  // Filters (server side)
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('')
  const [typeFilter, setTypeFilter] = useState('')
  const [region, setRegion] = useState('')
  const [page, setPage] = useState(1)
  const debouncedSearch = useDebounce(search.trim(), { delay: 400 })

  const suppliersQuery = useSuppliers({
    page,
    limit: PAGE_SIZE,
    search: debouncedSearch || undefined,
    status: status || undefined,
    supplier_type: typeFilter || undefined,
    region: region || undefined,
    sort: '-created_at',
  })
  const suppliers = suppliersQuery.data?.data ?? []
  const total = suppliersQuery.data?.meta.total ?? 0

  const saving = actions.create.isPending || actions.update.isPending
  const busy = saving || actions.remove.isPending

  function handleChange(
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>
  ) {
    const { name, value } = e.target

    if (name === 'region') {
      setForm((prev) => ({
        ...prev,
        region: value,
        zone: '',
      }))
      return
    }

    setForm((prev) => ({
      ...prev,
      [name]: value,
    }))
  }

  function openCreate() {
    setEditing(null)
    setForm(initialForm)
    setFormError('')
    setShowForm(true)
  }

  function openEdit(supplier: Supplier) {
    setEditing(supplier)
    setForm(toForm(supplier))
    setFormError('')
    setShowForm(true)
    setViewId(null)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  function closeForm() {
    setShowForm(false)
    setEditing(null)
    setForm(initialForm)
    setFormError('')
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setFormError('')

    // Required fields
    if (
      form.name.trim().length < 2 ||
      !form.supplier_type ||
      !form.region ||
      !form.zone ||
      !form.woreda.trim() ||
      !form.kebele.trim()
    ) {
      setFormError(
        'Please fill in all required fields: name (at least 2 characters), supplier type, region, zone, woreda and kebele.'
      )
      return
    }

    if (form.email.trim() && !/^\S+@\S+\.\S+$/.test(form.email.trim())) {
      setFormError('Enter a valid email address.')
      return
    }

    const body: Record<string, unknown> = {
      name: form.name.trim(),
      supplier_type: form.supplier_type,
      contact_person: form.contact_person.trim() || null,
      phone: form.phone.trim() || null,
      email: form.email.trim() || null,
      region: form.region,
      zone: form.zone,
      woreda: form.woreda.trim(),
      kebele: form.kebele.trim(),
      address: form.address.trim() || null,
      notes: form.notes.trim() || null,
    }

    try {
      if (editing) {
        const updated = (await actions.update.mutateAsync({ id: editing.id, body })) as Supplier
        flash.success(`Supplier ${updated.supplier_code} updated.`)
      } else {
        const created = (await actions.create.mutateAsync(body)) as Supplier
        flash.success(`Supplier added successfully with code ${created.supplier_code}.`)
      }
      closeForm()
    } catch (err) {
      flash.error(err)
    }
  }

  async function toggleActive(supplier: Supplier) {
    const ok = await confirm({
      title: supplier.is_active ? 'Deactivate supplier?' : 'Activate supplier?',
      message: supplier.is_active
        ? `${supplier.name} will no longer be offered when recording new collections.`
        : `${supplier.name} will be available again for new collections.`,
      confirmLabel: supplier.is_active ? 'Deactivate' : 'Activate',
    })
    if (!ok) return
    try {
      await actions.update.mutateAsync({ id: supplier.id, body: { is_active: !supplier.is_active } })
      flash.success(`Supplier ${supplier.is_active ? 'deactivated' : 'activated'}.`)
    } catch (err) {
      flash.error(err)
    }
  }

  async function handleDelete(supplier: Supplier) {
    const ok = await confirm({
      title: 'Delete supplier?',
      message: `This permanently deletes ${supplier.supplier_code} — ${supplier.name}. Suppliers referenced by farmers, collections or lots cannot be deleted; deactivate them instead.`,
      confirmLabel: 'Delete',
      danger: true,
    })
    if (!ok) return
    try {
      await actions.remove.mutateAsync(supplier.id)
      flash.success('Supplier deleted.')
      if (viewId === supplier.id) setViewId(null)
      if (editing?.id === supplier.id) closeForm()
    } catch (err) {
      flash.error(err)
    }
  }

  function downloadCSV() {
    if (suppliers.length === 0) {
      flash.error(new Error('There are no suppliers to download.'))
      return
    }

    const headers = [
      'Supplier Code',
      'Supplier Name',
      'Supplier Type',
      'Contact Person',
      'Phone',
      'Email',
      'Region',
      'Zone',
      'Woreda',
      'Kebele',
      'Additional Address',
      'Status',
      'Created At',
    ]

    const rows = suppliers.map((supplier) => [
      supplier.supplier_code,
      supplier.name,
      typeLabel(supplier.supplier_type),
      supplier.contact_person,
      supplier.phone,
      supplier.email,
      supplier.region,
      supplier.zone,
      supplier.woreda,
      supplier.kebele,
      supplier.address,
      supplier.is_active ? 'Active' : 'Inactive',
      supplier.created_at,
    ])

    downloadCsv(`waka-coffee-suppliers-${new Date().toISOString().slice(0, 10)}.csv`, headers, rows)
  }

  const inputClass =
    'w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm outline-none focus:border-black'
  const selectClass =
    'w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-black'
  const filterClass =
    'rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm outline-none focus:border-black'
  const hasFilters = Boolean(search || status || typeFilter || region)

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            Supplier Management
          </h1>

          <p className="mt-1 text-sm text-gray-500">
            Manage coffee suppliers and sourcing locations.
          </p>
        </div>

        <div className="flex gap-3">
          <button
            type="button"
            onClick={downloadCSV}
            disabled={suppliers.length === 0}
            className="rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            ↓ Download CSV
          </button>

          {canCreate && (
            <button
              type="button"
              onClick={() => (showForm ? closeForm() : openCreate())}
              className="rounded-lg bg-black px-4 py-2.5 text-sm font-medium text-white hover:bg-gray-800"
            >
              {showForm ? 'Cancel' : '+ Add Supplier'}
            </button>
          )}
        </div>
      </div>

      {/* Messages */}
      {flash.banner}

      {/* Add / Edit Supplier Form */}
      {showForm && (
        <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
          <div className="mb-6">
            <h2 className="text-lg font-semibold text-gray-900">
              {editing ? `Edit Supplier ${editing.supplier_code}` : 'Add New Supplier'}
            </h2>

            <p className="mt-1 text-sm text-gray-500">
              {editing
                ? 'Update the supplier details below.'
                : 'Supplier code will be generated automatically.'}
            </p>
          </div>

          {formError && (
            <div className="mb-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {formError}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Basic Information */}
            <div>
              <h3 className="mb-4 text-sm font-semibold uppercase tracking-wide text-gray-700">
                Basic Information
              </h3>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                {/* Supplier Name */}
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-gray-700">
                    Supplier Name *
                  </label>

                  <input
                    name="name"
                    value={form.name}
                    onChange={handleChange}
                    placeholder="Enter supplier name"
                    className={inputClass}
                  />
                </div>

                {/* Supplier Type */}
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-gray-700">
                    Supplier Type *
                  </label>

                  <select
                    name="supplier_type"
                    value={form.supplier_type}
                    onChange={handleChange}
                    className={selectClass}
                  >
                    {SUPPLIER_TYPES.map((t) => (
                      <option key={t.value} value={t.value}>
                        {t.label}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Contact Person */}
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-gray-700">
                    Contact Person
                  </label>

                  <input
                    name="contact_person"
                    value={form.contact_person}
                    onChange={handleChange}
                    placeholder="Optional contact person"
                    className={inputClass}
                  />
                </div>

                {/* Phone */}
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-gray-700">
                    Phone Number
                  </label>

                  <input
                    name="phone"
                    value={form.phone}
                    onChange={handleChange}
                    placeholder="Enter phone number"
                    type="tel"
                    className={inputClass}
                  />
                </div>

                {/* Email */}
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-gray-700">
                    Email
                  </label>

                  <input
                    name="email"
                    value={form.email}
                    onChange={handleChange}
                    placeholder="Optional email address"
                    type="email"
                    className={inputClass}
                  />
                </div>
              </div>
            </div>

            {/* Location */}
            <div>
              <h3 className="mb-4 text-sm font-semibold uppercase tracking-wide text-gray-700">
                Sourcing Location
              </h3>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                {/* Region */}
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-gray-700">
                    Region *
                  </label>

                  <select
                    name="region"
                    value={form.region}
                    onChange={handleChange}
                    className={selectClass}
                  >
                    <option value="">Select region</option>

                    {regionOptions(form.region).map((r) => (
                      <option key={r} value={r}>
                        {r}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Zone */}
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-gray-700">
                    Zone *
                  </label>

                  <select
                    name="zone"
                    value={form.zone}
                    onChange={handleChange}
                    disabled={!form.region}
                    className={`${selectClass} disabled:bg-gray-100`}
                  >
                    <option value="">Select zone</option>

                    {form.region &&
                      zoneOptions(form.region, form.zone).map((zone) => (
                        <option key={zone} value={zone}>
                          {zone}
                        </option>
                      ))}
                  </select>
                </div>

                {/* Woreda */}
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-gray-700">
                    Woreda *
                  </label>

                  <input
                    name="woreda"
                    value={form.woreda}
                    onChange={handleChange}
                    placeholder="Enter woreda"
                    className={inputClass}
                  />
                </div>

                {/* Kebele */}
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-gray-700">
                    Kebele *
                  </label>

                  <input
                    name="kebele"
                    value={form.kebele}
                    onChange={handleChange}
                    placeholder="Enter kebele"
                    className={inputClass}
                  />
                </div>
              </div>
            </div>

            {/* Address */}
            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700">
                Additional Address
              </label>

              <textarea
                name="address"
                value={form.address}
                onChange={handleChange}
                placeholder="Optional additional address information"
                rows={3}
                className={inputClass}
              />
            </div>

            {/* Notes */}
            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700">
                Notes
              </label>

              <textarea
                name="notes"
                value={form.notes}
                onChange={handleChange}
                placeholder="Optional notes"
                rows={3}
                className={inputClass}
              />
            </div>

            {/* Buttons */}
            <div className="flex justify-end gap-3 border-t border-gray-100 pt-5">
              <button
                type="button"
                onClick={closeForm}
                className="rounded-lg border border-gray-300 px-5 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>

              <button
                type="submit"
                disabled={saving}
                className="rounded-lg bg-black px-5 py-2.5 text-sm font-medium text-white hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {saving ? 'Saving...' : editing ? 'Update Supplier' : 'Save Supplier'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Suppliers Table */}
      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        <div className="flex flex-col gap-4 border-b border-gray-200 px-6 py-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="font-semibold text-gray-900">
              Suppliers
            </h2>

            <p className="text-sm text-gray-500">
              {total} supplier
              {total !== 1 ? 's' : ''} {hasFilters ? 'found' : 'registered'}
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <input
              value={search}
              onChange={(e) => {
                setSearch(e.target.value)
                setPage(1)
              }}
              placeholder="Search name, code, contact, phone…"
              className={`${filterClass} w-64`}
            />

            <select
              value={typeFilter}
              onChange={(e) => {
                setTypeFilter(e.target.value)
                setPage(1)
              }}
              className={filterClass}
            >
              <option value="">All types</option>
              {SUPPLIER_TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>

            <select
              value={status}
              onChange={(e) => {
                setStatus(e.target.value)
                setPage(1)
              }}
              className={filterClass}
            >
              <option value="">All statuses</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>

            <select
              value={region}
              onChange={(e) => {
                setRegion(e.target.value)
                setPage(1)
              }}
              className={filterClass}
            >
              <option value="">All regions</option>
              {Object.keys(LOCATION_DATA).map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </div>
        </div>

        {suppliersQuery.isLoading ? (
          <LoadingState label="Loading suppliers..." />
        ) : suppliersQuery.isError ? (
          <ErrorState error={suppliersQuery.error} onRetry={() => suppliersQuery.refetch()} />
        ) : suppliers.length === 0 ? (
          hasFilters ? (
            <EmptyState title="No suppliers match your filters." description="Try a different search or clear the filters." />
          ) : (
            <div className="p-8 text-center">
              <p className="text-sm text-gray-500">
                No suppliers have been registered yet.
              </p>

              {canCreate && (
                <button
                  type="button"
                  onClick={openCreate}
                  className="mt-3 text-sm font-medium text-black underline"
                >
                  Add your first supplier
                </button>
              )}
            </div>
          )
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                    Code
                  </th>

                  <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                    Supplier
                  </th>

                  <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                    Type
                  </th>

                  <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                    Phone
                  </th>

                  <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                    Location
                  </th>

                  <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                    Status
                  </th>

                  <th className="px-6 py-3 text-right text-xs font-semibold uppercase tracking-wider text-gray-500">
                    Actions
                  </th>
                </tr>
              </thead>

              <tbody className="divide-y divide-gray-100 bg-white">
                {suppliers.map((supplier) => (
                  <tr key={supplier.id} className="hover:bg-gray-50">
                    <td className="whitespace-nowrap px-6 py-4">
                      <span className="rounded-md bg-gray-100 px-2 py-1 text-xs font-semibold text-gray-700">
                        {supplier.supplier_code}
                      </span>
                    </td>

                    <td className="px-6 py-4">
                      <button
                        type="button"
                        onClick={() => setViewId(supplier.id)}
                        className="text-left font-medium text-gray-900 hover:underline"
                      >
                        {supplier.name}
                      </button>

                      {(supplier.contact_person || supplier.email) && (
                        <div className="mt-1 text-xs text-gray-500">
                          {[supplier.contact_person, supplier.email].filter(Boolean).join(' · ')}
                        </div>
                      )}
                    </td>

                    <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-600">
                      {typeLabel(supplier.supplier_type)}
                    </td>

                    <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-600">
                      {supplier.phone || '—'}
                    </td>

                    <td className="px-6 py-4 text-sm text-gray-600">
                      <div>{supplier.zone || '—'}</div>

                      <div className="text-xs text-gray-400">
                        {supplier.region}
                      </div>
                    </td>

                    <td className="whitespace-nowrap px-6 py-4">
                      <span
                        className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                          supplier.is_active
                            ? 'bg-green-100 text-green-700'
                            : 'bg-gray-100 text-gray-600'
                        }`}
                      >
                        {supplier.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </td>

                    <td className="whitespace-nowrap px-6 py-4 text-right text-sm">
                      <div className="flex justify-end gap-3">
                        <button
                          type="button"
                          onClick={() => setViewId(supplier.id)}
                          className="font-medium text-gray-700 hover:underline"
                        >
                          View
                        </button>

                        {canUpdate && (
                          <>
                            <button
                              type="button"
                              onClick={() => openEdit(supplier)}
                              disabled={busy}
                              className="font-medium text-gray-700 hover:underline disabled:opacity-50"
                            >
                              Edit
                            </button>

                            <button
                              type="button"
                              onClick={() => toggleActive(supplier)}
                              disabled={busy}
                              className="font-medium text-gray-700 hover:underline disabled:opacity-50"
                            >
                              {supplier.is_active ? 'Deactivate' : 'Activate'}
                            </button>
                          </>
                        )}

                        {canDelete && (
                          <button
                            type="button"
                            onClick={() => handleDelete(supplier)}
                            disabled={busy}
                            className="font-medium text-red-600 hover:underline disabled:opacity-50"
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

        <Pagination page={page} limit={PAGE_SIZE} total={total} onPage={setPage} />
      </div>

      <SupplierDetailModal
        id={viewId}
        onClose={() => setViewId(null)}
        onEdit={canUpdate ? openEdit : undefined}
      />

      {dialog}
    </div>
  )
}

function SupplierDetailModal({
  id,
  onClose,
  onEdit,
}: {
  id: string | null
  onClose: () => void
  onEdit?: (supplier: Supplier) => void
}) {
  const query = useSupplier(id)
  const supplier = query.data

  return (
    <Modal
      open={Boolean(id)}
      onClose={onClose}
      size="xl"
      title={supplier ? `${supplier.supplier_code} — ${supplier.name}` : 'Supplier details'}
      footer={
        supplier && onEdit ? (
          <button
            type="button"
            onClick={() => onEdit(supplier)}
            className="rounded-lg bg-black px-4 py-2 text-sm font-medium text-white hover:bg-gray-800"
          >
            Edit Supplier
          </button>
        ) : undefined
      }
    >
      {query.isLoading ? (
        <LoadingState label="Loading supplier..." />
      ) : query.isError ? (
        <ErrorState error={query.error} onRetry={() => query.refetch()} />
      ) : supplier ? (
        <div className="space-y-6">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
            <SummaryCard label="Member farmers" value={supplier.farmers.length} />
            <SummaryCard label="Collections" value={supplier.totals.collections} />
            <SummaryCard label="Collected" value={formatKg(supplier.totals.collected_kg)} />
            <SummaryCard label="Lots" value={supplier.lots.length} />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Field label="Type" value={typeLabel(supplier.supplier_type)} />
            <Field label="Status" value={supplier.is_active ? 'Active' : 'Inactive'} />
            <Field label="Contact person" value={supplier.contact_person} />
            <Field label="Phone" value={supplier.phone} />
            <Field label="Email" value={supplier.email} />
            <Field label="Region" value={supplier.region} />
            <Field label="Zone" value={supplier.zone} />
            <Field label="Woreda / Kebele" value={[supplier.woreda, supplier.kebele].filter(Boolean).join(', ')} />
            <Field label="Address" value={supplier.address} />
            <Field label="Registered" value={formatDate(supplier.created_at)} />
            <Field label="Notes" value={supplier.notes} />
          </div>

          <div>
            <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-gray-700">Member Farmers</h3>
            {supplier.farmers.length === 0 ? (
              <p className="text-sm text-gray-500">No farmers are linked to this supplier.</p>
            ) : (
              <div className="overflow-x-auto rounded-lg border border-gray-200">
                <table className="min-w-full divide-y divide-gray-200 text-sm">
                  <thead className="bg-gray-50 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                    <tr>
                      <th className="px-4 py-2">Code</th>
                      <th className="px-4 py-2">Name</th>
                      <th className="px-4 py-2">Phone</th>
                      <th className="px-4 py-2">Woreda / Kebele</th>
                      <th className="px-4 py-2">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {supplier.farmers.map((f) => (
                      <tr key={f.id}>
                        <td className="px-4 py-2 font-medium text-gray-900">{f.farmer_code}</td>
                        <td className="px-4 py-2">{f.name}</td>
                        <td className="px-4 py-2 text-gray-600">{f.phone || '—'}</td>
                        <td className="px-4 py-2 text-gray-600">{[f.woreda, f.kebele].filter(Boolean).join(', ') || '—'}</td>
                        <td className="px-4 py-2">{f.is_active ? 'Active' : 'Inactive'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div>
            <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-gray-700">Collections Supplied</h3>
            {supplier.collections.length === 0 ? (
              <p className="text-sm text-gray-500">No collections recorded from this supplier yet.</p>
            ) : (
              <div className="overflow-x-auto rounded-lg border border-gray-200">
                <table className="min-w-full divide-y divide-gray-200 text-sm">
                  <thead className="bg-gray-50 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                    <tr>
                      <th className="px-4 py-2">Code</th>
                      <th className="px-4 py-2">Date</th>
                      <th className="px-4 py-2">Origin</th>
                      <th className="px-4 py-2 text-right">Quantity</th>
                      <th className="px-4 py-2">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {supplier.collections.map((c) => (
                      <tr key={c.id}>
                        <td className="px-4 py-2 font-medium text-gray-900">{c.collection_code}</td>
                        <td className="px-4 py-2 text-gray-600">{formatDate(c.collection_date)}</td>
                        <td className="px-4 py-2 text-gray-600">{c.origin}</td>
                        <td className="px-4 py-2 text-right">{formatKg(c.quantity_kg)}</td>
                        <td className="px-4 py-2">
                          <StatusBadge status={c.status} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div>
            <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-gray-700">Lots</h3>
            {supplier.lots.length === 0 ? (
              <p className="text-sm text-gray-500">No lots have been created from this supplier's coffee yet.</p>
            ) : (
              <div className="overflow-x-auto rounded-lg border border-gray-200">
                <table className="min-w-full divide-y divide-gray-200 text-sm">
                  <thead className="bg-gray-50 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                    <tr>
                      <th className="px-4 py-2">Lot</th>
                      <th className="px-4 py-2">Origin</th>
                      <th className="px-4 py-2">Grade</th>
                      <th className="px-4 py-2 text-right">Quantity</th>
                      <th className="px-4 py-2">Status</th>
                      <th className="px-4 py-2">Created</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {supplier.lots.map((l) => (
                      <tr key={l.id}>
                        <td className="px-4 py-2 font-medium text-gray-900">{l.lot_code}</td>
                        <td className="px-4 py-2 text-gray-600">{l.origin}</td>
                        <td className="px-4 py-2 text-gray-600">{l.grade || '—'}</td>
                        <td className="px-4 py-2 text-right">{formatKg(l.quantity_kg)}</td>
                        <td className="px-4 py-2">
                          <StatusBadge status={l.status} />
                        </td>
                        <td className="px-4 py-2 text-gray-600">{formatDate(l.created_at)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      ) : null}
    </Modal>
  )
}
