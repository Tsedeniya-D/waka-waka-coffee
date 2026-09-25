import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useAuth } from '../../contexts/AuthContext'
import { useDebounce } from '../../hooks'
import { downloadCsv } from '../../lib/api'
import { farmsApi } from '../../api'
import {
  qk,
  useCollection,
  useCollectionActions,
  useCollections,
  useFarmers,
  useLocations,
  useSuppliers,
} from '../../queries/admin'
import type { CollectionRecord } from '../../types'
import {
  EmptyState,
  ErrorState,
  Field,
  LoadingState,
  Modal,
  Pagination,
  StatusActions,
  StatusBadge,
  SummaryCard,
  formatDate,
  formatDateTime,
  formatKg,
  formatMoney,
  prettyStatus,
  useConfirm,
  useFlash,
} from '../../components/admin/ui'

type FormData = {
  collection_date: string
  supplier_id: string
  farmer_id: string
  farm_id: string
  location_id: string
  origin: string
  region: string
  zone: string
  woreda: string
  kebele: string
  coffee_type: string
  variety: string
  processing_method: string
  grade: string
  quantity_kg: string
  purchase_price: string
  currency: string
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

const PROCESSING_METHODS = [
  { value: 'washed', label: 'Washed' },
  { value: 'natural', label: 'Natural' },
  { value: 'honey', label: 'Honey' },
  { value: 'anaerobic', label: 'Anaerobic' },
  { value: 'semi_washed', label: 'Semi-washed' },
]

const CURRENCIES = ['ETB', 'USD', 'EUR', 'GBP', 'JPY', 'CNY', 'AED', 'SAR']

const COLLECTION_STATUSES = ['submitted', 'verified', 'rejected', 'partially_processed', 'processed']

/** Region options, keeping a stored value that is not in the reference list. */
function regionOptions(current: string): string[] {
  const list = Object.keys(LOCATION_DATA)
  return current && !list.includes(current) ? [...list, current] : list
}

function zoneOptions(region: string, current: string): string[] {
  const list = LOCATION_DATA[region] ?? []
  return current && !list.includes(current) ? [...list, current] : list
}

/** Today as YYYY-MM-DD in the user's local time zone. */
function today(): string {
  const d = new Date()
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10)
}

const methodLabel = (value: string | null | undefined) =>
  PROCESSING_METHODS.find((m) => m.value === value)?.label ?? (value ? prettyStatus(value) : '')

const initialForm = (): FormData => ({
  collection_date: today(),
  supplier_id: '',
  farmer_id: '',
  farm_id: '',
  location_id: '',
  origin: '',
  region: '',
  zone: '',
  woreda: '',
  kebele: '',
  coffee_type: 'Arabica',
  variety: '',
  processing_method: '',
  grade: '',
  quantity_kg: '',
  purchase_price: '',
  currency: 'ETB',
  notes: '',
})

function toForm(c: CollectionRecord): FormData {
  return {
    collection_date: c.collection_date?.slice(0, 10) ?? '',
    supplier_id: c.supplier_id ?? '',
    farmer_id: c.farmer_id ?? '',
    farm_id: c.farm_id ?? '',
    location_id: c.location_id ?? '',
    origin: c.origin ?? '',
    region: c.region ?? '',
    zone: c.zone ?? '',
    woreda: c.woreda ?? '',
    kebele: c.kebele ?? '',
    coffee_type: c.coffee_type ?? 'Arabica',
    variety: c.variety ?? '',
    processing_method: c.processing_method ?? '',
    grade: c.grade ?? '',
    quantity_kg: c.quantity_kg !== null && c.quantity_kg !== undefined ? String(c.quantity_kg) : '',
    purchase_price: c.purchase_price !== null && c.purchase_price !== undefined ? String(c.purchase_price) : '',
    currency: c.currency ?? 'ETB',
    notes: c.notes ?? '',
  }
}

