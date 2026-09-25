import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useAuth } from '../../contexts/AuthContext'
import { useDebounce } from '../../hooks'
import { downloadCsv } from '../../lib/api'
import { locationsApi } from '../../api'
import {
  qk,
  useFarmActions,
  useFarmers,
  useFarms,
  useLocationActions,
  useLocations,
} from '../../queries/admin'
import type { CollectionStatus, Farm, Location } from '../../types'
import {
  EmptyState,
  ErrorState,
  Field,
  LoadingState,
  Modal,
  Pagination,
  StatusBadge,
  formatDate,
  formatKg,
  prettyStatus,
  useConfirm,
  useFlash,
} from '../../components/admin/ui'

type FarmFormData = {
  farmer_id: string
  farm_name: string
  region: string
  zone: string
  woreda: string
  kebele: string
  specific_location: string
  area_hectares: string
  coffee_variety: string
  altitude_meters: string
  latitude: string
  longitude: string
  location_id: string
  notes: string
}

type LocationFormData = {
  name: string
  location_type: string
  parent_id: string
  region: string
  zone: string
  woreda: string
  kebele: string
  address: string
  latitude: string
  longitude: string
  altitude_meters: string
  notes: string
}

/** Location detail as returned by GET /locations/:id. */
type LocationDetail = Location & {
  children: Pick<Location, 'id' | 'location_code' | 'name' | 'location_type' | 'is_active'>[]
  collections: { id: string; collection_code: string; collection_date: string; quantity_kg: number; status: CollectionStatus }[]
  warehouses: { id: string; code: string; name: string; is_active: boolean }[]
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
  'South Ethiopia Region': ['Gedeo', 'Gamo', 'Wolayita'],
  'South West Ethiopia Peoples Region': ['Kaffa', 'Sheka', 'Bench Sheko'],
}

const LOCATION_TYPES = [
  { value: 'region', label: 'Region' },
  { value: 'zone', label: 'Zone' },
  { value: 'woreda', label: 'Woreda' },
  { value: 'kebele', label: 'Kebele' },
  { value: 'collection_point', label: 'Collection Point' },
  { value: 'washing_station', label: 'Washing Station' },
  { value: 'port', label: 'Port' },
  { value: 'other', label: 'Other' },
]

const locationTypeLabel = (value: string | null | undefined) =>
  LOCATION_TYPES.find((t) => t.value === value)?.label ?? prettyStatus(value)

/** Region options, keeping a stored value that is not in the reference list. */
function regionOptions(current: string): string[] {
  const list = Object.keys(LOCATION_DATA)
  return current && !list.includes(current) ? [...list, current] : list
}

function zoneOptions(region: string, current: string): string[] {
  const list = LOCATION_DATA[region] ?? []
  return current && !list.includes(current) ? [...list, current] : list
}

const initialFarmForm: FarmFormData = {
  farmer_id: '',
  farm_name: '',
  region: '',
  zone: '',
  woreda: '',
  kebele: '',
  specific_location: '',
  area_hectares: '',
  coffee_variety: '',
  altitude_meters: '',
  latitude: '',
  longitude: '',
  location_id: '',
  notes: '',
}

const initialLocationForm: LocationFormData = {
  name: '',
  location_type: 'collection_point',
  parent_id: '',
  region: '',
  zone: '',
  woreda: '',
  kebele: '',
  address: '',
  latitude: '',
  longitude: '',
  altitude_meters: '',
  notes: '',
}

const PAGE_SIZE = 50

const str = (v: string | number | null | undefined) => (v === null || v === undefined ? '' : String(v))
const numOrNull = (v: string) => (v.trim() === '' ? null : Number(v))

/** Validates optional numeric inputs; returns an error message or ''. */
function checkNumbers(
  checks: { label: string; value: string; min: number; max: number }[]
): string {
  for (const c of checks) {
    if (c.value.trim() === '') continue
    const n = Number(c.value)
    if (!Number.isFinite(n)) return `${c.label} must be a number.`
    if (n < c.min || n > c.max) return `${c.label} must be between ${c.min} and ${c.max}.`
  }
  return ''
}

function MapLink({ lat, lng }: { lat: number | null; lng: number | null }) {
  if (lat === null || lat === undefined || lng === null || lng === undefined) {
    return <span className="text-stone-400">—</span>
  }
  return (
    <a
      href={`https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=14/${lat}/${lng}`}
      target="_blank"
      rel="noopener noreferrer"
      className="text-stone-700 underline hover:text-stone-900"
    >
      {Number(lat).toFixed(5)}, {Number(lng).toFixed(5)}
    </a>
  )
}

