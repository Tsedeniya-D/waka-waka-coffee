import { useState } from 'react'
import { useAuth } from '../../contexts/AuthContext'
import { useDebounce } from '../../hooks'
import { downloadCsv } from '../../lib/api'
import { useFarmer, useFarmerActions, useFarmers, useSuppliers } from '../../queries/admin'
import type { Farmer } from '../../types'
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
  useConfirm,
  useFlash,
} from '../../components/admin/ui'

type FormData = {
  name: string
  phone: string
  email: string
  gender: string
  national_id: string
  region: string
  zone: string
  woreda: string
  kebele: string
  address: string
  supplier_id: string
  notes: string
}

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
  'Sidama Region': ['Sidama'],
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
  phone: '',
  email: '',
  gender: '',
  national_id: '',
  region: '',
  zone: '',
  woreda: '',
  kebele: '',
  address: '',
  supplier_id: '',
  notes: '',
}

const PAGE_SIZE = 50

function toForm(farmer: Farmer): FormData {
  return {
    name: farmer.name ?? '',
    phone: farmer.phone ?? '',
    email: farmer.email ?? '',
    gender: farmer.gender ?? '',
    national_id: farmer.national_id ?? '',
    region: farmer.region ?? '',
    zone: farmer.zone ?? '',
    woreda: farmer.woreda ?? '',
    kebele: farmer.kebele ?? '',
    address: farmer.address ?? '',
    supplier_id: farmer.supplier_id ?? '',
    notes: farmer.notes ?? '',
  }
}

