import { useState } from 'react'

import { useAuth } from '../../contexts/AuthContext'
import { useDebounce } from '../../hooks'
import { downloadCsv, errorMessage } from '../../lib/api'
import { useDirectory, useWarehouse, useWarehouseActions, useWarehouses } from '../../queries/admin'
import type { UserRole, Warehouse } from '../../types'
import {
  EmptyState,
  ErrorState,
  Field,
  LoadingState,
  Modal,
  StatusBadge,
  formatDate,
  formatDateTime,
  formatKg,
  prettyStatus,
  useConfirm,
  useFlash,
} from '../../components/admin/ui'

type FormData = {
  code: string
  name: string
  location: string
  capacity_kg: string
  manager_id: string

  contact_person: string
  phone: string
  email: string

  temperature_min_c: string
  temperature_max_c: string
  humidity_min_percent: string
  humidity_max_percent: string
  ventilation: string
  lighting: string

  pallet_required: boolean
  wall_clearance_m: string
  ceiling_clearance_m: string

  packaging_type: string

  quality_check_zone: string
  pass_zone: string
  fail_zone: string

  sampling_frequency: string
  moisture_limit_percent: string

  pest_control_method: string
  sanitation_schedule: string

  is_active: boolean
  notes: string
}

const initialForm: FormData = {
  code: '',
  name: '',
  location: '',
  capacity_kg: '',
  manager_id: '',

  contact_person: '',
  phone: '',
  email: '',

  temperature_min_c: '',
  temperature_max_c: '',
  humidity_min_percent: '',
  humidity_max_percent: '',
  ventilation: '',
  lighting: '',

  pallet_required: true,
  wall_clearance_m: '',
  ceiling_clearance_m: '',

  packaging_type: '',

  quality_check_zone: '',
  pass_zone: '',
  fail_zone: '',

  sampling_frequency: '',
  moisture_limit_percent: '',

  pest_control_method: '',
  sanitation_schedule: '',

  is_active: true,
  notes: '',
}

const MANAGER_ROLES: UserRole[] = ['warehouse_officer', 'admin', 'super_admin']

const PEST_CONTROL_METHODS = [
  'Mechanical / non-chemical traps',
  'Professional pest control',
  'Both mechanical traps and professional pest control',
]
const SANITATION_SCHEDULES = ['Daily', 'Weekly', 'Monthly', 'As needed']

const NUMERIC_FIELDS = [
  'capacity_kg',
  'temperature_min_c',
  'temperature_max_c',
  'humidity_min_percent',
  'humidity_max_percent',
  'wall_clearance_m',
  'ceiling_clearance_m',
  'moisture_limit_percent',
] as const

const TEXT_FIELDS = [
  'contact_person',
  'phone',
  'email',
  'notes',
  'ventilation',
  'lighting',
  'packaging_type',
  'quality_check_zone',
  'pass_zone',
  'fail_zone',
  'sampling_frequency',
  'pest_control_method',
  'sanitation_schedule',
] as const

const str = (v: number | string | null | undefined) => (v === null || v === undefined ? '' : String(v))

const inputClass = 'w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm outline-none focus:border-black'
const selectClass = 'w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-black'

