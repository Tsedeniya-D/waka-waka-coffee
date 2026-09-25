import { useMemo, useState, type FormEvent } from 'react'
import { DOCUMENT_TYPE_OPTIONS, canAttachDocument } from '../../components/admin/DocumentsPanel'
import {
  EmptyState,
  ErrorState,
  LoadingState,
  Modal,
  Pagination,
  formatDate,
  prettyStatus,
  useConfirm,
  useFlash,
} from '../../components/admin/ui'
import { useAuth } from '../../contexts/AuthContext'
import { useDebounce } from '../../hooks'
import { canonicalRole, type AdminModule } from '../../lib/permissions'
import {
  openDocument,
  useCollections,
  useCustomers,
  useDocumentActions,
  useDocuments,
  useExportBatches,
  useFarmers,
  useInspections,
  useLots,
  useProductsAdmin,
  useQuoteRequests,
  useSalesOrders,
  useSampleRequests,
  useShipments,
  useSuppliers,
  useWarehouses,
} from '../../queries/admin'
import type { Document, DocumentRelatedType, DocumentType } from '../../types'

const PAGE_SIZE = 200
const MAX_FILE_MB = 20
const ALLOWED_EXTENSIONS = ['pdf', 'png', 'jpg', 'jpeg', 'webp', 'doc', 'docx', 'xls', 'xlsx', 'csv', 'txt']

const RELATED_TYPE_LABELS: Record<DocumentRelatedType, string> = {
  general: 'General',
  shipment: 'Shipment',
  export_batch: 'Export Batch',
  sales_order: 'Sales Order',
  quote_request: 'Quote Request',
  sample_request: 'Sample Request',
  customer: 'Customer',
  coffee_lot: 'Coffee Lot',
  quality_inspection: 'Quality Inspection',
  warehouse: 'Warehouse',
  product: 'Product',
  supplier: 'Supplier',
  farmer: 'Farmer',
  collection: 'Collection',
}
const RELATED_TYPES = Object.keys(RELATED_TYPE_LABELS) as DocumentRelatedType[]

const documentTypeLabel = (type: string) => DOCUMENT_TYPE_OPTIONS.find((o) => o.value === type)?.label ?? prettyStatus(type)