const AdminLocations = () => {
  const { can } = useAuth()
  const canCreate = can('locations', 'create')
  const canUpdate = can('locations', 'update')
  const canDelete = can('locations', 'delete')

  const flash = useFlash()
  const { confirm, dialog } = useConfirm()
  const [tab, setTab] = useState<'farms' | 'locations'>('farms')

  // Pickers
  const farmersQuery = useFarmers({ status: 'active', limit: 500, sort: 'name' })
  const activeFarmers = farmersQuery.data?.data ?? []
  const allLocationsQuery = useLocations({ limit: 500, sort: 'name' })
  const allLocations = allLocationsQuery.data?.data ?? []

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.18em] text-stone-400">
            Sourcing
          </p>

          <h1 className="mt-2 text-2xl font-semibold text-stone-900">
            Farms & Locations
          </h1>

          <p className="mt-1 text-sm text-stone-500">
            Manage farms linked to registered farmers, and the locations (regions, collection points, washing stations, ports) used across sourcing.
          </p>
        </div>
      </div>

      <div className="flex gap-2 border-b border-stone-200">
        {(['farms', 'locations'] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => {
              setTab(t)
              flash.clear()
            }}
            className={`-mb-px border-b-2 px-4 py-2 text-sm font-medium ${
              tab === t
                ? 'border-stone-900 text-stone-900'
                : 'border-transparent text-stone-500 hover:text-stone-800'
            }`}
          >
            {t === 'farms' ? 'Farms' : 'Locations'}
          </button>
        ))}
      </div>

      {flash.banner}

      {tab === 'farms' ? (
        <FarmsSection
          flash={flash}
          confirm={confirm}
          canCreate={canCreate}
          canUpdate={canUpdate}
          canDelete={canDelete}
          farmers={activeFarmers}
          locations={allLocations}
        />
      ) : (
        <LocationsSection
          flash={flash}
          confirm={confirm}
          canCreate={canCreate}
          canUpdate={canUpdate}
          canDelete={canDelete}
          locations={allLocations}
        />
      )}

      {dialog}
    </div>
  )
}

type Flash = ReturnType<typeof useFlash>
type Confirm = ReturnType<typeof useConfirm>['confirm']