export default function AdminFarmers() {
  const { can } = useAuth()
  const canCreate = can('farmers', 'create')
  const canUpdate = can('farmers', 'update')
  const canDelete = can('farmers', 'delete')

  const flash = useFlash()
  const { confirm, dialog } = useConfirm()
  const actions = useFarmerActions()

  const [form, setForm] = useState<FormData>(initialForm)
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<Farmer | null>(null)
  const [formError, setFormError] = useState('')
  const [viewId, setViewId] = useState<string | null>(null)

  // Filters (server side)
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('')
  const [region, setRegion] = useState('')
  const [supplierFilter, setSupplierFilter] = useState('')
  const [page, setPage] = useState(1)
  const debouncedSearch = useDebounce(search.trim(), { delay: 400 })

  const farmersQuery = useFarmers({
    page,
    limit: PAGE_SIZE,
    search: debouncedSearch || undefined,
    status: status || undefined,
    region: region || undefined,
    supplier_id: supplierFilter || undefined,
    sort: '-created_at',
  })
  const farmers = farmersQuery.data?.data ?? []
  const total = farmersQuery.data?.meta.total ?? 0

  const suppliersQuery = useSuppliers({ status: 'active', limit: 500, sort: 'name' })
  const suppliers = suppliersQuery.data?.data ?? []

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

  function openEdit(farmer: Farmer) {
    setEditing(farmer)
    setForm(toForm(farmer))
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

    if (
      form.name.trim().length < 2 ||
      !form.region ||
      !form.zone ||
      !form.woreda.trim() ||
      !form.kebele.trim()
    ) {
      setFormError(
        'Please fill in all required fields: name (at least 2 characters), region, zone, woreda and kebele.'
      )
      return
    }

    if (form.email.trim() && !/^\S+@\S+\.\S+$/.test(form.email.trim())) {
      setFormError('Enter a valid email address.')
      return
    }

    const body: Record<string, unknown> = {
      name: form.name.trim(),
      phone: form.phone.trim() || null,
      email: form.email.trim() || null,
      gender: form.gender || null,
      national_id: form.national_id.trim() || null,
      region: form.region,
      zone: form.zone,
      woreda: form.woreda.trim(),
      kebele: form.kebele.trim(),
      address: form.address.trim() || null,
      supplier_id: form.supplier_id || null,
      notes: form.notes.trim() || null,
    }

    try {
      if (editing) {
        const updated = (await actions.update.mutateAsync({ id: editing.id, body })) as Farmer
        flash.success(`Farmer ${updated.farmer_code} updated.`)
      } else {
        const created = (await actions.create.mutateAsync(body)) as Farmer
        flash.success(`Farmer added successfully with code ${created.farmer_code}.`)
      }
      closeForm()
    } catch (err) {
      flash.error(err)
    }
  }

  async function toggleActive(farmer: Farmer) {
    const ok = await confirm({
      title: farmer.is_active ? 'Deactivate farmer?' : 'Activate farmer?',
      message: farmer.is_active
        ? `${farmer.name} will no longer be offered when recording new collections or farms.`
        : `${farmer.name} will be available again for new collections and farms.`,
      confirmLabel: farmer.is_active ? 'Deactivate' : 'Activate',
    })
    if (!ok) return
    try {
      await actions.update.mutateAsync({ id: farmer.id, body: { is_active: !farmer.is_active } })
      flash.success(`Farmer ${farmer.is_active ? 'deactivated' : 'activated'}.`)
    } catch (err) {
      flash.error(err)
    }
  }

  async function handleDelete(farmer: Farmer) {
    const ok = await confirm({
      title: 'Delete farmer?',
      message: `This permanently deletes ${farmer.farmer_code} — ${farmer.name}. Farmers referenced by farms or collections cannot be deleted; deactivate them instead.`,
      confirmLabel: 'Delete',
      danger: true,
    })
    if (!ok) return
    try {
      await actions.remove.mutateAsync(farmer.id)
      flash.success('Farmer deleted.')
      if (viewId === farmer.id) setViewId(null)
      if (editing?.id === farmer.id) closeForm()
    } catch (err) {
      flash.error(err)
    }
  }

  function downloadCSV() {
    if (farmers.length === 0) {
      flash.error(new Error('There are no farmers to download.'))
      return
    }

    const headers = [
      'Farmer Code',
      'Farmer Name',
      'Phone',
      'Email',
      'Gender',
      'National ID',
      'Cooperative / Union',
      'Region',
      'Zone',
      'Woreda',
      'Kebele',
      'Additional Address',
      'Status',
      'Created At',
    ]

    const rows = farmers.map((farmer) => [
      farmer.farmer_code,
      farmer.name,
      farmer.phone,
      farmer.email,
      farmer.gender,
      farmer.national_id,
      farmer.supplier?.name,
      farmer.region,
      farmer.zone,
      farmer.woreda,
      farmer.kebele,
      farmer.address,
      farmer.is_active ? 'Active' : 'Inactive',
      farmer.created_at,
    ])

    downloadCsv(`waka-coffee-farmers-${new Date().toISOString().slice(0, 10)}.csv`, headers, rows)
  }

  const inputClass =
    'w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm outline-none focus:border-black'
  const selectClass =
    'w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-black'
  const filterClass =
    'rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm outline-none focus:border-black'
  const hasFilters = Boolean(search || status || region || supplierFilter)

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            Farmer Management
          </h1>

          <p className="mt-1 text-sm text-gray-500">
            Register and manage coffee farmers and their sourcing locations.
          </p>
        </div>

        <div className="flex gap-3">
          <button
            type="button"
            onClick={downloadCSV}
            disabled={farmers.length === 0}
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
              {showForm ? 'Cancel' : '+ Add Farmer'}
            </button>
          )}
        </div>
      </div>

      {/* Messages */}
      {flash.banner}

      {/* Add / Edit Farmer Form */}
      {showForm && (
        <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
          <div className="mb-6">
            <h2 className="text-lg font-semibold text-gray-900">
              {editing ? `Edit Farmer ${editing.farmer_code}` : 'Add New Farmer'}
            </h2>

            <p className="mt-1 text-sm text-gray-500">
              {editing
                ? 'Update the farmer details below.'
                : 'Farmer code will be generated automatically.'}
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
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-gray-700">
                    Farmer Name *
                  </label>

                  <input
                    name="name"
                    value={form.name}
                    onChange={handleChange}
                    placeholder="Enter farmer name"
                    className={inputClass}
                  />
                </div>

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

                <div>
                  <label className="mb-1.5 block text-sm font-medium text-gray-700">
                    Gender
                  </label>

                  <select
                    name="gender"
                    value={form.gender}
                    onChange={handleChange}
                    className={selectClass}
                  >
                    <option value="">Not specified</option>
                    <option value="male">Male</option>
                    <option value="female">Female</option>
                    <option value="other">Other</option>
                  </select>
                </div>

                <div>
                  <label className="mb-1.5 block text-sm font-medium text-gray-700">
                    National ID
                  </label>

                  <input
                    name="national_id"
                    value={form.national_id}
                    onChange={handleChange}
                    placeholder="Optional national ID number"
                    className={inputClass}
                  />
                </div>

                <div>
                  <label className="mb-1.5 block text-sm font-medium text-gray-700">
                    Cooperative / Union Membership
                  </label>

                  <select
                    name="supplier_id"
                    value={form.supplier_id}
                    onChange={handleChange}
                    className={selectClass}
                  >
                    <option value="">Independent (no membership)</option>

                    {editing?.supplier &&
                      !suppliers.some((s) => s.id === editing.supplier?.id) && (
                        <option value={editing.supplier.id}>
                          {editing.supplier.supplier_code} - {editing.supplier.name} (inactive)
                        </option>
                      )}

                    {suppliers.map((supplier) => (
                      <option key={supplier.id} value={supplier.id}>
                        {supplier.supplier_code} - {supplier.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            {/* Location */}
            <div>
              <h3 className="mb-4 text-sm font-semibold uppercase tracking-wide text-gray-700">
                Farm Location
              </h3>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
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

            {/* Submit */}
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
                {saving ? 'Saving...' : editing ? 'Update Farmer' : 'Save Farmer'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Farmers Table */}
      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        <div className="flex flex-col gap-4 border-b border-gray-200 px-6 py-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="font-semibold text-gray-900">
              Farmers
            </h2>

            <p className="text-sm text-gray-500">
              {total} farmer
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
              placeholder="Search name, code, phone, woreda…"
              className={`${filterClass} w-64`}
            />

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

            <select
              value={supplierFilter}
              onChange={(e) => {
                setSupplierFilter(e.target.value)
                setPage(1)
              }}
              className={filterClass}
            >
              <option value="">All cooperatives / unions</option>
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        {farmersQuery.isLoading ? (
          <LoadingState label="Loading farmers..." />
        ) : farmersQuery.isError ? (
          <ErrorState error={farmersQuery.error} onRetry={() => farmersQuery.refetch()} />
        ) : farmers.length === 0 ? (
          hasFilters ? (
            <EmptyState title="No farmers match your filters." description="Try a different search or clear the filters." />
          ) : (
            <div className="p-8 text-center">
              <p className="text-sm text-gray-500">
                No farmers have been registered yet.
              </p>

              {canCreate && (
                <button
                  type="button"
                  onClick={openCreate}
                  className="mt-3 text-sm font-medium text-black underline"
                >
                  Add your first farmer
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
                    Farmer
                  </th>

                  <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                    Phone
                  </th>

                  <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                    Location
                  </th>

                  <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                    Cooperative / Union
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
                {farmers.map((farmer) => (
                  <tr
                    key={farmer.id}
                    className="hover:bg-gray-50"
                  >
                    <td className="whitespace-nowrap px-6 py-4">
                      <span className="rounded-md bg-gray-100 px-2 py-1 text-xs font-semibold text-gray-700">
                        {farmer.farmer_code}
                      </span>
                    </td>

                    <td className="px-6 py-4">
                      <button
                        type="button"
                        onClick={() => setViewId(farmer.id)}
                        className="text-left font-medium text-gray-900 hover:underline"
                      >
                        {farmer.name}
                      </button>

                      {farmer.email && (
                        <div className="mt-1 text-xs text-gray-500">
                          {farmer.email}
                        </div>
                      )}
                    </td>

                    <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-600">
                      {farmer.phone || '—'}
                    </td>

                    <td className="px-6 py-4 text-sm text-gray-600">
                      <div>{farmer.zone || '—'}</div>

                      <div className="text-xs text-gray-400">
                        {farmer.region}
                      </div>
                    </td>

                    <td className="px-6 py-4 text-sm text-gray-600">
                      {farmer.supplier?.name || '—'}
                    </td>

                    <td className="whitespace-nowrap px-6 py-4">
                      <span
                        className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                          farmer.is_active
                            ? 'bg-green-100 text-green-700'
                            : 'bg-gray-100 text-gray-600'
                        }`}
                      >
                        {farmer.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </td>

                    <td className="whitespace-nowrap px-6 py-4 text-right text-sm">
                      <div className="flex justify-end gap-3">
                        <button
                          type="button"
                          onClick={() => setViewId(farmer.id)}
                          className="font-medium text-gray-700 hover:underline"
                        >
                          View
                        </button>

                        {canUpdate && (
                          <>
                            <button
                              type="button"
                              onClick={() => openEdit(farmer)}
                              disabled={busy}
                              className="font-medium text-gray-700 hover:underline disabled:opacity-50"
                            >
                              Edit
                            </button>

                            <button
                              type="button"
                              onClick={() => toggleActive(farmer)}
                              disabled={busy}
                              className="font-medium text-gray-700 hover:underline disabled:opacity-50"
                            >
                              {farmer.is_active ? 'Deactivate' : 'Activate'}
                            </button>
                          </>
                        )}

                        {canDelete && (
                          <button
                            type="button"
                            onClick={() => handleDelete(farmer)}
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

      <FarmerDetailModal
        id={viewId}
        onClose={() => setViewId(null)}
        onEdit={canUpdate ? openEdit : undefined}
      />

      {dialog}
    </div>
  )
}

function FarmerDetailModal({
  id,
  onClose,
  onEdit,
}: {
  id: string | null
  onClose: () => void
  onEdit?: (farmer: Farmer) => void
}) {
  const query = useFarmer(id)
  const farmer = query.data

  return (
    <Modal
      open={Boolean(id)}
      onClose={onClose}
      size="xl"
      title={farmer ? `${farmer.farmer_code} — ${farmer.name}` : 'Farmer details'}
      footer={
        farmer && onEdit ? (
          <button
            type="button"
            onClick={() => onEdit(farmer)}
            className="rounded-lg bg-black px-4 py-2 text-sm font-medium text-white hover:bg-gray-800"
          >
            Edit Farmer
          </button>
        ) : undefined
      }
    >
      {query.isLoading ? (
        <LoadingState label="Loading farmer..." />
      ) : query.isError ? (
        <ErrorState error={query.error} onRetry={() => query.refetch()} />
      ) : farmer ? (
        <div className="space-y-6">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <SummaryCard label="Farms" value={farmer.farms.length} />
            <SummaryCard label="Collections" value={farmer.totals.collections} />
            <SummaryCard label="Total collected" value={formatKg(farmer.totals.collected_kg)} />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Field label="Status" value={farmer.is_active ? 'Active' : 'Inactive'} />
            <Field label="Phone" value={farmer.phone} />
            <Field label="Email" value={farmer.email} />
            <Field label="Gender" value={farmer.gender ? farmer.gender.charAt(0).toUpperCase() + farmer.gender.slice(1) : null} />
            <Field label="National ID" value={farmer.national_id} />
            <Field
              label="Cooperative / Union"
              value={farmer.supplier ? `${farmer.supplier.supplier_code} - ${farmer.supplier.name}` : 'Independent'}
            />
            <Field label="Region" value={farmer.region} />
            <Field label="Zone" value={farmer.zone} />
            <Field label="Woreda / Kebele" value={[farmer.woreda, farmer.kebele].filter(Boolean).join(', ')} />
            <Field label="Address" value={farmer.address} />
            <Field label="Registered" value={formatDate(farmer.created_at)} />
            <Field label="Notes" value={farmer.notes} />
          </div>

          <div>
            <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-gray-700">Farms</h3>
            {farmer.farms.length === 0 ? (
              <p className="text-sm text-gray-500">No farms registered for this farmer.</p>
            ) : (
              <div className="overflow-x-auto rounded-lg border border-gray-200">
                <table className="min-w-full divide-y divide-gray-200 text-sm">
                  <thead className="bg-gray-50 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                    <tr>
                      <th className="px-4 py-2">Code</th>
                      <th className="px-4 py-2">Farm</th>
                      <th className="px-4 py-2">Location</th>
                      <th className="px-4 py-2">Area</th>
                      <th className="px-4 py-2">Variety</th>
                      <th className="px-4 py-2">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {farmer.farms.map((farm) => (
                      <tr key={farm.id}>
                        <td className="px-4 py-2 font-medium text-gray-900">{farm.farm_code}</td>
                        <td className="px-4 py-2">{farm.farm_name}</td>
                        <td className="px-4 py-2 text-gray-600">
                          {[farm.woreda, farm.kebele].filter(Boolean).join(', ') || '—'}
                        </td>
                        <td className="px-4 py-2 text-gray-600">{farm.area_hectares ? `${farm.area_hectares} ha` : '—'}</td>
                        <td className="px-4 py-2 text-gray-600">{farm.coffee_variety || '—'}</td>
                        <td className="px-4 py-2">{farm.is_active ? 'Active' : 'Inactive'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div>
            <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-gray-700">Collection History</h3>
            {farmer.collections.length === 0 ? (
              <p className="text-sm text-gray-500">No collections recorded for this farmer yet.</p>
            ) : (
              <div className="overflow-x-auto rounded-lg border border-gray-200">
                <table className="min-w-full divide-y divide-gray-200 text-sm">
                  <thead className="bg-gray-50 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                    <tr>
                      <th className="px-4 py-2">Code</th>
                      <th className="px-4 py-2">Date</th>
                      <th className="px-4 py-2">Supplier</th>
                      <th className="px-4 py-2">Origin</th>
                      <th className="px-4 py-2 text-right">Quantity</th>
                      <th className="px-4 py-2">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {farmer.collections.map((c) => (
                      <tr key={c.id}>
                        <td className="px-4 py-2 font-medium text-gray-900">{c.collection_code}</td>
                        <td className="px-4 py-2 text-gray-600">{formatDate(c.collection_date)}</td>
                        <td className="px-4 py-2 text-gray-600">{c.supplier?.name || '—'}</td>
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
        </div>
      ) : null}
    </Modal>
  )
}