function formatFileSize(bytes: number | null): string {
  if (!bytes) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

// -----------------------------------------------------------------------------
// Related record picker: one list hook per record type.
// -----------------------------------------------------------------------------
type Option = { value: string; label: string }
type OptionsResult = { options: Option[]; isLoading: boolean; error: unknown; refetch: () => unknown }
type PickerType = Exclude<DocumentRelatedType, 'general'>

function toResult<T>(
  q: { data?: { data: T[] }; isLoading: boolean; error: unknown; refetch: () => unknown },
  map: (row: T) => Option
): OptionsResult {
  return { options: (q.data?.data ?? []).map(map), isLoading: q.isLoading, error: q.error, refetch: q.refetch }
}

const pickerParams = (search: string) => ({ search: search || undefined, limit: 50 })

const PICKERS: Record<PickerType, { module: AdminModule; useOptions: (search: string) => OptionsResult }> = {
  shipment: {
    module: 'shipments',
    useOptions: (s) =>
      toResult(useShipments(pickerParams(s)), (r) => ({
        value: r.id,
        label: `${r.shipment_number}${r.destination_country ? ` - ${r.destination_country}` : ''} (${prettyStatus(r.status)})`,
      })),
  },
  export_batch: {
    module: 'export_batches',
    useOptions: (s) =>
      toResult(useExportBatches(pickerParams(s)), (r) => ({
        value: r.id,
        label: `${r.batch_number}${r.sales_order?.order_number ? ` - ${r.sales_order.order_number}` : ''} (${prettyStatus(r.status)})`,
      })),
  },
  sales_order: {
    module: 'orders',
    useOptions: (s) =>
      toResult(useSalesOrders(pickerParams(s)), (r) => ({
        value: r.id,
        label: `${r.order_number}${r.customer?.company_name ? ` - ${r.customer.company_name}` : ''} (${prettyStatus(r.status)})`,
      })),
  },
  quote_request: {
    module: 'quote_requests',
    useOptions: (s) =>
      toResult(useQuoteRequests(pickerParams(s)), (r) => ({ value: r.id, label: `${r.reference_number} - ${r.company || r.full_name}` })),
  },
  sample_request: {
    module: 'sample_requests',
    useOptions: (s) =>
      toResult(useSampleRequests(pickerParams(s)), (r) => ({ value: r.id, label: `${r.reference_number} - ${r.company || r.full_name}` })),
  },
  customer: {
    module: 'customers',
    useOptions: (s) => toResult(useCustomers(pickerParams(s)), (r) => ({ value: r.id, label: `${r.customer_code} - ${r.company_name}` })),
  },
  coffee_lot: {
    module: 'lots',
    useOptions: (s) => toResult(useLots(pickerParams(s)), (r) => ({ value: r.id, label: `${r.lot_code} - ${r.origin}` })),
  },
  quality_inspection: {
    module: 'quality',
    useOptions: (s) =>
      toResult(useInspections(pickerParams(s)), (r) => ({
        value: r.id,
        label: `${r.lot?.lot_code ?? 'Lot'} - ${formatDate(r.inspection_date)} (${prettyStatus(r.result)})`,
      })),
  },
  warehouse: {
    module: 'warehouses',
    useOptions: (s) => toResult(useWarehouses(pickerParams(s)), (r) => ({ value: r.id, label: `${r.code} - ${r.name}` })),
  },
  product: {
    module: 'products',
    useOptions: (s) => toResult(useProductsAdmin(pickerParams(s)), (r) => ({ value: r.id, label: r.name })),
  },
  supplier: {
    module: 'suppliers',
    useOptions: (s) => toResult(useSuppliers(pickerParams(s)), (r) => ({ value: r.id, label: `${r.supplier_code} - ${r.name}` })),
  },
  farmer: {
    module: 'farmers',
    useOptions: (s) => toResult(useFarmers(pickerParams(s)), (r) => ({ value: r.id, label: `${r.farmer_code} - ${r.name}` })),
  },
  collection: {
    module: 'collection',
    useOptions: (s) =>
      toResult(useCollections(pickerParams(s)), (r) => ({ value: r.id, label: `${r.collection_code} - ${formatDate(r.collection_date)}` })),
  },
}

/** Remounted (via key) whenever the record type changes, so the hook order is stable. */
function RelatedRecordPicker({ relatedType, value, onChange }: { relatedType: PickerType; value: string; onChange: (id: string) => void }) {
  const [search, setSearch] = useState('')
  const debounced = useDebounce(search.trim(), { delay: 300 })
  const { options, isLoading, error, refetch } = PICKERS[relatedType].useOptions(debounced)
  const label = RELATED_TYPE_LABELS[relatedType]

  return (
    <div className="space-y-2">
      <input
        type="text"
        value={search}
        onChange={(event) => setSearch(event.target.value)}
        placeholder={`Search ${label.toLowerCase()}s...`}
        className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm outline-none focus:border-black"
      />
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        disabled={isLoading}
        className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm outline-none focus:border-black"
      >
        <option value="">{isLoading ? 'Loading...' : `Select ${label.toLowerCase()}`}</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      {Boolean(error) && (
        <p className="text-xs text-red-600">
          Could not load records.{' '}
          <button type="button" className="underline" onClick={() => refetch()}>
            Try again
          </button>
        </p>
      )}
      {!isLoading && !error && options.length === 0 && <p className="text-xs text-amber-600">No matching records.</p>}
    </div>
  )
}

// -----------------------------------------------------------------------------
// Page
// -----------------------------------------------------------------------------
const emptyForm = {
  title: '',
  document_type: 'commercial_invoice' as DocumentType,
  related_type: 'shipment' as DocumentRelatedType,
  related_id: '',
  file: null as File | null,
  file_url: '',
  is_public: false,
  notes: '',
}

type EditState = { doc: Document; title: string; document_type: DocumentType; is_public: boolean; notes: string }

export default function AdminDocuments() {
  const { role, profile, isAdmin, can, canAccess } = useAuth()
  const canonical = canonicalRole(role)
  const canManageAll = isAdmin || canonical === 'export_manager'
  const canCreate = can('documents', 'create')

  const flash = useFlash()
  const { confirm, dialog } = useConfirm()
  const actions = useDocumentActions()

  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState('all')
  const [relatedFilter, setRelatedFilter] = useState('all')
  const [visibilityFilter, setVisibilityFilter] = useState('all')
  const [page, setPage] = useState(1)
  const debouncedSearch = useDebounce(search.trim(), { delay: 350 })

  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState(emptyForm)
  const [fileInputKey, setFileInputKey] = useState(0)
  const [editing, setEditing] = useState<EditState | null>(null)

  const documentsQuery = useDocuments({
    page,
    limit: PAGE_SIZE,
    search: debouncedSearch || undefined,
    document_type: typeFilter === 'all' ? undefined : typeFilter,
    related_type: relatedFilter === 'all' ? undefined : relatedFilter,
    is_public: visibilityFilter === 'all' ? undefined : visibilityFilter === 'public',
  })

  const documents = documentsQuery.data?.data ?? []
  const meta = documentsQuery.data?.meta
  const total = meta?.total ?? documents.length

  const summary = useMemo(
    () => ({
      withFiles: documents.filter((d) => Boolean(d.file_path)).length,
      links: documents.filter((d) => !d.file_path && Boolean(d.file_url)).length,
      public: documents.filter((d) => d.is_public).length,
    }),
    [documents]
  )
  const partial = total > documents.length

  /** Record types this role may attach documents to (and can look up). */
  const attachableTypes = useMemo(
    () =>
      RELATED_TYPES.filter(
        (t) => canAttachDocument(role, t) && (t === 'general' || canAccess(PICKERS[t as PickerType].module))
      ),
    [role, canAccess]
  )

  function setFilter(setter: (v: string) => void, value: string) {
    setter(value)
    setPage(1)
  }

  function openForm() {
    const related_type = attachableTypes.includes('shipment') ? 'shipment' : attachableTypes[0] ?? 'general'
    setForm({ ...emptyForm, related_type })
    setFileInputKey((k) => k + 1)
    flash.clear()
    setShowForm(true)
  }

  function closeForm() {
    setShowForm(false)
  }

  function chooseFile(file: File | null) {
    if (file) {
      const ext = /\.([a-z0-9]+)$/i.exec(file.name)?.[1]?.toLowerCase() ?? ''
      if (!ALLOWED_EXTENSIONS.includes(ext)) {
        flash.error(new Error(`File type .${ext || '?'} is not allowed. Allowed: ${ALLOWED_EXTENSIONS.join(', ')}.`))
        setFileInputKey((k) => k + 1)
        return
      }
      if (file.size > MAX_FILE_MB * 1024 * 1024) {
        flash.error(new Error(`The file is larger than ${MAX_FILE_MB} MB.`))
        setFileInputKey((k) => k + 1)
        return
      }
    }
    setForm((current) => ({ ...current, file, file_url: file ? '' : current.file_url }))
  }

  async function addDocument(event: FormEvent) {
    event.preventDefault()
    if (!form.title.trim()) return flash.error(new Error('Document title is required.'))
    if (form.related_type !== 'general' && !form.related_id) {
      return flash.error(new Error(`Choose the ${RELATED_TYPE_LABELS[form.related_type].toLowerCase()} this document belongs to.`))
    }
    const link = form.file_url.trim()
    if (!form.file && !link) return flash.error(new Error('Choose a file to upload or enter an https link.'))
    if (!form.file && !/^https:\/\/\S+$/i.test(link)) return flash.error(new Error('Links must start with https://.'))

    try {
      const created = await actions.create.mutateAsync({
        title: form.title.trim(),
        document_type: form.document_type,
        related_type: form.related_type,
        related_id: form.related_type === 'general' ? null : form.related_id,
        is_public: canManageAll ? form.is_public : false,
        notes: form.notes.trim() || undefined,
        file: form.file,
        file_url: form.file ? undefined : link,
      })
      flash.success(`Document "${created.title}" added successfully.`)
      setShowForm(false)
      setForm(emptyForm)
    } catch (err) {
      flash.error(err, 'Failed to add document.')
    }
  }

  async function open(doc: Document) {
    try {
      await openDocument(doc.id)
    } catch (err) {
      flash.error(err, 'Could not open the document.')
    }
  }

  async function saveEdit(event: FormEvent) {
    event.preventDefault()
    if (!editing) return
    if (!editing.title.trim()) return flash.error(new Error('Document title is required.'))
    const body: Record<string, unknown> = {
      title: editing.title.trim(),
      document_type: editing.document_type,
      notes: editing.notes.trim() || null,
    }
    if (canManageAll) body.is_public = editing.is_public
    try {
      await actions.update.mutateAsync({ id: editing.doc.id, body })
      flash.success('Document updated.')
      setEditing(null)
    } catch (err) {
      flash.error(err, 'Failed to update document.')
    }
  }

  async function deleteDocument(doc: Document) {
    const ok = await confirm({
      title: 'Delete document',
      message: `Delete "${doc.title}"?${doc.file_path ? ' The stored file is removed permanently.' : ''}`,
      confirmLabel: 'Delete',
      danger: true,
    })
    if (!ok) return
    try {
      await actions.remove.mutateAsync(doc.id)
      flash.success('Document deleted successfully.')
    } catch (err) {
      flash.error(err, 'Failed to delete document.')
    }
  }

  const canEdit = (doc: Document) => canManageAll || (Boolean(profile?.id) && doc.uploaded_by === profile?.id)
  const canDelete = (doc: Document) => isAdmin || (Boolean(profile?.id) && doc.uploaded_by === profile?.id)

  return (
    <div className="space-y-6">
      {dialog}

      {/* Header */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Documents</h1>

          <p className="text-sm text-gray-500">Manage export, shipment, sales, quality and sourcing documents.</p>
        </div>

        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => documentsQuery.refetch()}
            disabled={documentsQuery.isFetching}
            className="rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            {documentsQuery.isFetching ? 'Refreshing...' : 'Refresh'}
          </button>

          {canCreate && attachableTypes.length > 0 && (
            <button
              type="button"
              onClick={openForm}
              className="rounded-lg bg-black px-4 py-2.5 text-sm font-medium text-white hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Add Document
            </button>
          )}
        </div>
      </div>

      {/* Messages */}
      {flash.banner}

      {/* Summary */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
        <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <p className="text-sm text-gray-500">Total Documents</p>
          <p className="mt-2 text-2xl font-bold text-gray-900">{documentsQuery.isLoading ? '…' : total}</p>
          <p className="mt-1 text-xs text-gray-500">Matching the current filters</p>
        </div>

        <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <p className="text-sm text-gray-500">Documents With Files</p>
          <p className="mt-2 text-2xl font-bold text-gray-900">{documentsQuery.isLoading ? '…' : summary.withFiles}</p>
          <p className="mt-1 text-xs text-gray-500">{partial ? 'On this page' : 'Uploaded to private storage'}</p>
        </div>

        <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <p className="text-sm text-gray-500">External Links</p>
          <p className="mt-2 text-2xl font-bold text-gray-900">{documentsQuery.isLoading ? '…' : summary.links}</p>
          <p className="mt-1 text-xs text-gray-500">{partial ? 'On this page' : 'Registered https links'}</p>
        </div>

        <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <p className="text-sm text-gray-500">Public Documents</p>
          <p className="mt-2 text-2xl font-bold text-gray-900">{documentsQuery.isLoading ? '…' : summary.public}</p>
          <p className="mt-1 text-xs text-gray-500">{partial ? 'On this page' : 'Downloadable from the website'}</p>
        </div>
      </div>

      {/* Add Document Form */}
      {showForm && canCreate && (
        <form onSubmit={addDocument} className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
          <h2 className="mb-5 text-sm font-semibold uppercase tracking-wide text-gray-700">Add Document</h2>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <label className="mb-2 block text-sm font-medium text-gray-700">Title *</label>
              <input
                type="text"
                value={form.title}
                maxLength={200}
                onChange={(event) => setForm({ ...form, title: event.target.value })}
                placeholder="e.g. Commercial invoice SHP-2026-0001"
                className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm outline-none focus:border-black"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-gray-700">Document Type *</label>
              <select
                value={form.document_type}
                onChange={(event) => setForm({ ...form, document_type: event.target.value as DocumentType })}
                className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm outline-none focus:border-black"
              >
                {DOCUMENT_TYPE_OPTIONS.map((type) => (
                  <option key={type.value} value={type.value}>
                    {type.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-gray-700">Belongs To *</label>
              <select
                value={form.related_type}
                onChange={(event) => setForm({ ...form, related_type: event.target.value as DocumentRelatedType, related_id: '' })}
                className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm outline-none focus:border-black"
              >
                {attachableTypes.map((type) => (
                  <option key={type} value={type}>
                    {type === 'general' ? 'General (not linked to a record)' : RELATED_TYPE_LABELS[type]}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-gray-700">
                {form.related_type === 'general' ? 'Record' : `${RELATED_TYPE_LABELS[form.related_type]} *`}
              </label>
              {form.related_type === 'general' ? (
                <p className="rounded-lg border border-dashed border-gray-300 px-3 py-2.5 text-sm text-gray-500">
                  General documents are not linked to a record.
                </p>
              ) : (
                <RelatedRecordPicker
                  key={form.related_type}
                  relatedType={form.related_type}
                  value={form.related_id}
                  onChange={(related_id) => setForm((current) => ({ ...current, related_id }))}
                />
              )}
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-gray-700">File</label>
              <input
                key={fileInputKey}
                type="file"
                accept={ALLOWED_EXTENSIONS.map((e) => `.${e}`).join(',')}
                onChange={(event) => chooseFile(event.target.files?.[0] ?? null)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-black"
              />
              <p className="mt-1 text-xs text-gray-500">
                PDF, PNG, JPG, WEBP, DOC, DOCX, XLS, XLSX, CSV or TXT, up to {MAX_FILE_MB} MB. Stored in private storage.
                {form.file ? ` Selected: ${form.file.name} (${formatFileSize(form.file.size)}).` : ''}
              </p>
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-gray-700">…or Link</label>
              <input
                type="url"
                value={form.file_url}
                disabled={Boolean(form.file)}
                onChange={(event) => setForm({ ...form, file_url: event.target.value })}
                placeholder="https://..."
                className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm outline-none focus:border-black disabled:bg-gray-50"
              />
              <p className="mt-1 text-xs text-gray-500">Use a link only for documents hosted elsewhere (https only).</p>
            </div>

            <div className="md:col-span-2">
              <label className="mb-2 block text-sm font-medium text-gray-700">Notes</label>
              <textarea
                rows={3}
                value={form.notes}
                maxLength={2000}
                onChange={(event) => setForm({ ...form, notes: event.target.value })}
                className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm outline-none focus:border-black"
              />
            </div>

            {canManageAll && (
              <div className="md:col-span-2">
                <label className="flex items-start gap-2 text-sm text-gray-700">
                  <input
                    type="checkbox"
                    checked={form.is_public}
                    onChange={(event) => setForm({ ...form, is_public: event.target.checked })}
                    className="mt-0.5"
                  />
                  <span>
                    <span className="font-medium">Public document</span>
                    <span className="block text-xs text-gray-500">
                      Public documents, such as product specifications, can be downloaded from the website. Everything else stays private and
                      is only opened by staff through short-lived links.
                    </span>
                  </span>
                </label>
              </div>
            )}
          </div>

          <div className="mt-6 flex gap-2">
            <button
              type="submit"
              disabled={actions.create.isPending}
              className="rounded-lg bg-black px-4 py-2.5 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50"
            >
              {actions.create.isPending ? (form.file ? 'Uploading...' : 'Saving...') : 'Add Document'}
            </button>

            <button
              type="button"
              onClick={closeForm}
              className="rounded-lg border border-gray-300 px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {/* Search / Filter */}
      <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
          <div>
            <label className="mb-2 block text-sm font-medium text-gray-700">Search</label>
            <input
              type="text"
              value={search}
              onChange={(event) => setFilter(setSearch, event.target.value)}
              placeholder="Title, file name, notes..."
              className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm outline-none focus:border-black"
            />
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium text-gray-700">Document Type</label>
            <select
              value={typeFilter}
              onChange={(event) => setFilter(setTypeFilter, event.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm outline-none focus:border-black"
            >
              <option value="all">All Document Types</option>
              {DOCUMENT_TYPE_OPTIONS.map((type) => (
                <option key={type.value} value={type.value}>
                  {type.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium text-gray-700">Related Record</label>
            <select
              value={relatedFilter}
              onChange={(event) => setFilter(setRelatedFilter, event.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm outline-none focus:border-black"
            >
              <option value="all">All Records</option>
              {RELATED_TYPES.map((type) => (
                <option key={type} value={type}>
                  {RELATED_TYPE_LABELS[type]}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium text-gray-700">Visibility</label>
            <select
              value={visibilityFilter}
              onChange={(event) => setFilter(setVisibilityFilter, event.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm outline-none focus:border-black"
            >
              <option value="all">Public and Private</option>
              <option value="public">Public</option>
              <option value="private">Private</option>
            </select>
          </div>
        </div>
      </div>

      {/* Documents Table */}
      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        {documentsQuery.isLoading ? (
          <LoadingState label="Loading documents..." />
        ) : documentsQuery.error ? (
          <ErrorState error={documentsQuery.error} onRetry={() => documentsQuery.refetch()} />
        ) : documents.length === 0 ? (
          <EmptyState
            title="No documents found."
            description={
              debouncedSearch || typeFilter !== 'all' || relatedFilter !== 'all' || visibilityFilter !== 'all'
                ? 'Try different filters.'
                : 'Documents attached to shipments, orders and other records appear here.'
            }
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left font-semibold text-gray-700">Document</th>
                  <th className="px-6 py-3 text-left font-semibold text-gray-700">Related Record</th>
                  <th className="px-6 py-3 text-left font-semibold text-gray-700">File</th>
                  <th className="px-6 py-3 text-left font-semibold text-gray-700">Visibility</th>
                  <th className="px-6 py-3 text-left font-semibold text-gray-700">Uploaded By</th>
                  <th className="px-6 py-3 text-left font-semibold text-gray-700">Added</th>
                  <th className="px-6 py-3 text-right font-semibold text-gray-700">Actions</th>
                </tr>
              </thead>

              <tbody className="divide-y divide-gray-100">
                {documents.map((document) => (
                  <tr key={document.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4">
                      <div className="font-medium text-gray-900">{document.title}</div>
                      <div className="text-xs text-gray-500">{documentTypeLabel(document.document_type)}</div>
                    </td>

                    <td className="px-6 py-4">
                      <div className="text-gray-700">{RELATED_TYPE_LABELS[document.related_type] ?? prettyStatus(document.related_type)}</div>
                      {document.related_type !== 'general' && (
                        <div className="text-xs text-gray-500">{document.related_label || '—'}</div>
                      )}
                    </td>

                    <td className="px-6 py-4">
                      {document.file_path ? (
                        <>
                          <div className="max-w-[16rem] truncate text-gray-700">{document.file_name || 'File'}</div>
                          <div className="text-xs text-gray-500">{formatFileSize(document.file_size)}</div>
                        </>
                      ) : document.file_url ? (
                        <div className="text-gray-700">External link</div>
                      ) : (
                        <div className="text-gray-400">—</div>
                      )}
                    </td>

                    <td className="px-6 py-4">
                      <span
                        className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${
                          document.is_public ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-700'
                        }`}
                      >
                        {document.is_public ? 'Public' : 'Private'}
                      </span>
                    </td>

                    <td className="px-6 py-4 text-gray-600">{document.uploader?.full_name || '—'}</td>

                    <td className="px-6 py-4 text-gray-600">{formatDate(document.created_at)}</td>

                    <td className="px-6 py-4">
                      <div className="flex justify-end gap-2">
                        {(document.file_path || document.file_url) && (
                          <button
                            type="button"
                            onClick={() => open(document)}
                            className="rounded-lg border border-gray-300 px-3 py-2 text-xs font-medium text-gray-700 hover:bg-gray-50"
                          >
                            Open
                          </button>
                        )}

                        {canEdit(document) && (
                          <button
                            type="button"
                            onClick={() =>
                              setEditing({
                                doc: document,
                                title: document.title,
                                document_type: document.document_type,
                                is_public: document.is_public,
                                notes: document.notes ?? '',
                              })
                            }
                            className="rounded-lg border border-gray-300 px-3 py-2 text-xs font-medium text-gray-700 hover:bg-gray-50"
                          >
                            Edit
                          </button>
                        )}

                        {canDelete(document) && (
                          <button
                            type="button"
                            onClick={() => deleteDocument(document)}
                            disabled={actions.remove.isPending}
                            className="rounded-lg border border-red-200 px-3 py-2 text-xs font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
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
        {meta && <Pagination page={page} limit={PAGE_SIZE} total={meta.total} onPage={setPage} />}
      </div>

      {/* Edit metadata */}
      <Modal open={Boolean(editing)} size="md" title="Edit document" onClose={() => setEditing(null)}>
        {editing && (
          <form onSubmit={saveEdit} className="space-y-4">
            {flash.banner}
            <div>
              <label className="mb-2 block text-sm font-medium text-gray-700">Title *</label>
              <input
                type="text"
                value={editing.title}
                maxLength={200}
                onChange={(event) => setEditing({ ...editing, title: event.target.value })}
                className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm outline-none focus:border-black"
              />
            </div>
            <div>
              <label className="mb-2 block text-sm font-medium text-gray-700">Document Type</label>
              <select
                value={editing.document_type}
                onChange={(event) => setEditing({ ...editing, document_type: event.target.value as DocumentType })}
                className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm outline-none focus:border-black"
              >
                {DOCUMENT_TYPE_OPTIONS.map((type) => (
                  <option key={type.value} value={type.value}>
                    {type.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-2 block text-sm font-medium text-gray-700">Notes</label>
              <textarea
                rows={3}
                value={editing.notes}
                maxLength={2000}
                onChange={(event) => setEditing({ ...editing, notes: event.target.value })}
                className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm outline-none focus:border-black"
              />
            </div>
            {canManageAll && (
              <label className="flex items-start gap-2 text-sm text-gray-700">
                <input
                  type="checkbox"
                  checked={editing.is_public}
                  onChange={(event) => setEditing({ ...editing, is_public: event.target.checked })}
                  className="mt-0.5"
                />
                <span>
                  <span className="font-medium">Public document</span>
                  <span className="block text-xs text-gray-500">
                    Public documents, such as product specifications, can be downloaded from the website. Everything else stays private.
                  </span>
                </span>
              </label>
            )}
            <div className="flex justify-end gap-3 border-t border-gray-200 pt-4">
              <button
                type="button"
                onClick={() => setEditing(null)}
                className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={actions.update.isPending}
                className="rounded-lg bg-black px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50"
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