/** Form -> API body (text '' becomes null so the API clears the column). */
function toBody(form: FormData): Record<string, unknown> {
  return {
    collection_date: form.collection_date,
    supplier_id: form.supplier_id,
    farmer_id: form.farmer_id || null,
    farm_id: form.farm_id || null,
    location_id: form.location_id || null,
    origin: form.origin.trim(),
    region: form.region,
    zone: form.zone,
    woreda: form.woreda.trim(),
    kebele: form.kebele.trim(),
    coffee_type: form.coffee_type || 'Arabica',
    variety: form.variety.trim() || null,
    processing_method: form.processing_method || null,
    grade: form.grade.trim() || null,
    quantity_kg: Number(form.quantity_kg),
    purchase_price: form.purchase_price.trim() === '' ? null : Number(form.purchase_price),
    currency: form.currency || 'ETB',
    notes: form.notes.trim() || null,
  }
}

const PAGE_SIZE = 50

export default function AdminCollactions() {
  const { can } = useAuth()
  const canCreate = can('collection', 'create')
  const canUpdate = can('collection', 'update')
  const canDelete = can('collection', 'delete')

  const flash = useFlash()
  const { confirm, dialog } = useConfirm()
  const actions = useCollectionActions()

  const [form, setForm] = useState<FormData>(initialForm)
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<CollectionRecord | null>(null)
  const [formError, setFormError] = useState('')
  const [viewId, setViewId] = useState<string | null>(null)

  // Filters (server side)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [supplierFilter, setSupplierFilter] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [page, setPage] = useState(1)
  const debouncedSearch = useDebounce(search.trim(), { delay: 400 })

  const collectionsQuery = useCollections({
    page,
    limit: PAGE_SIZE,
    search: debouncedSearch || undefined,
    status: statusFilter || undefined,
    supplier_id: supplierFilter || undefined,
    from: from || undefined,
    to: to || undefined,
    sort: '-collection_date',
  })
  const collections = collectionsQuery.data?.data ?? []
  const total = collectionsQuery.data?.meta.total ?? 0

  // Pickers
  const suppliersQuery = useSuppliers({ status: 'active', limit: 500, sort: 'name' })
  const suppliers = suppliersQuery.data?.data ?? []
  const farmersQuery = useFarmers({
    status: 'active',
    limit: 500,
    sort: 'name',
    supplier_id: form.supplier_id || undefined,
  })
  const farmers = farmersQuery.data?.data ?? []
  const farmParams = { farmer_id: form.farmer_id, status: 'active', limit: 500, sort: 'farm_name' }
  const farmsQuery = useQuery({
    queryKey: [...qk.farms, farmParams],
    queryFn: () => farmsApi.list(farmParams),
    enabled: showForm && Boolean(form.farmer_id),
  })
  const farms = form.farmer_id ? farmsQuery.data?.data ?? [] : []
  const locationsQuery = useLocations({ status: 'active', limit: 500, sort: 'name' })
  const locations = locationsQuery.data?.data ?? []
  const collectionPoints = locations.filter((l) => l.location_type === 'collection_point' || l.location_type === 'washing_station')
  const otherLocations = locations.filter((l) => !collectionPoints.includes(l))

  const saving = actions.create.isPending || actions.update.isPending
  const busy = saving || actions.remove.isPending || actions.setStatus.isPending

  function handleChange(
    e: React.ChangeEvent<
      HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
    >
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

    // Source pickers cascade: supplier -> farmer -> farm
    if (name === 'supplier_id') {
      setForm((prev) => ({ ...prev, supplier_id: value, farmer_id: '', farm_id: '' }))
      return
    }

    if (name === 'farmer_id') {
      setForm((prev) => ({ ...prev, farmer_id: value, farm_id: '' }))
      return
    }

    if (name === 'farm_id') {
      const farm = farms.find((f) => f.id === value)
      setForm((prev) => ({
        ...prev,
        farm_id: value,
        // Prefill the area from the farm when it is still empty.
        region: prev.region || farm?.region || '',
        zone: prev.region ? prev.zone : farm?.zone || '',
        woreda: prev.woreda || farm?.woreda || '',
        kebele: prev.kebele || farm?.kebele || '',
        variety: prev.variety || farm?.coffee_variety || '',
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
    setForm(initialForm())
    setFormError('')
    setShowForm(true)
  }

  function openEdit(collection: CollectionRecord) {
    setEditing(collection)
    setForm(toForm(collection))
    setFormError('')
    setShowForm(true)
    setViewId(null)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  function closeForm() {
    setShowForm(false)
    setEditing(null)
    setForm(initialForm())
    setFormError('')
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setFormError('')

    if (
      !form.collection_date ||
      !form.supplier_id ||
      !form.origin.trim() ||
      !form.region ||
      !form.zone ||
      !form.woreda.trim() ||
      !form.kebele.trim() ||
      !form.quantity_kg
    ) {
      setFormError(
        'Please fill in all required fields: date, supplier, origin, region, zone, woreda, kebele and quantity.'
      )
      return
    }

    if (form.collection_date > today()) {
      setFormError('Collection date cannot be in the future.')
      return
    }

    const qty = Number(form.quantity_kg)
    if (!Number.isFinite(qty) || qty <= 0) {
      setFormError('Quantity must be greater than 0.')
      return
    }

    if (
      form.purchase_price.trim() !== '' &&
      (!Number.isFinite(Number(form.purchase_price)) || Number(form.purchase_price) < 0)
    ) {
      setFormError('Purchase price cannot be negative.')
      return
    }

    const body = toBody(form)

    try {
      if (editing) {
        // Send only what changed: the API locks the source (supplier / farmer /
        // farm / origin) once lots exist, even if the same value is re-sent.
        const original = toBody(toForm(editing))
        const changes = Object.fromEntries(
          Object.entries(body).filter(([k, v]) => original[k] !== v)
        )
        if (Object.keys(changes).length === 0) {
          flash.success('No changes to save.')
          closeForm()
          return
        }
        const updated = await actions.update.mutateAsync({ id: editing.id, body: changes })
        flash.success(`Collection ${(updated as CollectionRecord).collection_code} updated.`)
      } else {
        const created = await actions.create.mutateAsync(body)
        flash.success(`Coffee collection recorded successfully as ${(created as CollectionRecord).collection_code}.`)
      }
      closeForm()
    } catch (err) {
      flash.error(err)
    }
  }

  async function changeStatus(collection: Pick<CollectionRecord, 'id' | 'collection_code' | 'status'>, next: string) {
    let reason: string | undefined
    if (next === 'rejected') {
      const result = await confirm({
        title: `Reject ${collection.collection_code}?`,
        message: 'Rejected collections cannot be processed into lots or edited until they are reopened.',
        confirmLabel: 'Reject',
        danger: true,
        withReason: true,
        reasonLabel: 'Reason for rejection',
        reasonRequired: true,
      })
      if (result === false) return
      reason = typeof result === 'string' ? result : undefined
    } else {
      const ok = await confirm({
        title: next === 'verified' ? `Verify ${collection.collection_code}?` : `Move ${collection.collection_code} to ${prettyStatus(next)}?`,
        message:
          next === 'verified'
            ? 'Confirms the quantity and source of this collection so lots can be created from it.'
            : next === 'submitted'
              ? 'Reopens the collection so it can be corrected and verified again.'
              : undefined,
        confirmLabel: next === 'submitted' ? 'Reopen' : prettyStatus(next),
      })
      if (!ok) return
    }

    try {
      await actions.setStatus.mutateAsync({
        id: collection.id,
        status: next as 'submitted' | 'verified' | 'rejected',
        reason,
      })
      flash.success(`Collection ${collection.collection_code} is now ${prettyStatus(next).toLowerCase()}.`)
    } catch (err) {
      flash.error(err)
    }
  }

  async function handleDelete(collection: CollectionRecord) {
    const ok = await confirm({
      title: 'Delete collection?',
      message: `This permanently deletes ${collection.collection_code}. Collections that already have lots cannot be deleted.`,
      confirmLabel: 'Delete',
      danger: true,
    })
    if (!ok) return
    try {
      await actions.remove.mutateAsync(collection.id)
      flash.success('Collection deleted.')
      if (viewId === collection.id) setViewId(null)
      if (editing?.id === collection.id) closeForm()
    } catch (err) {
      flash.error(err)
    }
  }

  function downloadCSV() {
    if (collections.length === 0) {
      flash.error(new Error('There are no collection records to download.'))
      return
    }

    const headers = [
      'Collection Code',
      'Collection Date',
      'Supplier',
      'Farmer',
      'Farm',
      'Location',
      'Field Officer',
      'Origin',
      'Region',
      'Zone',
      'Woreda',
      'Kebele',
      'Coffee Type',
      'Variety',
      'Processing Method',
      'Grade',
      'Quantity (KG)',
      'Purchase Price',
      'Currency',
      'Status',
      'Created At',
    ]

    const rows = collections.map((item) => [
      item.collection_code,
      item.collection_date,
      item.supplier?.name,
      item.farmer?.name,
      item.farm?.farm_name,
      item.location?.name,
      item.field_officer?.full_name,
      item.origin,
      item.region,
      item.zone,
      item.woreda,
      item.kebele,
      item.coffee_type,
      item.variety,
      methodLabel(item.processing_method),
      item.grade,
      item.quantity_kg,
      item.purchase_price,
      item.currency,
      prettyStatus(item.status),
      item.created_at,
    ])

    downloadCsv(`waka-coffee-collections-${today()}.csv`, headers, rows)
  }

  const inputClass =
    'w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm outline-none focus:border-black'
  const selectClass =
    'w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-black disabled:bg-gray-100'
  const filterClass =
    'rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm outline-none focus:border-black'
  const hasFilters = Boolean(search || statusFilter || supplierFilter || from || to)

  // Keep the current value selectable when editing a record whose source is now inactive.
  const supplierMissing = editing?.supplier && !suppliers.some((s) => s.id === editing.supplier_id)
  const farmerMissing =
    editing?.farmer && form.farmer_id === editing.farmer_id && !farmers.some((f) => f.id === editing.farmer_id)
  const farmMissing = editing?.farm && form.farm_id === editing.farm_id && !farms.some((f) => f.id === editing.farm_id)
  const locationMissing =
    editing?.location && form.location_id === editing.location_id && !locations.some((l) => l.id === editing.location_id)

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            Coffee Collection
          </h1>

          <p className="mt-1 text-sm text-gray-500">
            Record and manage coffee collected from suppliers.
          </p>
        </div>

        <div className="flex gap-3">
          <button
            type="button"
            onClick={downloadCSV}
            disabled={collections.length === 0}
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
              {showForm ? 'Cancel' : '+ Add Collection'}
            </button>
          )}
        </div>
      </div>

      {/* Messages */}
      {flash.banner}

      {/* Add / Edit Collection Form */}
      {showForm && (
        <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
          <div className="mb-6">
            <h2 className="text-lg font-semibold text-gray-900">
              {editing ? `Edit Collection ${editing.collection_code}` : 'Add New Coffee Collection'}
            </h2>

            <p className="mt-1 text-sm text-gray-500">
              {editing
                ? 'Once lots have been created from this collection its source (supplier, farmer, farm, origin) can no longer change.'
                : 'Collection code will be generated automatically and you will be recorded as the field officer.'}
            </p>
          </div>

          {formError && (
            <div className="mb-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {formError}
            </div>
          )}

          <form
            onSubmit={handleSubmit}
            className="space-y-6"
          >
            {/* Collection Information */}
            <div>
              <h3 className="mb-4 text-sm font-semibold uppercase tracking-wide text-gray-700">
                Collection Information
              </h3>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-gray-700">
                    Collection Date *
                  </label>

                  <input
                    type="date"
                    name="collection_date"
                    value={form.collection_date}
                    max={today()}
                    onChange={handleChange}
                    className={inputClass}
                  />
                </div>

                <div>
                  <label className="mb-1.5 block text-sm font-medium text-gray-700">
                    Supplier *
                  </label>

                  <select
                    name="supplier_id"
                    value={form.supplier_id}
                    onChange={handleChange}
                    className={selectClass}
                  >
                    <option value="">
                      Select supplier
                    </option>

                    {supplierMissing && editing?.supplier && (
                      <option value={editing.supplier.id}>
                        {editing.supplier.supplier_code} - {editing.supplier.name} (inactive)
                      </option>
                    )}

                    {suppliers.map((supplier) => (
                      <option
                        key={supplier.id}
                        value={supplier.id}
                      >
                        {supplier.supplier_code} -{' '}
                        {supplier.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="mb-1.5 block text-sm font-medium text-gray-700">
                    Farmer
                  </label>

                  <select
                    name="farmer_id"
                    value={form.farmer_id}
                    onChange={handleChange}
                    className={selectClass}
                  >
                    <option value="">
                      {form.supplier_id && farmers.length === 0 && !farmersQuery.isLoading
                        ? 'No farmers linked to this supplier'
                        : 'Optional farmer'}
                    </option>

                    {farmerMissing && editing?.farmer && (
                      <option value={editing.farmer.id}>
                        {editing.farmer.farmer_code} - {editing.farmer.name}
                      </option>
                    )}

                    {farmers.map((farmer) => (
                      <option key={farmer.id} value={farmer.id}>
                        {farmer.farmer_code} - {farmer.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="mb-1.5 block text-sm font-medium text-gray-700">
                    Farm
                  </label>

                  <select
                    name="farm_id"
                    value={form.farm_id}
                    onChange={handleChange}
                    disabled={!form.farmer_id}
                    className={selectClass}
                  >
                    <option value="">
                      {form.farmer_id ? 'Optional farm' : 'Select a farmer first'}
                    </option>

                    {farmMissing && editing?.farm && (
                      <option value={editing.farm.id}>
                        {editing.farm.farm_code} - {editing.farm.farm_name}
                      </option>
                    )}

                    {farms.map((farm) => (
                      <option key={farm.id} value={farm.id}>
                        {farm.farm_code} - {farm.farm_name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="mb-1.5 block text-sm font-medium text-gray-700">
                    Origin *
                  </label>

                  <input
                    name="origin"
                    value={form.origin}
                    onChange={handleChange}
                    placeholder="Enter coffee origin"
                    className={inputClass}
                  />
                </div>

                <div>
                  <label className="mb-1.5 block text-sm font-medium text-gray-700">
                    Quantity (KG) *
                  </label>

                  <input
                    type="number"
                    name="quantity_kg"
                    value={form.quantity_kg}
                    onChange={handleChange}
                    min="0.01"
                    step="0.01"
                    placeholder="Enter quantity in KG"
                    className={inputClass}
                  />
                </div>
              </div>
            </div>

            {/* Location */}
            <div>
              <h3 className="mb-4 text-sm font-semibold uppercase tracking-wide text-gray-700">
                Collection Location
              </h3>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div className="md:col-span-2">
                  <label className="mb-1.5 block text-sm font-medium text-gray-700">
                    Collection Point / Location
                  </label>

                  <select
                    name="location_id"
                    value={form.location_id}
                    onChange={handleChange}
                    className={selectClass}
                  >
                    <option value="">Optional location</option>

                    {locationMissing && editing?.location && (
                      <option value={editing.location.id}>
                        {editing.location.name}
                      </option>
                    )}

                    {collectionPoints.length > 0 && (
                      <optgroup label="Collection points & washing stations">
                        {collectionPoints.map((l) => (
                          <option key={l.id} value={l.id}>
                            {l.name}
                          </option>
                        ))}
                      </optgroup>
                    )}

                    {otherLocations.length > 0 && (
                      <optgroup label="Other locations">
                        {otherLocations.map((l) => (
                          <option key={l.id} value={l.id}>
                            {l.name} ({prettyStatus(l.location_type)})
                          </option>
                        ))}
                      </optgroup>
                    )}
                  </select>
                </div>

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
                    <option value="">
                      Select region
                    </option>

                    {regionOptions(form.region).map(
                      (region) => (
                        <option
                          key={region}
                          value={region}
                        >
                          {region}
                        </option>
                      )
                    )}
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
                    className={selectClass}
                  >
                    <option value="">
                      Select zone
                    </option>

                    {form.region &&
                      zoneOptions(form.region, form.zone).map((zone) => (
                        <option
                          key={zone}
                          value={zone}
                        >
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

            {/* Coffee Details */}
            <div>
              <h3 className="mb-4 text-sm font-semibold uppercase tracking-wide text-gray-700">
                Coffee Details
              </h3>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-gray-700">
                    Coffee Type
                  </label>

                  <select
                    name="coffee_type"
                    value={form.coffee_type}
                    onChange={handleChange}
                    className={selectClass}
                  >
                    <option value="Arabica">
                      Arabica
                    </option>

                    <option value="Robusta">
                      Robusta
                    </option>
                  </select>
                </div>

                <div>
                  <label className="mb-1.5 block text-sm font-medium text-gray-700">
                    Variety
                  </label>

                  <input
                    name="variety"
                    value={form.variety}
                    onChange={handleChange}
                    placeholder="Optional coffee variety"
                    className={inputClass}
                  />
                </div>

                <div>
                  <label className="mb-1.5 block text-sm font-medium text-gray-700">
                    Processing Method
                  </label>

                  <select
                    name="processing_method"
                    value={form.processing_method}
                    onChange={handleChange}
                    className={selectClass}
                  >
                    <option value="">Not specified</option>

                    {PROCESSING_METHODS.map((m) => (
                      <option key={m.value} value={m.value}>
                        {m.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="mb-1.5 block text-sm font-medium text-gray-700">
                    Grade
                  </label>

                  <input
                    name="grade"
                    value={form.grade}
                    onChange={handleChange}
                    maxLength={40}
                    placeholder="Optional, e.g. G1"
                    className={inputClass}
                  />
                </div>

                <div>
                  <label className="mb-1.5 block text-sm font-medium text-gray-700">
                    Purchase Price
                  </label>

                  <input
                    type="number"
                    name="purchase_price"
                    value={form.purchase_price}
                    onChange={handleChange}
                    min="0"
                    step="0.01"
                    placeholder="Optional"
                    className={inputClass}
                  />
                </div>

                <div>
                  <label className="mb-1.5 block text-sm font-medium text-gray-700">
                    Currency
                  </label>

                  <select
                    name="currency"
                    value={form.currency}
                    onChange={handleChange}
                    className={selectClass}
                  >
                    {CURRENCIES.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
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
                placeholder="Optional additional information"
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
                {saving
                  ? 'Saving...'
                  : editing
                    ? 'Update Collection'
                    : 'Save Collection'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Collection Table */}
      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        <div className="flex flex-col gap-4 border-b border-gray-200 px-6 py-4 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <h2 className="font-semibold text-gray-900">
              Coffee Collections
            </h2>

            <p className="text-sm text-gray-500">
              {total} collection
              {total !== 1 ? 's' : ''}{' '}
              {hasFilters ? 'found' : 'recorded'}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <input
              value={search}
              onChange={(e) => {
                setSearch(e.target.value)
                setPage(1)
              }}
              placeholder="Search code, origin, woreda…"
              className={`${filterClass} w-56`}
            />

            <select
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value)
                setPage(1)
              }}
              className={filterClass}
            >
              <option value="">All statuses</option>
              {COLLECTION_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {prettyStatus(s)}
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
              <option value="">All suppliers</option>
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>

            <input
              type="date"
              value={from}
              onChange={(e) => {
                setFrom(e.target.value)
                setPage(1)
              }}
              aria-label="From date"
              className={filterClass}
            />

            <input
              type="date"
              value={to}
              onChange={(e) => {
                setTo(e.target.value)
                setPage(1)
              }}
              aria-label="To date"
              className={filterClass}
            />
          </div>
        </div>

        {collectionsQuery.isLoading ? (
          <LoadingState label="Loading collection records..." />
        ) : collectionsQuery.isError ? (
          <ErrorState error={collectionsQuery.error} onRetry={() => collectionsQuery.refetch()} />
        ) : collections.length === 0 ? (
          hasFilters ? (
            <EmptyState title="No collections match your filters." description="Try a different search or clear the filters." />
          ) : (
            <div className="p-8 text-center">
              <p className="text-sm text-gray-500">
                No coffee collections have been recorded
                yet.
              </p>

              {canCreate && (
                <button
                  type="button"
                  onClick={openCreate}
                  className="mt-3 text-sm font-medium text-black underline"
                >
                  Record your first collection
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
                    Date
                  </th>

                  <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                    Supplier
                  </th>

                  <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                    Location
                  </th>

                  <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                    Coffee
                  </th>

                  <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                    Quantity
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
                {collections.map((collection) => (
                  <tr
                    key={collection.id}
                    className="hover:bg-gray-50"
                  >
                    <td className="whitespace-nowrap px-6 py-4">
                      <button
                        type="button"
                        onClick={() => setViewId(collection.id)}
                        className="rounded-md bg-gray-100 px-2 py-1 text-xs font-semibold text-gray-700 hover:bg-gray-200"
                      >
                        {collection.collection_code}
                      </button>
                    </td>

                    <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-600">
                      {formatDate(collection.collection_date)}
                      {collection.field_officer?.full_name && (
                        <div className="text-xs text-gray-400">
                          by {collection.field_officer.full_name}
                        </div>
                      )}
                    </td>

                    <td className="px-6 py-4">
                      <div className="font-medium text-gray-900">
                        {collection.supplier?.name ||
                          '—'}
                      </div>

                      {(collection.farmer?.name || collection.supplier?.supplier_code) && (
                        <div className="mt-1 text-xs text-gray-500">
                          {collection.farmer?.name
                            ? `Farmer: ${collection.farmer.name}`
                            : collection.supplier?.supplier_code}
                        </div>
                      )}
                    </td>

                    <td className="px-6 py-4 text-sm text-gray-600">
                      <div>
                        {collection.location?.name || collection.zone || '—'}
                      </div>

                      <div className="text-xs text-gray-400">
                        {collection.location ? [collection.zone, collection.region].filter(Boolean).join(', ') : collection.region || '—'}
                      </div>
                    </td>

                    <td className="px-6 py-4 text-sm text-gray-600">
                      <div>
                        {collection.coffee_type ||
                          '—'}
                        {collection.grade ? ` · ${collection.grade}` : ''}
                      </div>

                      {collection.processing_method && (
                        <div className="text-xs text-gray-400">
                          {methodLabel(collection.processing_method)}
                        </div>
                      )}
                    </td>

                    <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-600">
                      {formatKg(collection.quantity_kg)}
                    </td>

                    <td className="whitespace-nowrap px-6 py-4">
                      <StatusBadge status={collection.status} />
                    </td>

                    <td className="whitespace-nowrap px-6 py-4 text-right text-sm">
                      <div className="flex items-center justify-end gap-3">
                        {canUpdate && (
                          <StatusActions
                            entity="collection"
                            status={collection.status}
                            disabled={busy}
                            onChange={(next) => changeStatus(collection, next)}
                          />
                        )}

                        <button
                          type="button"
                          onClick={() => setViewId(collection.id)}
                          className="font-medium text-gray-700 hover:underline"
                        >
                          View
                        </button>

                        {canUpdate && collection.status !== 'rejected' && (
                          <button
                            type="button"
                            onClick={() => openEdit(collection)}
                            disabled={busy}
                            className="font-medium text-gray-700 hover:underline disabled:opacity-50"
                          >
                            Edit
                          </button>
                        )}

                        {canDelete && (
                          <button
                            type="button"
                            onClick={() => handleDelete(collection)}
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

      <CollectionDetailModal
        id={viewId}
        onClose={() => setViewId(null)}
        canUpdate={canUpdate}
        busy={busy}
        onEdit={openEdit}
        onStatus={changeStatus}
      />

      {dialog}
    </div>
  )
}

function CollectionDetailModal({
  id,
  onClose,
  canUpdate,
  busy,
  onEdit,
  onStatus,
}: {
  id: string | null
  onClose: () => void
  canUpdate: boolean
  busy: boolean
  onEdit: (c: CollectionRecord) => void
  onStatus: (c: Pick<CollectionRecord, 'id' | 'collection_code' | 'status'>, next: string) => void
}) {
  const query = useCollection(id)
  const c = query.data

  return (
    <Modal
      open={Boolean(id)}
      onClose={onClose}
      size="xl"
      title={
        c ? (
          <span className="flex items-center gap-3">
            {c.collection_code} <StatusBadge status={c.status} />
          </span>
        ) : (
          'Collection details'
        )
      }
      footer={
        c && canUpdate ? (
          <div className="flex items-center gap-3">
            <StatusActions entity="collection" status={c.status} disabled={busy} onChange={(next) => onStatus(c, next)} />
            {c.status !== 'rejected' && (
              <button
                type="button"
                onClick={() => onEdit(c)}
                className="rounded-lg bg-black px-4 py-2 text-sm font-medium text-white hover:bg-gray-800"
              >
                Edit Collection
              </button>
            )}
          </div>
        ) : undefined
      }
    >
      {query.isLoading ? (
        <LoadingState label="Loading collection..." />
      ) : query.isError ? (
        <ErrorState error={query.error} onRetry={() => query.refetch()} />
      ) : c ? (
        <div className="space-y-6">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <SummaryCard label="Collected" value={formatKg(c.quantity_kg)} />
            <SummaryCard label="In lots" value={formatKg(c.lotted_kg)} hint={`${c.lots.length} lot${c.lots.length !== 1 ? 's' : ''}`} />
            <SummaryCard label="Remaining" value={formatKg(c.remaining_kg)} />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Field label="Collection date" value={formatDate(c.collection_date)} />
            <Field label="Field officer" value={c.field_officer?.full_name} />
            <Field label="Recorded" value={formatDateTime(c.created_at)} />
            <Field label="Supplier" value={c.supplier ? `${c.supplier.supplier_code} - ${c.supplier.name}` : null} />
            <Field label="Farmer" value={c.farmer ? `${c.farmer.farmer_code} - ${c.farmer.name}` : null} />
            <Field label="Farm" value={c.farm ? `${c.farm.farm_code} - ${c.farm.farm_name}` : null} />
            <Field label="Location" value={c.location?.name} />
            <Field label="Origin" value={c.origin} />
            <Field
              label="Area"
              value={[c.kebele, c.woreda, c.zone, c.region].filter(Boolean).join(', ')}
            />
            <Field label="Coffee type" value={c.coffee_type} />
            <Field label="Variety" value={c.variety} />
            <Field label="Processing method" value={methodLabel(c.processing_method)} />
            <Field label="Grade" value={c.grade} />
            <Field
              label="Purchase price"
              value={c.purchase_price !== null && c.purchase_price !== undefined ? formatMoney(c.purchase_price, c.currency) : null}
            />
            <Field label="Status" value={<StatusBadge status={c.status} />} />
            <div className="sm:col-span-3">
              <Field label="Notes" value={c.notes ? <span className="whitespace-pre-line">{c.notes}</span> : null} />
            </div>
          </div>

          <div>
            <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-gray-700">Lots Created From This Collection</h3>
            {c.lots.length === 0 ? (
              <p className="text-sm text-gray-500">No lots have been created from this collection yet.</p>
            ) : (
              <div className="overflow-x-auto rounded-lg border border-gray-200">
                <table className="min-w-full divide-y divide-gray-200 text-sm">
                  <thead className="bg-gray-50 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                    <tr>
                      <th className="px-4 py-2">Lot</th>
                      <th className="px-4 py-2 text-right">Quantity</th>
                      <th className="px-4 py-2">Grade</th>
                      <th className="px-4 py-2">Processing</th>
                      <th className="px-4 py-2">Status</th>
                      <th className="px-4 py-2">Created</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {c.lots.map((l) => (
                      <tr key={l.id}>
                        <td className="px-4 py-2 font-medium text-gray-900">{l.lot_code}</td>
                        <td className="px-4 py-2 text-right">{formatKg(l.quantity_kg)}</td>
                        <td className="px-4 py-2 text-gray-600">{l.grade || '—'}</td>
                        <td className="px-4 py-2 text-gray-600">{methodLabel(l.processing_method) || '—'}</td>
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