// -----------------------------------------------------------------------------
// Farms
// -----------------------------------------------------------------------------
function FarmsSection({
  flash,
  confirm,
  canCreate,
  canUpdate,
  canDelete,
  farmers,
  locations,
}: {
  flash: Flash
  confirm: Confirm
  canCreate: boolean
  canUpdate: boolean
  canDelete: boolean
  farmers: { id: string; farmer_code: string; name: string }[]
  locations: Location[]
}) {
  const actions = useFarmActions()
  const [form, setForm] = useState<FarmFormData>(initialFarmForm)
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<Farm | null>(null)
  const [formError, setFormError] = useState('')
  const [viewing, setViewing] = useState<Farm | null>(null)

  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('')
  const [region, setRegion] = useState('')
  const [farmerFilter, setFarmerFilter] = useState('')
  const [page, setPage] = useState(1)
  const debouncedSearch = useDebounce(search.trim(), { delay: 400 })

  const farmsQuery = useFarms({
    page,
    limit: PAGE_SIZE,
    search: debouncedSearch || undefined,
    status: status || undefined,
    region: region || undefined,
    farmer_id: farmerFilter || undefined,
    sort: '-created_at',
  })
  const farms = farmsQuery.data?.data ?? []
  const total = farmsQuery.data?.meta.total ?? 0

  const saving = actions.create.isPending || actions.update.isPending
  const busy = saving || actions.remove.isPending
  const hasFilters = Boolean(search || status || region || farmerFilter)

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>
  ) => {
    const { name, value } = e.target
    setForm((prev) => ({
      ...prev,
      [name]: value,
    }))
  }

  const handleRegionChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setForm((prev) => ({
      ...prev,
      region: e.target.value,
      zone: '',
    }))
  }

  const openCreate = () => {
    setEditing(null)
    setForm(initialFarmForm)
    setFormError('')
    setShowForm(true)
  }

  const openEdit = (farm: Farm) => {
    setEditing(farm)
    setForm({
      farmer_id: farm.farmer_id,
      farm_name: farm.farm_name ?? '',
      region: farm.region ?? '',
      zone: farm.zone ?? '',
      woreda: farm.woreda ?? '',
      kebele: farm.kebele ?? '',
      specific_location: farm.specific_location ?? '',
      area_hectares: str(farm.area_hectares),
      coffee_variety: farm.coffee_variety ?? '',
      altitude_meters: str(farm.altitude_meters),
      latitude: str(farm.latitude),
      longitude: str(farm.longitude),
      location_id: farm.location_id ?? '',
      notes: farm.notes ?? '',
    })
    setFormError('')
    setShowForm(true)
    setViewing(null)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const closeForm = () => {
    setShowForm(false)
    setEditing(null)
    setForm(initialFarmForm)
    setFormError('')
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setFormError('')

    if (
      !form.farmer_id ||
      !form.farm_name.trim() ||
      !form.region ||
      !form.zone ||
      !form.woreda.trim() ||
      !form.kebele.trim()
    ) {
      setFormError('Please fill in Farmer, Farm Name, Region, Zone, Woreda, and Kebele.')
      return
    }

    const numberError = checkNumbers([
      { label: 'Area', value: form.area_hectares, min: 0, max: 100000 },
      { label: 'Altitude', value: form.altitude_meters, min: 0, max: 5000 },
      { label: 'Latitude', value: form.latitude, min: -90, max: 90 },
      { label: 'Longitude', value: form.longitude, min: -180, max: 180 },
    ])
    if (numberError) {
      setFormError(numberError)
      return
    }
    if ((form.latitude.trim() === '') !== (form.longitude.trim() === '')) {
      setFormError('Enter both latitude and longitude, or leave both empty.')
      return
    }

    const body: Record<string, unknown> = {
      farmer_id: form.farmer_id,
      farm_name: form.farm_name.trim(),
      region: form.region,
      zone: form.zone,
      woreda: form.woreda.trim(),
      kebele: form.kebele.trim(),
      specific_location: form.specific_location.trim() || null,
      area_hectares: numOrNull(form.area_hectares),
      coffee_variety: form.coffee_variety.trim() || null,
      altitude_meters: numOrNull(form.altitude_meters),
      latitude: numOrNull(form.latitude),
      longitude: numOrNull(form.longitude),
      location_id: form.location_id || null,
      notes: form.notes.trim() || null,
    }

    try {
      if (editing) {
        const updated = (await actions.update.mutateAsync({ id: editing.id, body })) as Farm
        flash.success(`Farm ${updated.farm_code} updated.`)
      } else {
        const created = (await actions.create.mutateAsync(body)) as Farm
        flash.success(`Farm added successfully with code ${created.farm_code}.`)
      }
      closeForm()
    } catch (err) {
      flash.error(err)
    }
  }

  const toggleActive = async (farm: Farm) => {
    const ok = await confirm({
      title: farm.is_active ? 'Deactivate farm?' : 'Activate farm?',
      message: `${farm.farm_code} — ${farm.farm_name} will ${farm.is_active ? 'no longer' : 'again'} be offered when recording collections.`,
      confirmLabel: farm.is_active ? 'Deactivate' : 'Activate',
    })
    if (!ok) return
    try {
      await actions.update.mutateAsync({ id: farm.id, body: { is_active: !farm.is_active } })
      flash.success(`Farm ${farm.is_active ? 'deactivated' : 'activated'}.`)
    } catch (err) {
      flash.error(err)
    }
  }

  const handleDelete = async (farm: Farm) => {
    const ok = await confirm({
      title: 'Delete farm?',
      message: `This permanently deletes ${farm.farm_code} — ${farm.farm_name}. Farms referenced by collections cannot be deleted; deactivate them instead.`,
      confirmLabel: 'Delete',
      danger: true,
    })
    if (!ok) return
    try {
      await actions.remove.mutateAsync(farm.id)
      flash.success('Farm deleted.')
      if (viewing?.id === farm.id) setViewing(null)
      if (editing?.id === farm.id) closeForm()
    } catch (err) {
      flash.error(err)
    }
  }

  const downloadCSV = () => {
    const headers = [
      'Farm Code',
      'Farmer Code',
      'Farmer Name',
      'Farm Name',
      'Region',
      'Zone',
      'Woreda',
      'Kebele',
      'Specific Location',
      'Area (ha)',
      'Coffee Variety',
      'Altitude (m)',
      'Latitude',
      'Longitude',
      'Location',
      'Notes',
      'Status',
      'Created At',
    ]

    const rows = farms.map((farm) => [
      farm.farm_code,
      farm.farmer?.farmer_code,
      farm.farmer?.name,
      farm.farm_name,
      farm.region,
      farm.zone,
      farm.woreda,
      farm.kebele,
      farm.specific_location,
      farm.area_hectares,
      farm.coffee_variety,
      farm.altitude_meters,
      farm.latitude,
      farm.longitude,
      farm.location?.name,
      farm.notes,
      farm.is_active ? 'Active' : 'Inactive',
      farm.created_at,
    ])

    downloadCsv('waka-coffee-farms.csv', headers, rows)
  }

  const inputClass = 'mt-1 w-full border border-stone-300 px-3 py-2 text-sm'
  const filterClass = 'border border-stone-300 bg-white px-3 py-2 text-sm'
  const editingFarmerMissing = editing?.farmer && !farmers.some((f) => f.id === editing.farmer_id)

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-end gap-3">
        <button
          type="button"
          onClick={downloadCSV}
          disabled={farms.length === 0}
          className="border border-stone-300 bg-white px-4 py-2 text-sm font-medium text-stone-700 hover:bg-stone-50 disabled:opacity-50"
        >
          Download CSV
        </button>

        {canCreate && (
          <button
            type="button"
            onClick={() => (showForm ? closeForm() : openCreate())}
            className="bg-stone-900 px-4 py-2 text-sm font-medium text-white hover:bg-stone-800"
          >
            {showForm ? 'Cancel' : 'Add Farm'}
          </button>
        )}
      </div>

      {showForm && (
        <form
          onSubmit={handleSubmit}
          className="border border-stone-200 bg-white p-6"
        >
          <h2 className="text-lg font-semibold text-stone-900">
            {editing ? `Edit Farm ${editing.farm_code}` : 'Register Farm'}
          </h2>

          {formError && (
            <div className="mt-4 border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {formError}
            </div>
          )}

          <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <label className="block text-sm font-medium text-stone-700">
                Farmer *
              </label>

              <select
                name="farmer_id"
                value={form.farmer_id}
                onChange={handleChange}
                className={inputClass}
              >
                <option value="">Select farmer</option>

                {editingFarmerMissing && editing?.farmer && (
                  <option value={editing.farmer.id}>
                    {editing.farmer.farmer_code} — {editing.farmer.name} (inactive)
                  </option>
                )}

                {farmers.map((farmer) => (
                  <option key={farmer.id} value={farmer.id}>
                    {farmer.farmer_code} — {farmer.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-stone-700">
                Farm Name *
              </label>

              <input
                name="farm_name"
                value={form.farm_name}
                onChange={handleChange}
                placeholder="Enter farm name"
                className={inputClass}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-stone-700">
                Region *
              </label>

              <select
                name="region"
                value={form.region}
                onChange={handleRegionChange}
                className={inputClass}
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
              <label className="block text-sm font-medium text-stone-700">
                Zone *
              </label>

              <select
                name="zone"
                value={form.zone}
                onChange={handleChange}
                disabled={!form.region}
                className={`${inputClass} disabled:bg-stone-100`}
              >
                <option value="">Select zone</option>

                {zoneOptions(form.region, form.zone).map((zone) => (
                  <option key={zone} value={zone}>
                    {zone}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-stone-700">
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
              <label className="block text-sm font-medium text-stone-700">
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

            <div>
              <label className="block text-sm font-medium text-stone-700">
                Specific Location
              </label>

              <input
                name="specific_location"
                value={form.specific_location}
                onChange={handleChange}
                placeholder="Optional"
                className={inputClass}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-stone-700">
                Linked Location
              </label>

              <select
                name="location_id"
                value={form.location_id}
                onChange={handleChange}
                className={inputClass}
              >
                <option value="">None</option>

                {locations.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name} ({locationTypeLabel(l.location_type)})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-stone-700">
                Area (hectares)
              </label>

              <input
                type="number"
                step="0.01"
                min="0"
                name="area_hectares"
                value={form.area_hectares}
                onChange={handleChange}
                placeholder="Optional"
                className={inputClass}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-stone-700">
                Coffee Variety
              </label>

              <input
                name="coffee_variety"
                value={form.coffee_variety}
                onChange={handleChange}
                placeholder="e.g. Heirloom"
                className={inputClass}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-stone-700">
                Altitude (meters)
              </label>

              <input
                type="number"
                step="0.01"
                min="0"
                max="5000"
                name="altitude_meters"
                value={form.altitude_meters}
                onChange={handleChange}
                placeholder="Optional"
                className={inputClass}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-stone-700">
                  Latitude
                </label>

                <input
                  type="number"
                  step="any"
                  min="-90"
                  max="90"
                  name="latitude"
                  value={form.latitude}
                  onChange={handleChange}
                  placeholder="e.g. 7.6769"
                  className={inputClass}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-stone-700">
                  Longitude
                </label>

                <input
                  type="number"
                  step="any"
                  min="-180"
                  max="180"
                  name="longitude"
                  value={form.longitude}
                  onChange={handleChange}
                  placeholder="e.g. 36.8344"
                  className={inputClass}
                />
              </div>
            </div>

            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-stone-700">
                Notes
              </label>

              <textarea
                name="notes"
                value={form.notes}
                onChange={handleChange}
                rows={3}
                placeholder="Optional notes"
                className={inputClass}
              />
            </div>
          </div>

          <div className="mt-5 flex justify-end gap-3">
            <button
              type="button"
              onClick={closeForm}
              className="border border-stone-300 px-5 py-2 text-sm font-medium text-stone-700 hover:bg-stone-50"
            >
              Cancel
            </button>

            <button
              type="submit"
              disabled={saving}
              className="bg-stone-900 px-5 py-2 text-sm font-medium text-white disabled:opacity-50"
            >
              {saving ? 'Saving...' : editing ? 'Update Farm' : 'Save Farm'}
            </button>
          </div>
        </form>
      )}

      <div className="overflow-hidden border border-stone-200 bg-white">
        <div className="flex flex-col gap-3 border-b border-stone-200 px-4 py-3 lg:flex-row lg:items-center lg:justify-between">
          <p className="text-sm text-stone-500">
            {total} farm{total !== 1 ? 's' : ''} {hasFilters ? 'found' : 'registered'}
          </p>

          <div className="flex flex-wrap gap-2">
            <input
              value={search}
              onChange={(e) => {
                setSearch(e.target.value)
                setPage(1)
              }}
              placeholder="Search farm, code, woreda, variety…"
              className={`${filterClass} w-60`}
            />

            <select
              value={farmerFilter}
              onChange={(e) => {
                setFarmerFilter(e.target.value)
                setPage(1)
              }}
              className={filterClass}
            >
              <option value="">All farmers</option>
              {farmers.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.farmer_code} — {f.name}
                </option>
              ))}
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
          </div>
        </div>

        {farmsQuery.isLoading ? (
          <LoadingState label="Loading farms..." />
        ) : farmsQuery.isError ? (
          <ErrorState error={farmsQuery.error} onRetry={() => farmsQuery.refetch()} />
        ) : farms.length === 0 ? (
          <EmptyState
            title={hasFilters ? 'No farms match your filters.' : 'No farms registered yet.'}
            description={hasFilters ? 'Try a different search or clear the filters.' : undefined}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-stone-200 bg-stone-50">
                <tr>
                  <th className="px-4 py-3 font-medium text-stone-600">
                    Farm Code
                  </th>

                  <th className="px-4 py-3 font-medium text-stone-600">
                    Farmer
                  </th>

                  <th className="px-4 py-3 font-medium text-stone-600">
                    Farm
                  </th>

                  <th className="px-4 py-3 font-medium text-stone-600">
                    Location
                  </th>

                  <th className="px-4 py-3 font-medium text-stone-600">
                    Coordinates
                  </th>

                  <th className="px-4 py-3 font-medium text-stone-600">
                    Area
                  </th>

                  <th className="px-4 py-3 font-medium text-stone-600">
                    Status
                  </th>

                  <th className="px-4 py-3 text-right font-medium text-stone-600">
                    Actions
                  </th>
                </tr>
              </thead>

              <tbody className="divide-y divide-stone-100">
                {farms.map((farm) => (
                  <tr key={farm.id} className="hover:bg-stone-50">
                    <td className="px-4 py-4 font-medium text-stone-900">
                      {farm.farm_code}
                    </td>

                    <td className="px-4 py-4">
                      <div className="font-medium text-stone-800">
                        {farm.farmer?.name || '—'}
                      </div>

                      <div className="text-xs text-stone-400">
                        {farm.farmer?.farmer_code || ''}
                      </div>
                    </td>

                    <td className="px-4 py-4">
                      <button
                        type="button"
                        onClick={() => setViewing(farm)}
                        className="text-left hover:underline"
                      >
                        {farm.farm_name}
                      </button>
                    </td>

                    <td className="px-4 py-4 text-stone-600">
                      {farm.region}, {farm.zone}
                      <div className="text-xs text-stone-400">
                        {farm.woreda}, {farm.kebele}
                      </div>
                    </td>

                    <td className="px-4 py-4 text-stone-600">
                      <MapLink lat={farm.latitude} lng={farm.longitude} />
                    </td>

                    <td className="px-4 py-4 text-stone-600">
                      {farm.area_hectares
                        ? `${farm.area_hectares} ha`
                        : '—'}
                    </td>

                    <td className="px-4 py-4">
                      <span
                        className={
                          farm.is_active
                            ? 'text-green-700'
                            : 'text-stone-400'
                        }
                      >
                        {farm.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </td>

                    <td className="whitespace-nowrap px-4 py-4 text-right">
                      <div className="flex justify-end gap-3">
                        <button
                          type="button"
                          onClick={() => setViewing(farm)}
                          className="font-medium text-stone-700 hover:underline"
                        >
                          View
                        </button>

                        {canUpdate && (
                          <>
                            <button
                              type="button"
                              onClick={() => openEdit(farm)}
                              disabled={busy}
                              className="font-medium text-stone-700 hover:underline disabled:opacity-50"
                            >
                              Edit
                            </button>

                            <button
                              type="button"
                              onClick={() => toggleActive(farm)}
                              disabled={busy}
                              className="font-medium text-stone-700 hover:underline disabled:opacity-50"
                            >
                              {farm.is_active ? 'Deactivate' : 'Activate'}
                            </button>
                          </>
                        )}

                        {canDelete && (
                          <button
                            type="button"
                            onClick={() => handleDelete(farm)}
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

      <Modal
        open={Boolean(viewing)}
        onClose={() => setViewing(null)}
        title={viewing ? `${viewing.farm_code} — ${viewing.farm_name}` : 'Farm'}
        footer={
          viewing && canUpdate ? (
            <button
              type="button"
              onClick={() => openEdit(viewing)}
              className="bg-stone-900 px-4 py-2 text-sm font-medium text-white hover:bg-stone-800"
            >
              Edit Farm
            </button>
          ) : undefined
        }
      >
        {viewing && (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Field label="Farmer" value={viewing.farmer ? `${viewing.farmer.farmer_code} — ${viewing.farmer.name}` : null} />
            <Field label="Status" value={viewing.is_active ? 'Active' : 'Inactive'} />
            <Field label="Linked location" value={viewing.location?.name} />
            <Field label="Region" value={viewing.region} />
            <Field label="Zone" value={viewing.zone} />
            <Field label="Woreda / Kebele" value={[viewing.woreda, viewing.kebele].filter(Boolean).join(', ')} />
            <Field label="Specific location" value={viewing.specific_location} />
            <Field label="Area" value={viewing.area_hectares ? `${viewing.area_hectares} ha` : null} />
            <Field label="Coffee variety" value={viewing.coffee_variety} />
            <Field label="Altitude" value={viewing.altitude_meters ? `${viewing.altitude_meters} m` : null} />
            <Field label="Coordinates" value={<MapLink lat={viewing.latitude} lng={viewing.longitude} />} />
            <Field label="Registered" value={formatDate(viewing.created_at)} />
            <div className="sm:col-span-3">
              <Field label="Notes" value={viewing.notes} />
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}

// -----------------------------------------------------------------------------
// Locations
// -----------------------------------------------------------------------------
function LocationsSection({
  flash,
  confirm,
  canCreate,
  canUpdate,
  canDelete,
  locations: allLocations,
}: {
  flash: Flash
  confirm: Confirm
  canCreate: boolean
  canUpdate: boolean
  canDelete: boolean
  locations: Location[]
}) {
  const actions = useLocationActions()
  const [form, setForm] = useState<LocationFormData>(initialLocationForm)
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<Location | null>(null)
  const [formError, setFormError] = useState('')
  const [viewId, setViewId] = useState<string | null>(null)

  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('')
  const [typeFilter, setTypeFilter] = useState('')
  const [region, setRegion] = useState('')
  const [page, setPage] = useState(1)
  const debouncedSearch = useDebounce(search.trim(), { delay: 400 })

  const locationsQuery = useLocations({
    page,
    limit: PAGE_SIZE,
    search: debouncedSearch || undefined,
    status: status || undefined,
    location_type: typeFilter || undefined,
    region: region || undefined,
    sort: 'name',
  })
  const locations = locationsQuery.data?.data ?? []
  const total = locationsQuery.data?.meta.total ?? 0

  const saving = actions.create.isPending || actions.update.isPending
  const busy = saving || actions.remove.isPending
  const hasFilters = Boolean(search || status || typeFilter || region)

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>
  ) => {
    const { name, value } = e.target
    if (name === 'region') {
      setForm((prev) => ({ ...prev, region: value, zone: '' }))
      return
    }
    setForm((prev) => ({ ...prev, [name]: value }))
  }

  const openCreate = () => {
    setEditing(null)
    setForm(initialLocationForm)
    setFormError('')
    setShowForm(true)
  }

  const openEdit = (loc: Location) => {
    setEditing(loc)
    setForm({
      name: loc.name ?? '',
      location_type: loc.location_type ?? 'other',
      parent_id: loc.parent_id ?? '',
      region: loc.region ?? '',
      zone: loc.zone ?? '',
      woreda: loc.woreda ?? '',
      kebele: loc.kebele ?? '',
      address: loc.address ?? '',
      latitude: str(loc.latitude),
      longitude: str(loc.longitude),
      altitude_meters: str(loc.altitude_meters),
      notes: loc.notes ?? '',
    })
    setFormError('')
    setShowForm(true)
    setViewId(null)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const closeForm = () => {
    setShowForm(false)
    setEditing(null)
    setForm(initialLocationForm)
    setFormError('')
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setFormError('')

    if (!form.name.trim() || !form.location_type) {
      setFormError('Please fill in Name and Type.')
      return
    }

    const numberError = checkNumbers([
      { label: 'Latitude', value: form.latitude, min: -90, max: 90 },
      { label: 'Longitude', value: form.longitude, min: -180, max: 180 },
      { label: 'Altitude', value: form.altitude_meters, min: 0, max: 6000 },
    ])
    if (numberError) {
      setFormError(numberError)
      return
    }
    if ((form.latitude.trim() === '') !== (form.longitude.trim() === '')) {
      setFormError('Enter both latitude and longitude, or leave both empty.')
      return
    }
    if (editing && form.parent_id === editing.id) {
      setFormError('A location cannot be its own parent.')
      return
    }

    const body: Record<string, unknown> = {
      name: form.name.trim(),
      location_type: form.location_type,
      parent_id: form.parent_id || null,
      region: form.region || null,
      zone: form.zone || null,
      woreda: form.woreda.trim() || null,
      kebele: form.kebele.trim() || null,
      address: form.address.trim() || null,
      latitude: numOrNull(form.latitude),
      longitude: numOrNull(form.longitude),
      altitude_meters: numOrNull(form.altitude_meters),
      notes: form.notes.trim() || null,
    }

    try {
      if (editing) {
        const updated = (await actions.update.mutateAsync({ id: editing.id, body })) as Location
        flash.success(`Location ${updated.location_code} updated.`)
      } else {
        const created = (await actions.create.mutateAsync(body)) as Location
        flash.success(`Location added successfully with code ${created.location_code}.`)
      }
      closeForm()
    } catch (err) {
      flash.error(err)
    }
  }

  const toggleActive = async (loc: Location) => {
    const ok = await confirm({
      title: loc.is_active ? 'Deactivate location?' : 'Activate location?',
      message: `${loc.name} will ${loc.is_active ? 'no longer' : 'again'} be offered in pickers.`,
      confirmLabel: loc.is_active ? 'Deactivate' : 'Activate',
    })
    if (!ok) return
    try {
      await actions.update.mutateAsync({ id: loc.id, body: { is_active: !loc.is_active } })
      flash.success(`Location ${loc.is_active ? 'deactivated' : 'activated'}.`)
    } catch (err) {
      flash.error(err)
    }
  }

  const handleDelete = async (loc: Location) => {
    const ok = await confirm({
      title: 'Delete location?',
      message: `This permanently deletes ${loc.location_code} — ${loc.name}. Locations used by sub-locations, farms, collections or warehouses cannot be deleted; deactivate them instead.`,
      confirmLabel: 'Delete',
      danger: true,
    })
    if (!ok) return
    try {
      await actions.remove.mutateAsync(loc.id)
      flash.success('Location deleted.')
      if (viewId === loc.id) setViewId(null)
      if (editing?.id === loc.id) closeForm()
    } catch (err) {
      flash.error(err)
    }
  }

  const downloadCSV = () => {
    const headers = [
      'Location Code',
      'Name',
      'Type',
      'Parent',
      'Region',
      'Zone',
      'Woreda',
      'Kebele',
      'Address',
      'Latitude',
      'Longitude',
      'Altitude (m)',
      'Notes',
      'Status',
      'Created At',
    ]
    const rows = locations.map((l) => [
      l.location_code,
      l.name,
      locationTypeLabel(l.location_type),
      l.parent?.name,
      l.region,
      l.zone,
      l.woreda,
      l.kebele,
      l.address,
      l.latitude,
      l.longitude,
      l.altitude_meters,
      l.notes,
      l.is_active ? 'Active' : 'Inactive',
      l.created_at,
    ])
    downloadCsv('waka-coffee-locations.csv', headers, rows)
  }

  const inputClass = 'mt-1 w-full border border-stone-300 px-3 py-2 text-sm'
  const filterClass = 'border border-stone-300 bg-white px-3 py-2 text-sm'
  const parentOptions = allLocations.filter((l) => l.id !== editing?.id)

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-end gap-3">
        <button
          type="button"
          onClick={downloadCSV}
          disabled={locations.length === 0}
          className="border border-stone-300 bg-white px-4 py-2 text-sm font-medium text-stone-700 hover:bg-stone-50 disabled:opacity-50"
        >
          Download CSV
        </button>

        {canCreate && (
          <button
            type="button"
            onClick={() => (showForm ? closeForm() : openCreate())}
            className="bg-stone-900 px-4 py-2 text-sm font-medium text-white hover:bg-stone-800"
          >
            {showForm ? 'Cancel' : 'Add Location'}
          </button>
        )}
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="border border-stone-200 bg-white p-6">
          <h2 className="text-lg font-semibold text-stone-900">
            {editing ? `Edit Location ${editing.location_code}` : 'Register Location'}
          </h2>

          <p className="mt-1 text-sm text-stone-500">
            {editing ? 'Update the location details below.' : 'Location code will be generated automatically.'}
          </p>

          {formError && (
            <div className="mt-4 border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {formError}
            </div>
          )}

          <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <label className="block text-sm font-medium text-stone-700">Name *</label>
              <input name="name" value={form.name} onChange={handleChange} placeholder="e.g. Yirgacheffe Collection Point" className={inputClass} />
            </div>

            <div>
              <label className="block text-sm font-medium text-stone-700">Type *</label>
              <select name="location_type" value={form.location_type} onChange={handleChange} className={inputClass}>
                {LOCATION_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-stone-700">Parent Location</label>
              <select name="parent_id" value={form.parent_id} onChange={handleChange} className={inputClass}>
                <option value="">None</option>
                {parentOptions.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name} ({locationTypeLabel(l.location_type)})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-stone-700">Region</label>
              <select name="region" value={form.region} onChange={handleChange} className={inputClass}>
                <option value="">Select region</option>
                {regionOptions(form.region).map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-stone-700">Zone</label>
              <select
                name="zone"
                value={form.zone}
                onChange={handleChange}
                disabled={!form.region}
                className={`${inputClass} disabled:bg-stone-100`}
              >
                <option value="">Select zone</option>
                {zoneOptions(form.region, form.zone).map((zone) => (
                  <option key={zone} value={zone}>
                    {zone}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-stone-700">Woreda</label>
              <input name="woreda" value={form.woreda} onChange={handleChange} placeholder="Optional" className={inputClass} />
            </div>

            <div>
              <label className="block text-sm font-medium text-stone-700">Kebele</label>
              <input name="kebele" value={form.kebele} onChange={handleChange} placeholder="Optional" className={inputClass} />
            </div>

            <div>
              <label className="block text-sm font-medium text-stone-700">Altitude (meters)</label>
              <input
                type="number"
                step="0.01"
                min="0"
                max="6000"
                name="altitude_meters"
                value={form.altitude_meters}
                onChange={handleChange}
                placeholder="Optional"
                className={inputClass}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-stone-700">Latitude</label>
              <input
                type="number"
                step="any"
                min="-90"
                max="90"
                name="latitude"
                value={form.latitude}
                onChange={handleChange}
                placeholder="-90 to 90"
                className={inputClass}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-stone-700">Longitude</label>
              <input
                type="number"
                step="any"
                min="-180"
                max="180"
                name="longitude"
                value={form.longitude}
                onChange={handleChange}
                placeholder="-180 to 180"
                className={inputClass}
              />
            </div>

            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-stone-700">Address</label>
              <textarea name="address" value={form.address} onChange={handleChange} rows={2} placeholder="Optional" className={inputClass} />
            </div>

            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-stone-700">Notes</label>
              <textarea name="notes" value={form.notes} onChange={handleChange} rows={3} placeholder="Optional notes" className={inputClass} />
            </div>
          </div>

          <div className="mt-5 flex justify-end gap-3">
            <button
              type="button"
              onClick={closeForm}
              className="border border-stone-300 px-5 py-2 text-sm font-medium text-stone-700 hover:bg-stone-50"
            >
              Cancel
            </button>

            <button type="submit" disabled={saving} className="bg-stone-900 px-5 py-2 text-sm font-medium text-white disabled:opacity-50">
              {saving ? 'Saving...' : editing ? 'Update Location' : 'Save Location'}
            </button>
          </div>
        </form>
      )}

      <div className="overflow-hidden border border-stone-200 bg-white">
        <div className="flex flex-col gap-3 border-b border-stone-200 px-4 py-3 lg:flex-row lg:items-center lg:justify-between">
          <p className="text-sm text-stone-500">
            {total} location{total !== 1 ? 's' : ''} {hasFilters ? 'found' : 'registered'}
          </p>

          <div className="flex flex-wrap gap-2">
            <input
              value={search}
              onChange={(e) => {
                setSearch(e.target.value)
                setPage(1)
              }}
              placeholder="Search name, code, woreda…"
              className={`${filterClass} w-60`}
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
              {LOCATION_TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
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
          </div>
        </div>

        {locationsQuery.isLoading ? (
          <LoadingState label="Loading locations..." />
        ) : locationsQuery.isError ? (
          <ErrorState error={locationsQuery.error} onRetry={() => locationsQuery.refetch()} />
        ) : locations.length === 0 ? (
          <EmptyState
            title={hasFilters ? 'No locations match your filters.' : 'No locations registered yet.'}
            description={hasFilters ? 'Try a different search or clear the filters.' : undefined}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-stone-200 bg-stone-50">
                <tr>
                  <th className="px-4 py-3 font-medium text-stone-600">Code</th>
                  <th className="px-4 py-3 font-medium text-stone-600">Name</th>
                  <th className="px-4 py-3 font-medium text-stone-600">Type</th>
                  <th className="px-4 py-3 font-medium text-stone-600">Parent</th>
                  <th className="px-4 py-3 font-medium text-stone-600">Area</th>
                  <th className="px-4 py-3 font-medium text-stone-600">Coordinates</th>
                  <th className="px-4 py-3 font-medium text-stone-600">Status</th>
                  <th className="px-4 py-3 text-right font-medium text-stone-600">Actions</th>
                </tr>
              </thead>

              <tbody className="divide-y divide-stone-100">
                {locations.map((loc) => (
                  <tr key={loc.id} className="hover:bg-stone-50">
                    <td className="px-4 py-4 font-medium text-stone-900">{loc.location_code}</td>
                    <td className="px-4 py-4">
                      <button type="button" onClick={() => setViewId(loc.id)} className="text-left font-medium text-stone-800 hover:underline">
                        {loc.name}
                      </button>
                    </td>
                    <td className="px-4 py-4 text-stone-600">{locationTypeLabel(loc.location_type)}</td>
                    <td className="px-4 py-4 text-stone-600">{loc.parent?.name || '—'}</td>
                    <td className="px-4 py-4 text-stone-600">
                      {[loc.region, loc.zone].filter(Boolean).join(', ') || '—'}
                      {(loc.woreda || loc.kebele) && (
                        <div className="text-xs text-stone-400">{[loc.woreda, loc.kebele].filter(Boolean).join(', ')}</div>
                      )}
                    </td>
                    <td className="px-4 py-4 text-stone-600">
                      <MapLink lat={loc.latitude} lng={loc.longitude} />
                    </td>
                    <td className="px-4 py-4">
                      <span className={loc.is_active ? 'text-green-700' : 'text-stone-400'}>
                        {loc.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-4 py-4 text-right">
                      <div className="flex justify-end gap-3">
                        <button type="button" onClick={() => setViewId(loc.id)} className="font-medium text-stone-700 hover:underline">
                          View
                        </button>

                        {canUpdate && (
                          <>
                            <button
                              type="button"
                              onClick={() => openEdit(loc)}
                              disabled={busy}
                              className="font-medium text-stone-700 hover:underline disabled:opacity-50"
                            >
                              Edit
                            </button>

                            <button
                              type="button"
                              onClick={() => toggleActive(loc)}
                              disabled={busy}
                              className="font-medium text-stone-700 hover:underline disabled:opacity-50"
                            >
                              {loc.is_active ? 'Deactivate' : 'Activate'}
                            </button>
                          </>
                        )}

                        {canDelete && (
                          <button
                            type="button"
                            onClick={() => handleDelete(loc)}
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

      <LocationDetailModal id={viewId} onClose={() => setViewId(null)} onEdit={canUpdate ? openEdit : undefined} />
    </div>
  )
}

function LocationDetailModal({
  id,
  onClose,
  onEdit,
}: {
  id: string | null
  onClose: () => void
  onEdit?: (loc: Location) => void
}) {
  const query = useQuery({
    queryKey: [...qk.locations, 'detail', id],
    queryFn: async () => (await locationsApi.get(id!)) as LocationDetail,
    enabled: Boolean(id),
  })
  const loc = query.data

  return (
    <Modal
      open={Boolean(id)}
      onClose={onClose}
      size="xl"
      title={loc ? `${loc.location_code} — ${loc.name}` : 'Location details'}
      footer={
        loc && onEdit ? (
          <button type="button" onClick={() => onEdit(loc)} className="bg-stone-900 px-4 py-2 text-sm font-medium text-white hover:bg-stone-800">
            Edit Location
          </button>
        ) : undefined
      }
    >
      {query.isLoading ? (
        <LoadingState label="Loading location..." />
      ) : query.isError ? (
        <ErrorState error={query.error} onRetry={() => query.refetch()} />
      ) : loc ? (
        <div className="space-y-6">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Field label="Type" value={locationTypeLabel(loc.location_type)} />
            <Field label="Status" value={loc.is_active ? 'Active' : 'Inactive'} />
            <Field label="Parent" value={loc.parent ? `${loc.parent.name} (${locationTypeLabel(loc.parent.location_type)})` : null} />
            <Field label="Region" value={loc.region} />
            <Field label="Zone" value={loc.zone} />
            <Field label="Woreda / Kebele" value={[loc.woreda, loc.kebele].filter(Boolean).join(', ')} />
            <Field label="Coordinates" value={<MapLink lat={loc.latitude} lng={loc.longitude} />} />
            <Field label="Altitude" value={loc.altitude_meters !== null ? `${loc.altitude_meters} m` : null} />
            <Field label="Address" value={loc.address} />
            <div className="sm:col-span-3">
              <Field label="Notes" value={loc.notes} />
            </div>
          </div>

          <div>
            <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-stone-700">Sub-locations</h3>
            {(loc.children ?? []).length === 0 ? (
              <p className="text-sm text-stone-500">No sub-locations.</p>
            ) : (
              <ul className="divide-y divide-stone-100 border border-stone-200 text-sm">
                {loc.children.map((c) => (
                  <li key={c.id} className="flex justify-between px-4 py-2">
                    <span>
                      <span className="font-medium text-stone-900">{c.location_code}</span> — {c.name}
                    </span>
                    <span className="text-stone-500">
                      {locationTypeLabel(c.location_type)} · {c.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div>
            <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-stone-700">Collections at this location</h3>
            {(loc.collections ?? []).length === 0 ? (
              <p className="text-sm text-stone-500">No collections recorded here.</p>
            ) : (
              <table className="w-full border border-stone-200 text-left text-sm">
                <thead className="bg-stone-50 text-stone-600">
                  <tr>
                    <th className="px-4 py-2 font-medium">Code</th>
                    <th className="px-4 py-2 font-medium">Date</th>
                    <th className="px-4 py-2 text-right font-medium">Quantity</th>
                    <th className="px-4 py-2 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-100">
                  {loc.collections.map((c) => (
                    <tr key={c.id}>
                      <td className="px-4 py-2 font-medium text-stone-900">{c.collection_code}</td>
                      <td className="px-4 py-2 text-stone-600">{formatDate(c.collection_date)}</td>
                      <td className="px-4 py-2 text-right">{formatKg(c.quantity_kg)}</td>
                      <td className="px-4 py-2">
                        <StatusBadge status={c.status} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {(loc.warehouses ?? []).length > 0 && (
            <div>
              <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-stone-700">Warehouses</h3>
              <ul className="divide-y divide-stone-100 border border-stone-200 text-sm">
                {loc.warehouses.map((w) => (
                  <li key={w.id} className="flex justify-between px-4 py-2">
                    <span>
                      <span className="font-medium text-stone-900">{w.code}</span> — {w.name}
                    </span>
                    <span className="text-stone-500">{w.is_active ? 'Active' : 'Inactive'}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      ) : null}
    </Modal>
  )
}

export default AdminLocations