export default function AdminWarehouses() {
  const { isAdmin, can } = useAuth()
  const canCreate = can('warehouses', 'create')
  const canUpdate = can('warehouses', 'update')
  const canDelete = isAdmin && can('warehouses', 'delete')

  const [form, setForm] = useState<FormData>(initialForm)
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<Warehouse | null>(null)
  const [viewingId, setViewingId] = useState<string | null>(null)
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [bulkDeleting, setBulkDeleting] = useState(false)

  const [statusFilter, setStatusFilter] = useState('')
  const [search, setSearch] = useState('')
  const debouncedSearch = useDebounce(search, { delay: 400 })
  const hasFilters = Boolean(statusFilter || debouncedSearch.trim())

  const flash = useFlash()
  const { confirm, dialog } = useConfirm()
  const actions = useWarehouseActions()

  const warehousesQuery = useWarehouses({
    limit: 200,
    status: statusFilter || undefined,
    search: debouncedSearch.trim() || undefined,
  })
  const warehouses = warehousesQuery.data?.data ?? []
  const total = warehousesQuery.data?.meta.total ?? warehouses.length

  const directory = useDirectory(MANAGER_ROLES)
  const managers = directory.data ?? []

  const saving = actions.create.isPending || actions.update.isPending
  const deleting = actions.remove.isPending || bulkDeleting
  const visibleSelected = selectedIds.filter((id) => warehouses.some((w) => w.id === id))

  function handleChange(e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) {
    const { name, value } = e.target
    setForm((prev) => ({ ...prev, [name]: value }))
  }

  function resetForm() {
    setForm(initialForm)
    setEditing(null)
  }

  function startEdit(warehouse: Warehouse) {
    setEditing(warehouse)

    setForm({
      code: warehouse.code || '',
      name: warehouse.name || '',
      location: warehouse.location || '',
      capacity_kg: str(warehouse.capacity_kg),
      manager_id: warehouse.manager_id || '',

      contact_person: warehouse.contact_person || '',
      phone: warehouse.phone || '',
      email: warehouse.email || '',

      temperature_min_c: str(warehouse.temperature_min_c),
      temperature_max_c: str(warehouse.temperature_max_c),
      humidity_min_percent: str(warehouse.humidity_min_percent),
      humidity_max_percent: str(warehouse.humidity_max_percent),
      ventilation: warehouse.ventilation || '',
      lighting: warehouse.lighting || '',

      pallet_required: warehouse.pallet_required ?? true,
      wall_clearance_m: str(warehouse.wall_clearance_m),
      ceiling_clearance_m: str(warehouse.ceiling_clearance_m),

      packaging_type: warehouse.packaging_type || '',

      quality_check_zone: warehouse.quality_check_zone || '',
      pass_zone: warehouse.pass_zone || '',
      fail_zone: warehouse.fail_zone || '',

      sampling_frequency: warehouse.sampling_frequency || '',
      moisture_limit_percent: str(warehouse.moisture_limit_percent),

      pest_control_method: warehouse.pest_control_method || '',
      sanitation_schedule: warehouse.sanitation_schedule || '',

      is_active: warehouse.is_active,
      notes: warehouse.notes || '',
    })

    setShowForm(true)
    flash.clear()

    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  function validate(): string | null {
    if (!form.name.trim() || !form.location.trim()) {
      return 'Please fill in all required fields: warehouse name and location.'
    }
    for (const key of NUMERIC_FIELDS) {
      if (form[key] !== '' && !Number.isFinite(Number(form[key]))) return `${prettyStatus(key)} must be a number.`
    }
    const n = (v: string) => (v === '' ? null : Number(v))
    const capacity = n(form.capacity_kg)
    if (capacity !== null && capacity < 0) return 'Capacity cannot be negative.'
    if (editing && capacity !== null && editing.stock_kg !== undefined && capacity < Number(editing.stock_kg)) {
      return `This warehouse currently holds ${formatKg(editing.stock_kg)}; capacity cannot be lower.`
    }
    const tMin = n(form.temperature_min_c)
    const tMax = n(form.temperature_max_c)
    if ((tMin !== null && (tMin < -30 || tMin > 60)) || (tMax !== null && (tMax < -30 || tMax > 60))) {
      return 'Temperatures must be between -30 and 60 °C.'
    }
    if (tMin !== null && tMax !== null && tMin > tMax) return 'Minimum temperature must not exceed maximum temperature.'
    const hMin = n(form.humidity_min_percent)
    const hMax = n(form.humidity_max_percent)
    for (const h of [hMin, hMax, n(form.moisture_limit_percent)]) {
      if (h !== null && (h < 0 || h > 100)) return 'Humidity and moisture values must be between 0 and 100%.'
    }
    if (hMin !== null && hMax !== null && hMin > hMax) return 'Minimum humidity must not exceed maximum humidity.'
    for (const c of [n(form.wall_clearance_m), n(form.ceiling_clearance_m)]) {
      if (c !== null && (c < 0 || c > 50)) return 'Clearances must be between 0 and 50 m.'
    }
    if (form.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) return 'Please enter a valid email address.'
    return null
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    flash.clear()

    const problem = validate()
    if (problem) {
      flash.error(new Error(problem))
      return
    }

    const payload: Record<string, unknown> = {
      name: form.name.trim(),
      location: form.location.trim(),
      manager_id: form.manager_id || null,
      pallet_required: form.pallet_required,
      is_active: form.is_active,
    }
    // Code is generated by the database (WH-NNN) when left blank.
    if (form.code.trim()) payload.code = form.code.trim()
    for (const key of NUMERIC_FIELDS) payload[key] = form[key] === '' ? null : Number(form[key])
    for (const key of TEXT_FIELDS) payload[key] = form[key].trim() || null

    try {
      if (editing) {
        const updated = (await actions.update.mutateAsync({ id: editing.id, body: payload })) as Warehouse
        flash.success(`Warehouse ${updated.code ?? editing.code} updated successfully.`)
      } else {
        const created = (await actions.create.mutateAsync(payload)) as Warehouse
        flash.success(`Warehouse added successfully. Code: ${created.code}`)
      }
      resetForm()
      setShowForm(false)
    } catch (err) {
      flash.error(err)
    }
  }

  async function deleteWarehouse(warehouse: Warehouse) {
    const ok = await confirm({
      title: `Delete warehouse ${warehouse.code}?`,
      message: 'Are you sure you want to delete this warehouse? Warehouses that still hold stock cannot be deleted.',
      danger: true,
      confirmLabel: 'Delete',
    })
    if (!ok) return

    try {
      await actions.remove.mutateAsync(warehouse.id)
      setSelectedIds((prev) => prev.filter((item) => item !== warehouse.id))
      if (editing?.id === warehouse.id) {
        resetForm()
        setShowForm(false)
      }
      flash.success(`Warehouse ${warehouse.code} deleted successfully.`)
    } catch (err) {
      flash.error(err)
    }
  }

  function toggleSelect(id: string) {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]))
  }

  function toggleSelectAll() {
    if (warehouses.length > 0 && visibleSelected.length === warehouses.length) {
      setSelectedIds([])
    } else {
      setSelectedIds(warehouses.map((item) => item.id))
    }
  }

  async function deleteSelected() {
    const ids = [...visibleSelected]
    if (ids.length === 0) return

    const ok = await confirm({
      title: `Delete ${ids.length} selected warehouse(s)?`,
      message: 'Warehouses that still hold stock will be kept.',
      danger: true,
      confirmLabel: 'Delete',
    })
    if (!ok) return

    setBulkDeleting(true)
    const results = await Promise.allSettled(ids.map((id) => actions.remove.mutateAsync(id)))
    setBulkDeleting(false)

    const failed = results
      .map((r, i) => ({ r, w: warehouses.find((x) => x.id === ids[i]) }))
      .filter((x) => x.r.status === 'rejected')
    const deletedCount = ids.length - failed.length
    setSelectedIds(failed.map((f) => f.w?.id ?? '').filter(Boolean))

    if (failed.length === 0) {
      flash.success(`${deletedCount} warehouse(s) deleted successfully.`)
    } else {
      const first = failed[0].r as PromiseRejectedResult
      flash.error(
        new Error(
          `${deletedCount} deleted; could not delete ${failed.map((f) => f.w?.code ?? '?').join(', ')}: ${errorMessage(first.reason)}`
        )
      )
    }
  }

  function downloadCSV() {
    if (warehouses.length === 0) {
      flash.error(new Error('There are no warehouses to download.'))
      return
    }

    downloadCsv(
      `waka-coffee-warehouses-${new Date().toISOString().slice(0, 10)}.csv`,
      [
        'Warehouse Code',
        'Warehouse Name',
        'Location',
        'Capacity (kg)',
        'Stock (kg)',
        'Utilisation (%)',
        'Responsible Employee',
        'Contact Person',
        'Phone',
        'Email',
        'Temperature Min (°C)',
        'Temperature Max (°C)',
        'Humidity Min (%)',
        'Humidity Max (%)',
        'Ventilation',
        'Lighting',
        'Pallet Required',
        'Wall Clearance (m)',
        'Ceiling Clearance (m)',
        'Packaging Type',
        'Quality Check Zone',
        'Pass Zone',
        'Fail Zone',
        'Sampling Frequency',
        'Moisture Limit (%)',
        'Pest Control',
        'Sanitation Schedule',
        'Status',
        'Notes',
        'Created At',
      ],
      warehouses.map((w) => [
        w.code,
        w.name,
        w.location,
        w.capacity_kg,
        w.stock_kg,
        w.utilisation_pct,
        w.manager?.full_name ?? '',
        w.contact_person,
        w.phone,
        w.email,
        w.temperature_min_c,
        w.temperature_max_c,
        w.humidity_min_percent,
        w.humidity_max_percent,
        w.ventilation,
        w.lighting,
        w.pallet_required ? 'Yes' : 'No',
        w.wall_clearance_m,
        w.ceiling_clearance_m,
        w.packaging_type,
        w.quality_check_zone,
        w.pass_zone,
        w.fail_zone,
        w.sampling_frequency,
        w.moisture_limit_percent,
        w.pest_control_method,
        w.sanitation_schedule,
        w.is_active ? 'Active' : 'Inactive',
        w.notes,
        formatDate(w.created_at),
      ])
    )
  }

  return (
    <div className="space-y-6">
      {dialog}

      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Warehouse Management</h1>

          <p className="mt-1 text-sm text-gray-500">Manage coffee storage facilities, environmental conditions and quality-control zones.</p>
        </div>

        <div className="flex gap-3">
          <button
            type="button"
            onClick={downloadCSV}
            disabled={warehouses.length === 0}
            className="rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            ↓ Download CSV
          </button>

          {canCreate && (
            <button
              type="button"
              onClick={() => {
                if (showForm) resetForm()
                setShowForm((prev) => !prev)
                flash.clear()
              }}
              className="rounded-lg bg-black px-4 py-2.5 text-sm font-medium text-white hover:bg-gray-800"
            >
              {showForm ? 'Cancel' : '+ Add Warehouse'}
            </button>
          )}
        </div>
      </div>

      {/* Messages */}
      {flash.banner}

      {/* Warehouse Form */}
      {showForm && (
        <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
          <div className="mb-6">
            <h2 className="text-lg font-semibold text-gray-900">{editing ? 'Edit Warehouse' : 'Add New Warehouse'}</h2>

            <p className="mt-1 text-sm text-gray-500">Configure the warehouse and its coffee storage conditions.</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Basic Information */}
            <div>
              <h3 className="mb-4 text-sm font-semibold uppercase tracking-wide text-gray-700">Basic Information</h3>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-gray-700">Warehouse Code</label>

                  <input
                    name="code"
                    value={form.code}
                    onChange={handleChange}
                    maxLength={20}
                    placeholder={editing ? 'WH-001' : 'Leave blank to generate (WH-NNN)'}
                    className={inputClass}
                  />
                </div>

                <div>
                  <label className="mb-1.5 block text-sm font-medium text-gray-700">Warehouse Name *</label>

                  <input name="name" value={form.name} onChange={handleChange} maxLength={160} placeholder="Enter warehouse name" className={inputClass} required />
                </div>

                <div>
                  <label className="mb-1.5 block text-sm font-medium text-gray-700">Location *</label>

                  <input
                    name="location"
                    value={form.location}
                    onChange={handleChange}
                    maxLength={300}
                    placeholder="Enter warehouse location"
                    className={inputClass}
                    required
                  />
                </div>

                <div>
                  <label className="mb-1.5 block text-sm font-medium text-gray-700">Storage Capacity (kg)</label>

                  <input
                    type="number"
                    name="capacity_kg"
                    value={form.capacity_kg}
                    onChange={handleChange}
                    min={editing?.stock_kg ? String(editing.stock_kg) : '0'}
                    step="0.01"
                    placeholder="10000"
                    className={inputClass}
                  />
                  {editing && editing.stock_kg !== undefined && editing.stock_kg > 0 && (
                    <p className="mt-1 text-xs text-gray-500">Currently holds {formatKg(editing.stock_kg)} — capacity cannot be lower.</p>
                  )}
                </div>

                <div>
                  <label className="mb-1.5 block text-sm font-medium text-gray-700">Responsible Employee</label>

                  <select name="manager_id" value={form.manager_id} onChange={handleChange} className={selectClass}>
                    <option value="">{directory.isLoading ? 'Loading employees…' : 'Select responsible employee'}</option>
                    {editing?.manager && !managers.some((m) => m.id === editing.manager_id) && (
                      <option value={editing.manager.id}>{editing.manager.full_name ?? 'Current manager'}</option>
                    )}
                    {managers.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.full_name || m.email || m.id}
                        {m.role ? ` (${prettyStatus(m.role)})` : ''}
                      </option>
                    ))}
                  </select>
                  {directory.isError && <p className="mt-1 text-xs text-red-600">Could not load employees.</p>}
                </div>

                <div>
                  <label className="mb-1.5 block text-sm font-medium text-gray-700">Contact Person</label>

                  <input
                    name="contact_person"
                    value={form.contact_person}
                    onChange={handleChange}
                    maxLength={120}
                    placeholder="Enter contact person"
                    className={inputClass}
                  />
                </div>

                <div>
                  <label className="mb-1.5 block text-sm font-medium text-gray-700">Phone</label>

                  <input name="phone" value={form.phone} onChange={handleChange} placeholder="Enter phone number" type="tel" className={inputClass} />
                </div>

                <div>
                  <label className="mb-1.5 block text-sm font-medium text-gray-700">Email</label>

                  <input name="email" value={form.email} onChange={handleChange} placeholder="Optional email address" type="email" className={inputClass} />
                </div>

                <div>
                  <label className="mb-1.5 block text-sm font-medium text-gray-700">Status</label>

                  <select
                    name="is_active"
                    value={form.is_active ? 'active' : 'inactive'}
                    onChange={(e) => setForm((prev) => ({ ...prev, is_active: e.target.value === 'active' }))}
                    className={selectClass}
                  >
                    <option value="active">Active</option>

                    <option value="inactive">Inactive</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Environmental Conditions */}
            <div>
              <h3 className="mb-4 text-sm font-semibold uppercase tracking-wide text-gray-700">Environmental Conditions</h3>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-gray-700">Minimum Temperature (°C)</label>

                  <input type="number" step="0.1" min="-30" max="60" name="temperature_min_c" value={form.temperature_min_c} onChange={handleChange} placeholder="15" className={inputClass} />
                </div>

                <div>
                  <label className="mb-1.5 block text-sm font-medium text-gray-700">Maximum Temperature (°C)</label>

                  <input type="number" step="0.1" min="-30" max="60" name="temperature_max_c" value={form.temperature_max_c} onChange={handleChange} placeholder="25" className={inputClass} />
                </div>

                <div>
                  <label className="mb-1.5 block text-sm font-medium text-gray-700">Minimum Humidity (%)</label>

                  <input type="number" step="0.1" min="0" max="100" name="humidity_min_percent" value={form.humidity_min_percent} onChange={handleChange} placeholder="55" className={inputClass} />
                </div>

                <div>
                  <label className="mb-1.5 block text-sm font-medium text-gray-700">Maximum Humidity (%)</label>

                  <input type="number" step="0.1" min="0" max="100" name="humidity_max_percent" value={form.humidity_max_percent} onChange={handleChange} placeholder="65" className={inputClass} />
                </div>

                <div>
                  <label className="mb-1.5 block text-sm font-medium text-gray-700">Ventilation</label>

                  <input name="ventilation" value={form.ventilation} onChange={handleChange} maxLength={200} placeholder="Good ventilation" className={inputClass} />
                </div>

                <div>
                  <label className="mb-1.5 block text-sm font-medium text-gray-700">Lighting</label>

                  <input name="lighting" value={form.lighting} onChange={handleChange} maxLength={200} placeholder="Low / controlled light" className={inputClass} />
                </div>
              </div>
            </div>

            {/* Storage Layout */}
            <div>
              <h3 className="mb-4 text-sm font-semibold uppercase tracking-wide text-gray-700">Storage Layout & Safety</h3>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-gray-700">Wall Clearance (m)</label>

                  <input type="number" step="0.01" min="0" max="50" name="wall_clearance_m" value={form.wall_clearance_m} onChange={handleChange} placeholder="0.61" className={inputClass} />
                </div>

                <div>
                  <label className="mb-1.5 block text-sm font-medium text-gray-700">Ceiling Clearance (m)</label>

                  <input type="number" step="0.01" min="0" max="50" name="ceiling_clearance_m" value={form.ceiling_clearance_m} onChange={handleChange} placeholder="0.61" className={inputClass} />
                </div>

                <div>
                  <label className="mb-1.5 block text-sm font-medium text-gray-700">Packaging Type</label>

                  <input name="packaging_type" value={form.packaging_type} onChange={handleChange} maxLength={120} placeholder="Jute bag with hermetic liner" className={inputClass} />
                </div>

                <div className="flex items-center">
                  <label className="flex items-center gap-2 text-sm font-medium text-gray-700">
                    <input
                      type="checkbox"
                      name="pallet_required"
                      checked={form.pallet_required}
                      onChange={(e) => setForm((prev) => ({ ...prev, pallet_required: e.target.checked }))}
                      className="h-4 w-4"
                    />
                    Coffee bags must be stored on pallets
                  </label>
                </div>
              </div>
            </div>

            {/* Quality Control Zones */}
            <div>
              <h3 className="mb-4 text-sm font-semibold uppercase tracking-wide text-gray-700">Quality Control Zones</h3>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-gray-700">Quality Check Zone</label>

                  <input name="quality_check_zone" value={form.quality_check_zone} onChange={handleChange} maxLength={120} placeholder="QC Zone" className={inputClass} />
                </div>

                <div>
                  <label className="mb-1.5 block text-sm font-medium text-gray-700">Pass Zone</label>

                  <input name="pass_zone" value={form.pass_zone} onChange={handleChange} maxLength={120} placeholder="Pass Zone" className={inputClass} />
                </div>

                <div>
                  <label className="mb-1.5 block text-sm font-medium text-gray-700">Fail Zone</label>

                  <input name="fail_zone" value={form.fail_zone} onChange={handleChange} maxLength={120} placeholder="Fail Zone" className={inputClass} />
                </div>
              </div>
            </div>

            {/* Quality Monitoring */}
            <div>
              <h3 className="mb-4 text-sm font-semibold uppercase tracking-wide text-gray-700">Quality Monitoring</h3>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-gray-700">Sampling Frequency</label>

                  <input name="sampling_frequency" value={form.sampling_frequency} onChange={handleChange} maxLength={120} placeholder="Every few months" className={inputClass} />
                </div>

                <div>
                  <label className="mb-1.5 block text-sm font-medium text-gray-700">Maximum Moisture Limit (%)</label>

                  <input type="number" step="0.1" min="0" max="100" name="moisture_limit_percent" value={form.moisture_limit_percent} onChange={handleChange} placeholder="12.5" className={inputClass} />
                </div>
              </div>
            </div>

            {/* Pest & Sanitation */}
            <div>
              <h3 className="mb-4 text-sm font-semibold uppercase tracking-wide text-gray-700">Pest & Sanitation Control</h3>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-gray-700">Pest Control Method</label>

                  <select name="pest_control_method" value={form.pest_control_method} onChange={handleChange} className={inputClass}>
                    <option value="">Select pest control method</option>
                    {form.pest_control_method && !PEST_CONTROL_METHODS.includes(form.pest_control_method) && (
                      <option value={form.pest_control_method}>{form.pest_control_method}</option>
                    )}
                    {PEST_CONTROL_METHODS.map((m) => (
                      <option key={m} value={m}>
                        {m}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="mb-1.5 block text-sm font-medium text-gray-700">Sanitation Schedule</label>

                  <select name="sanitation_schedule" value={form.sanitation_schedule} onChange={handleChange} className={inputClass}>
                    <option value="">Select sanitation schedule</option>
                    {form.sanitation_schedule && !SANITATION_SCHEDULES.includes(form.sanitation_schedule) && (
                      <option value={form.sanitation_schedule}>{form.sanitation_schedule}</option>
                    )}
                    {SANITATION_SCHEDULES.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            {/* Notes */}
            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700">Additional Notes</label>

              <textarea
                name="notes"
                value={form.notes}
                onChange={handleChange}
                maxLength={2000}
                placeholder="Additional warehouse information"
                rows={3}
                className={inputClass}
              />
            </div>

            {/* Submit */}
            <div className="flex justify-end gap-3 border-t border-gray-100 pt-5">
              <button
                type="button"
                onClick={() => {
                  resetForm()
                  setShowForm(false)
                }}
                className="rounded-lg border border-gray-300 px-5 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>

              <button
                type="submit"
                disabled={saving}
                className="rounded-lg bg-black px-5 py-2.5 text-sm font-medium text-white hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {saving ? 'Saving...' : editing ? 'Update Warehouse' : 'Save Warehouse'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Warehouse Table */}
      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        <div className="flex flex-col gap-3 border-b border-gray-200 px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="font-semibold text-gray-900">Warehouses</h2>

            <p className="text-sm text-gray-500">
              {total} warehouse
              {total !== 1 ? 's' : ''} {hasFilters ? 'found' : 'registered'}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search name, code, location…"
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-black"
            />
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm outline-none focus:border-black"
            >
              <option value="">All statuses</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>

            {canDelete && warehouses.length > 0 && (
              <>
                <label className="flex items-center gap-2 text-sm text-gray-600">
                  <input type="checkbox" checked={visibleSelected.length === warehouses.length && warehouses.length > 0} onChange={toggleSelectAll} />
                  Select All
                </label>

                {visibleSelected.length > 0 && (
                  <button
                    type="button"
                    onClick={deleteSelected}
                    disabled={deleting}
                    className="rounded-lg bg-red-600 px-3 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
                  >
                    {bulkDeleting ? 'Deleting...' : `Delete Selected (${visibleSelected.length})`}
                  </button>
                )}
              </>
            )}
          </div>
        </div>

        {warehousesQuery.isLoading ? (
          <LoadingState label="Loading warehouses..." />
        ) : warehousesQuery.isError ? (
          <ErrorState error={warehousesQuery.error} onRetry={() => warehousesQuery.refetch()} />
        ) : warehouses.length === 0 ? (
          hasFilters ? (
            <EmptyState title="No warehouses match your filters." />
          ) : (
            <EmptyState
              title="No warehouses have been registered yet."
              action={
                canCreate ? (
                  <button type="button" onClick={() => setShowForm(true)} className="text-sm font-medium text-black underline">
                    Add your first warehouse
                  </button>
                ) : undefined
              }
            />
          )
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  {canDelete && <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Select</th>}

                  <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Code</th>

                  <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Warehouse</th>

                  <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Location</th>

                  <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Capacity</th>

                  <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Conditions</th>

                  <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Status</th>

                  <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Actions</th>
                </tr>
              </thead>

              <tbody className="divide-y divide-gray-100 bg-white">
                {warehouses.map((warehouse) => (
                  <tr key={warehouse.id} className="hover:bg-gray-50">
                    {canDelete && (
                      <td className="px-4 py-4">
                        <input type="checkbox" checked={selectedIds.includes(warehouse.id)} onChange={() => toggleSelect(warehouse.id)} />
                      </td>
                    )}

                    <td className="whitespace-nowrap px-6 py-4">
                      <span className="rounded-md bg-gray-100 px-2 py-1 text-xs font-semibold text-gray-700">{warehouse.code}</span>
                    </td>

                    <td className="px-6 py-4">
                      <div className="font-medium text-gray-900">{warehouse.name}</div>

                      {(warehouse.manager?.full_name || warehouse.contact_person) && (
                        <div className="mt-1 text-xs text-gray-500">{warehouse.manager?.full_name ?? warehouse.contact_person}</div>
                      )}
                    </td>

                    <td className="px-6 py-4 text-sm text-gray-600">{warehouse.location}</td>

                    <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-600">
                      <div>
                        {formatKg(warehouse.stock_kg ?? 0)} / {warehouse.capacity_kg !== null ? formatKg(warehouse.capacity_kg) : '—'}
                      </div>
                      {warehouse.utilisation_pct !== null && warehouse.utilisation_pct !== undefined && (
                        <div className="mt-1 flex items-center gap-2">
                          <div className="h-1.5 w-20 overflow-hidden rounded-full bg-gray-200">
                            <div
                              className={`h-full ${warehouse.utilisation_pct >= 90 ? 'bg-red-500' : warehouse.utilisation_pct >= 70 ? 'bg-yellow-500' : 'bg-green-500'}`}
                              style={{ width: `${Math.min(100, warehouse.utilisation_pct)}%` }}
                            />
                          </div>
                          <span className="text-xs text-gray-500">{warehouse.utilisation_pct}%</span>
                        </div>
                      )}
                    </td>

                    <td className="px-6 py-4 text-sm text-gray-600">
                      <div>
                        {warehouse.temperature_min_c !== null && warehouse.temperature_max_c !== null
                          ? `${warehouse.temperature_min_c}–${warehouse.temperature_max_c}°C`
                          : '—'}
                      </div>

                      <div className="text-xs text-gray-400">
                        {warehouse.humidity_min_percent !== null && warehouse.humidity_max_percent !== null
                          ? `${warehouse.humidity_min_percent}–${warehouse.humidity_max_percent}% RH`
                          : ''}
                      </div>
                    </td>

                    <td className="whitespace-nowrap px-6 py-4">
                      <span
                        className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                          warehouse.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'
                        }`}
                      >
                        {warehouse.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </td>

                    <td className="whitespace-nowrap px-6 py-4">
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => setViewingId(warehouse.id)}
                          className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
                        >
                          View
                        </button>

                        {canUpdate && (
                          <button
                            type="button"
                            onClick={() => startEdit(warehouse)}
                            className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
                          >
                            Edit
                          </button>
                        )}

                        {canDelete && (
                          <button
                            type="button"
                            onClick={() => deleteWarehouse(warehouse)}
                            disabled={deleting}
                            className="rounded-lg bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
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

      <WarehouseDetailModal id={viewingId} onClose={() => setViewingId(null)} />
    </div>
  )
}

function WarehouseDetailModal({ id, onClose }: { id: string | null; onClose: () => void }) {
  const query = useWarehouse(id)
  const w = query.data

  const range = (min: number | null, max: number | null, unit: string) =>
    min === null && max === null ? null : `${min ?? '—'} – ${max ?? '—'} ${unit}`

  return (
    <Modal open={Boolean(id)} title={w ? `${w.code} — ${w.name}` : 'Warehouse'} onClose={onClose} size="xl">
      {query.isLoading ? (
        <LoadingState label="Loading warehouse..." />
      ) : query.isError ? (
        <ErrorState error={query.error} onRetry={() => query.refetch()} />
      ) : !w ? null : (
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            <Field label="Status" value={w.is_active ? 'Active' : 'Inactive'} />
            <Field label="Location" value={w.location} />
            <Field label="Responsible employee" value={w.manager?.full_name} />
            <Field label="Contact" value={[w.contact_person, w.phone, w.email].filter(Boolean).join(' · ')} />
            <Field label="Current stock" value={formatKg(w.stock_kg ?? 0)} />
            <Field label="Capacity" value={w.capacity_kg !== null ? formatKg(w.capacity_kg) : null} />
            <Field label="Utilisation" value={w.utilisation_pct !== null && w.utilisation_pct !== undefined ? `${w.utilisation_pct}%` : null} />
            <Field label="Pallets required" value={w.pallet_required ? 'Yes' : 'No'} />
            <Field label="Temperature" value={range(w.temperature_min_c, w.temperature_max_c, '°C')} />
            <Field label="Humidity" value={range(w.humidity_min_percent, w.humidity_max_percent, '%')} />
            <Field label="Moisture limit" value={w.moisture_limit_percent !== null ? `${w.moisture_limit_percent}%` : null} />
            <Field label="Sanitation" value={w.sanitation_schedule} />
          </div>

          <section>
            <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-gray-700">Current Stock by Lot</h3>
            {w.stock.length === 0 ? (
              <p className="text-sm text-gray-500">This warehouse holds no stock.</p>
            ) : (
              <table className="min-w-full divide-y divide-gray-200 text-sm">
                <thead className="bg-gray-50 text-left text-xs uppercase text-gray-500">
                  <tr>
                    <th className="px-3 py-2">Lot</th>
                    <th className="px-3 py-2">Origin</th>
                    <th className="px-3 py-2">Grade</th>
                    <th className="px-3 py-2">Quantity</th>
                    <th className="px-3 py-2">Bags</th>
                    <th className="px-3 py-2">Received</th>
                    <th className="px-3 py-2">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {w.stock.map((s) => (
                    <tr key={s.id}>
                      <td className="px-3 py-2 font-medium">{s.lot?.lot_code ?? '-'}</td>
                      <td className="px-3 py-2">{s.lot?.origin ?? '-'}</td>
                      <td className="px-3 py-2">{s.lot?.grade ?? '-'}</td>
                      <td className="px-3 py-2">{formatKg(s.quantity_kg)}</td>
                      <td className="px-3 py-2">{s.bag_count ?? '-'}</td>
                      <td className="px-3 py-2">{formatDate(s.received_date)}</td>
                      <td className="px-3 py-2"><StatusBadge status={s.status} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>

          <section>
            <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-gray-700">Recent Movements</h3>
            {w.movements.length === 0 ? (
              <p className="text-sm text-gray-500">No stock movements recorded yet.</p>
            ) : (
              <table className="min-w-full divide-y divide-gray-200 text-sm">
                <thead className="bg-gray-50 text-left text-xs uppercase text-gray-500">
                  <tr>
                    <th className="px-3 py-2">When</th>
                    <th className="px-3 py-2">Type</th>
                    <th className="px-3 py-2">Lot</th>
                    <th className="px-3 py-2">Quantity</th>
                    <th className="px-3 py-2">Balance after</th>
                    <th className="px-3 py-2">By</th>
                    <th className="px-3 py-2">Notes</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {w.movements.map((m) => (
                    <tr key={m.id}>
                      <td className="whitespace-nowrap px-3 py-2">{formatDateTime(m.created_at)}</td>
                      <td className="px-3 py-2">{prettyStatus(m.transaction_type)}</td>
                      <td className="px-3 py-2">{m.lot?.lot_code ?? '-'}</td>
                      <td className="px-3 py-2">{formatKg(m.quantity_kg)}</td>
                      <td className="px-3 py-2">{m.balance_after !== null ? formatKg(m.balance_after) : '-'}</td>
                      <td className="px-3 py-2">{m.performer?.full_name ?? '-'}</td>
                      <td className="px-3 py-2 text-gray-500">{m.notes ?? ''}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>
        </div>
      )}
    </Modal>
  )
}
