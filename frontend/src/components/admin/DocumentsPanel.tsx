import { useState, type FormEvent } from 'react'
import { useAuth } from '../../contexts/AuthContext'
import { openDocument, useDocumentActions, useDocuments } from '../../queries/admin'
import type { DocumentRelatedType, DocumentType } from '../../types'
import { EmptyState, ErrorState, LoadingState, formatDate, prettyStatus, useConfirm, useFlash } from './ui'

export const DOCUMENT_TYPE_OPTIONS: { value: DocumentType; label: string }[] = [
  { value: 'commercial_invoice', label: 'Commercial Invoice' },
  { value: 'invoice', label: 'Invoice' },
  { value: 'packing_list', label: 'Packing List' },
  { value: 'bill_of_lading', label: 'Bill of Lading' },
  { value: 'certificate_of_origin', label: 'Certificate of Origin' },
  { value: 'phytosanitary_certificate', label: 'Phytosanitary Certificate' },
  { value: 'quality_certificate', label: 'Quality Certificate' },
  { value: 'certificate', label: 'Certificate' },
  { value: 'export_permit', label: 'Export Permit' },
  { value: 'quotation', label: 'Quotation' },
  { value: 'contract', label: 'Contract' },
  { value: 'product_specification', label: 'Product Specification' },
  { value: 'quality_document', label: 'Quality Document' },
  { value: 'other', label: 'Other' },
]

/** Departments allowed to attach to each record type (mirrors the API). */
const ATTACH_RULES: Record<string, DocumentRelatedType[]> = {
  sales: ['quote_request', 'sample_request', 'customer', 'sales_order', 'product'],
  quality_officer: ['coffee_lot', 'quality_inspection'],
  quality: ['coffee_lot', 'quality_inspection'],
  warehouse_officer: ['warehouse', 'coffee_lot'],
  warehouse: ['warehouse', 'coffee_lot'],
  field_officer: ['coffee_lot', 'collection', 'supplier', 'farmer'],
  procurement: ['coffee_lot', 'collection', 'supplier', 'farmer'],
}

export function canAttachDocument(role: string | null | undefined, relatedType: DocumentRelatedType) {
  if (!role) return false
  if (['admin', 'super_admin', 'export_manager'].includes(role)) return true
  return (ATTACH_RULES[role] ?? []).includes(relatedType)
}

/**
 * Documents attached to one record: list, open (signed link), upload, delete.
 * Files go to the private "documents" storage bucket through the API.
 */
export default function DocumentsPanel({
  relatedType,
  relatedId,
  defaultType = 'other',
  title = 'Documents',
}: {
  relatedType: DocumentRelatedType
  relatedId: string
  defaultType?: DocumentType
  title?: string
}) {
  const { role, profile, isAdmin } = useAuth()
  const { data, isLoading, error, refetch } = useDocuments({ related_type: relatedType, related_id: relatedId, limit: 100 })
  const actions = useDocumentActions()
  const { confirm, dialog } = useConfirm()
  const flash = useFlash()
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ title: '', document_type: defaultType as string, file: null as File | null, file_url: '' })
  const canUpload = canAttachDocument(role, relatedType)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!form.title.trim()) return flash.error(new Error('Enter a document title.'))
    if (!form.file && !form.file_url.trim()) return flash.error(new Error('Choose a file or enter an https link.'))
    try {
      await actions.create.mutateAsync({
        title: form.title.trim(),
        document_type: form.document_type,
        related_type: relatedType,
        related_id: relatedId,
        file: form.file,
        file_url: form.file ? undefined : form.file_url.trim(),
      })
      setForm({ title: '', document_type: defaultType, file: null, file_url: '' })
      setShowForm(false)
      flash.success('Document added.')
    } catch (err) {
      flash.error(err, 'Could not upload the document.')
    }
  }

  const open = async (id: string) => {
    try {
      await openDocument(id)
    } catch (err) {
      flash.error(err, 'Could not open the document.')
    }
  }

  const remove = async (id: string, name: string) => {
    if (!(await confirm({ title: 'Delete document', message: `Delete "${name}"? The file is removed permanently.`, confirmLabel: 'Delete', danger: true }))) return
    try {
      await actions.remove.mutateAsync(id)
      flash.success('Document deleted.')
    } catch (err) {
      flash.error(err, 'Could not delete the document.')
    }
  }

  const docs = data?.data ?? []

  return (
    <div className="rounded-xl border border-gray-200 bg-white">
      {dialog}
      <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-gray-700">{title}</h3>
        {canUpload && (
          <button type="button" onClick={() => setShowForm((v) => !v)} className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50">
            {showForm ? 'Close' : '+ Add document'}
          </button>
        )}
      </div>
      {flash.banner && <div className="px-4 pt-3">{flash.banner}</div>}

      {showForm && (
        <form onSubmit={submit} className="grid grid-cols-1 gap-3 border-b border-gray-200 p-4 md:grid-cols-2">
          <input
            placeholder="Title *"
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-black"
          />
          <select
            value={form.document_type}
            onChange={(e) => setForm({ ...form, document_type: e.target.value })}
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-black"
          >
            {DOCUMENT_TYPE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          <input
            type="file"
            accept=".pdf,.png,.jpg,.jpeg,.webp,.doc,.docx,.xls,.xlsx,.csv,.txt"
            onChange={(e) => setForm({ ...form, file: e.target.files?.[0] ?? null })}
            className="text-sm"
          />
          <input
            placeholder="…or an https link"
            value={form.file_url}
            disabled={Boolean(form.file)}
            onChange={(e) => setForm({ ...form, file_url: e.target.value })}
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-black disabled:bg-gray-50"
          />
          <div className="md:col-span-2 flex justify-end">
            <button type="submit" disabled={actions.create.isPending} className="rounded-lg bg-black px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50">
              {actions.create.isPending ? 'Uploading…' : 'Upload'}
            </button>
          </div>
        </form>
      )}

      {isLoading ? (
        <LoadingState label="Loading documents…" />
      ) : error ? (
        <ErrorState error={error} onRetry={() => refetch()} />
      ) : docs.length === 0 ? (
        <EmptyState title="No documents yet" />
      ) : (
        <ul className="divide-y divide-gray-100">
          {docs.map((d) => (
            <li key={d.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-gray-900">{d.title}</p>
                <p className="text-xs text-gray-500">
                  {prettyStatus(d.document_type)} · {formatDate(d.created_at)}
                  {d.uploader?.full_name ? ` · ${d.uploader.full_name}` : ''}
                  {d.is_public ? ' · Public' : ''}
                </p>
              </div>
              <div className="flex gap-2">
                {(d.file_path || d.file_url) && (
                  <button type="button" onClick={() => open(d.id)} className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50">
                    Open
                  </button>
                )}
                {(isAdmin || d.uploaded_by === profile?.id) && (
                  <button type="button" onClick={() => remove(d.id, d.title)} className="rounded-lg border border-red-200 bg-white px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50">
                    Delete
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
