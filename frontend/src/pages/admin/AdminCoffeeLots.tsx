import { useState } from 'react'
import { Link } from 'react-router-dom'

import { useAuth } from '../../contexts/AuthContext'
import { useDebounce } from '../../hooks'
import { downloadCsv } from '../../lib/api'
import { canonicalRole } from '../../lib/permissions'
import { useCollection, useCollections, useLot, useLotActions, useLots } from '../../queries/admin'
import type { CoffeeLot } from '../../types'
import {
  EmptyState,
  ErrorState,
  Field,
  LoadingState,
  Modal,
  StatusBadge,
  formatDate,
  formatKg,
  prettyStatus,
  useConfirm,
  useFlash,
} from '../../components/admin/ui'

type FormData = {
  collection_id: string
  quantity_kg: string
  processing_method: string
  grade: string
  notes: string
}

const initialForm: FormData = {
  collection_id: '',
  quantity_kg: '',
  processing_method: '',
  grade: '',
  notes: '',
}

const PROCESSING_METHODS = [
  { value: 'washed', label: 'Washed' },
  { value: 'natural', label: 'Natural' },
  { value: 'honey', label: 'Honey' },
  { value: 'anaerobic', label: 'Anaerobic' },
  { value: 'semi_washed', label: 'Semi-washed' },
]

const GRADES = ['Grade 1', 'Grade 2', 'Grade 3', 'Grade 4', 'Grade 5']

const STATUS_FILTERS = ['pending_quality', 'approved', 'rejected', 'in_warehouse', 'reserved', 'shipped']

/** Only sourcing staff create or correct lots; quality, warehouse and export teams view them. */
const LOT_EDITOR_ROLES = ['field_officer', 'procurement', 'admin', 'super_admin']

export default function AdminCoffeeLots() {
  const { role, isAdmin, can } = useAuth()
  const canonical = canonicalRole(role)
  const isLotEditorRole = Boolean(role && (LOT_EDITOR_ROLES.includes(role) || (canonical && LOT_EDITOR_ROLES.includes(canonical))))
  const canCreate = can('lots', 'create') && isLotEditorRole
  const canEdit = can('lots', 'update') && isLotEditorRole
  const canDelete = isAdmin && can('lots', 'delete')

  const [form, setForm] = useState<FormData>(initialForm)
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<CoffeeLot | null>(null)
  const [viewingId, setViewingId] = useState<string | null>(null)

  const [statusFilter, setStatusFilter] = useState('')
  const [search, setSearch] = useState('')
  const debouncedSearch = useDebounce(search, { delay: 400 })

  const flash = useFlash()
  const { confirm, dialog } = useConfirm()
  const actions = useLotActions()

  const lotsQuery = useLots({
    limit: 500,
    status: statusFilter || undefined,
    search: debouncedSearch.trim() || undefined,
  })
  const lots = lotsQuery.data?.data ?? []
  const total = lotsQuery.data?.meta.total ?? lots.length

  const collectionsQuery = useCollections({ status: 'submitted,verified,partially_processed', limit: 500 }, { enabled: canCreate || canEdit })
  const collections = collectionsQuery.data?.data ?? []

  const selectedCollection = useCollection(form.collection_id || null)
  const collection = selectedCollection.data

  // While editing, this lot's own quantity is already counted as "lotted" in the collection.
  const remainingKg = collection
    ? Number(collection.remaining_kg) + (editing && editing.collection_id === collection.id ? Number(editing.quantity_kg) : 0)
    : null

  const notesOnly = Boolean(editing && editing.status !== 'pending_quality')
  const saving = actions.create.isPending || actions.update.isPending

  function handleChange(e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) {
    const { name, value } = e.target
    setForm((prev) => ({ ...prev, [name]: value }))
  }

  function openCreate() {
    setEditing(null)
    setForm(initialForm)
    setShowForm(true)
    flash.clear()
  }

  function openEdit(lot: CoffeeLot) {
    setEditing(lot)
    setForm({
      collection_id: lot.collection_id,
      quantity_kg: String(lot.quantity_kg ?? ''),
      processing_method: lot.processing_method ?? '',
      grade: lot.grade ?? '',
      notes: lot.notes ?? '',
    })
    setShowForm(true)
    flash.clear()
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  function closeForm() {
    setShowForm(false)
    setEditing(null)
    setForm(initialForm)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    flash.clear()

    if (notesOnly && editing) {
      try {
        await actions.update.mutateAsync({ id: editing.id, body: { notes: form.notes.trim() || null } })
        flash.success(`Notes for lot ${editing.lot_code} updated.`)
        closeForm()
      } catch (err) {
        flash.error(err)
      }
      return
    }

    if (!form.collection_id || !form.quantity_kg) {
      flash.error(new Error('Please select a collection and enter the quantity.'))
      return
    }

    const quantity = Number(form.quantity_kg)
    if (!Number.isFinite(quantity) || quantity <= 0) {
      flash.error(new Error('Quantity must be greater than 0 kg.'))
      return
    }
    if (remainingKg !== null && quantity > remainingKg) {
      flash.error(new Error(`Only ${formatKg(remainingKg)} of this collection is still available for lots.`))
      return
    }

    const body = {
      quantity_kg: quantity,
      processing_method: form.processing_method || null,
      grade: form.grade.trim() || null,
      notes: form.notes.trim() || null,
    }

    try {
      if (editing) {
        const updated = await actions.update.mutateAsync({ id: editing.id, body })
        flash.success(`Coffee lot ${(updated as CoffeeLot).lot_code ?? editing.lot_code} updated.`)
      } else {
        // Status, supplier and origin come from the collection (set by the database).
        const created = (await actions.create.mutateAsync({ collection_id: form.collection_id, ...body })) as CoffeeLot
        flash.success(`Coffee lot created successfully. Lot Code: ${created.lot_code}. It is now pending quality inspection.`)
      }
      closeForm()
    } catch (err) {
      flash.error(err)
    }
  }

  async function handleDelete(lot: CoffeeLot) {
    const ok = await confirm({
      title: `Delete lot ${lot.lot_code}?`,
      message: 'This permanently removes the lot. Lots that have entered stock cannot be deleted.',
      danger: true,
      confirmLabel: 'Delete',
    })
    if (!ok) return
    try {
      await actions.remove.mutateAsync(lot.id)
      flash.success(`Coffee lot ${lot.lot_code} deleted.`)
      if (viewingId === lot.id) setViewingId(null)
    } catch (err) {
      flash.error(err)
    }
  }

  function downloadCSV() {
    if (lots.length === 0) {
      flash.error(new Error('There are no coffee lots to download.'))
      return
    }
    downloadCsv(
      `waka-coffee-lots-${new Date().toISOString().slice(0, 10)}.csv`,
      ['Lot Code', 'Collection Code', 'Supplier', 'Origin', 'Quantity (kg)', 'Processing Method', 'Grade', 'Status', 'Created At'],
      lots.map((lot) => [
        lot.lot_code,
        lot.collection?.collection_code ?? '',
        lot.supplier?.name ?? '',
        lot.origin,
        lot.quantity_kg,
        lot.processing_method ? prettyStatus(lot.processing_method) : '',
        lot.grade,
        prettyStatus(lot.status),
        formatDate(lot.created_at),
      ])
    )
  }

  function getSupplierName(lot: CoffeeLot) {
    return lot.supplier ? `${lot.supplier.supplier_code} — ${lot.supplier.name}` : 'Unknown supplier'
  }

  const inputClass = 'w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm outline-none focus:border-black disabled:bg-gray-50 disabled:text-gray-500'
  const selectClass = 'w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-black disabled:bg-gray-50 disabled:text-gray-500'

  const collectionOptions =
    editing && !collections.some((c) => c.id === editing.collection_id)
      ? [
          {
            id: editing.collection_id,
            collection_code: editing.collection?.collection_code ?? 'Current collection',
            origin: editing.origin,
            quantity_kg: editing.collection?.quantity_kg ?? 0,
          },
          ...collections,
        ]
      : collections

  return (
    <div className="space-y-6">
      {dialog}

      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Coffee Lot Management</h1>

          <p className="mt-1 text-sm text-gray-500">Create and manage traceable coffee lots from collected coffee.</p>
        </div>

        <div className="flex gap-3">
          <button
            type="button"
            onClick={downloadCSV}
            disabled={lots.length === 0}
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
              {showForm ? 'Cancel' : '+ Create Coffee Lot'}
            </button>
          )}
        </div>
      </div>

      {/* Messages */}
      {flash.banner}

      {/* Create / Edit Coffee Lot Form */}
      {showForm && (canCreate || canEdit) && (
        <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
          <div className="mb-6">
            <h2 className="text-lg font-semibold text-gray-900">
              {editing ? `Edit Coffee Lot ${editing.lot_code}` : 'Create New Coffee Lot'}
            </h2>

            <p className="mt-1 text-sm text-gray-500">
              {editing
                ? notesOnly
                  ? 'This lot has been through quality control — only notes can be changed.'
                  : 'Corrections are allowed while the lot is pending quality.'
                : 'A unique lot code will be generated automatically. New lots start as Pending Quality.'}
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Source Information */}
            <div>
              <h3 className="mb-4 text-sm font-semibold uppercase tracking-wide text-gray-700">Source Information</h3>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                {/* Collection */}
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-gray-700">Collection *</label>

                  <select
                    name="collection_id"
                    value={form.collection_id}
                    onChange={handleChange}
                    disabled={Boolean(editing)}
                    className={selectClass}
                  >
                    <option value="">{collectionsQuery.isLoading ? 'Loading collections…' : 'Select collection'}</option>

                    {collectionOptions.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.collection_code} — {c.origin} — {Number(c.quantity_kg).toLocaleString()} kg
                      </option>
                    ))}
                  </select>
                  {collectionsQuery.isError && <p className="mt-1 text-xs text-red-600">Could not load collections.</p>}
                </div>

                {/* Supplier (from collection) */}
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-gray-700">Supplier</label>

                  <input
                    value={collection?.supplier ? `${collection.supplier.supplier_code} — ${collection.supplier.name}` : ''}
                    readOnly
                    disabled
                    placeholder="Taken from the selected collection"
                    className={inputClass}
                  />
                </div>

                {/* Origin (from collection) */}
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-gray-700">Origin</label>

                  <input
                    value={collection?.origin ?? ''}
                    readOnly
                    disabled
                    placeholder="Taken from the selected collection"
                    className={inputClass}
                  />
                </div>

                {/* Quantity */}
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-gray-700">Quantity (kg) *</label>

                  <input
                    name="quantity_kg"
                    value={form.quantity_kg}
                    onChange={handleChange}
                    placeholder="Enter quantity in kg"
                    type="number"
                    min="0.01"
                    step="0.01"
                    max={remainingKg ?? undefined}
                    disabled={notesOnly}
                    className={inputClass}
                  />
                  {form.collection_id && (
                    <p className="mt-1 text-xs text-gray-500">
                      {selectedCollection.isLoading
                        ? 'Checking available quantity…'
                        : remainingKg !== null
                          ? `Available from this collection: ${formatKg(remainingKg)}`
                          : ''}
                    </p>
                  )}
                </div>
              </div>
            </div>

            {/* Lot Characteristics */}
            <div>
              <h3 className="mb-4 text-sm font-semibold uppercase tracking-wide text-gray-700">Lot Characteristics</h3>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                {/* Processing Method */}
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-gray-700">Processing Method</label>

                  <select
                    name="processing_method"
                    value={form.processing_method}
                    onChange={handleChange}
                    disabled={notesOnly}
                    className={selectClass}
                  >
                    <option value="">Select processing method</option>
                    {PROCESSING_METHODS.map((m) => (
                      <option key={m.value} value={m.value}>
                        {m.label}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Grade */}
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-gray-700">Grade</label>

                  <input
                    name="grade"
                    value={form.grade}
                    onChange={handleChange}
                    list="lot-grade-options"
                    maxLength={40}
                    placeholder="e.g. Grade 1"
                    disabled={notesOnly}
                    className={inputClass}
                  />
                  <datalist id="lot-grade-options">
                    {GRADES.map((g) => (
                      <option key={g} value={g} />
                    ))}
                  </datalist>
                </div>

                {/* Notes */}
                <div className="md:col-span-2">
                  <label className="mb-1.5 block text-sm font-medium text-gray-700">Notes</label>

                  <textarea
                    name="notes"
                    value={form.notes}
                    onChange={handleChange}
                    rows={3}
                    maxLength={2000}
                    placeholder="Optional notes about this lot"
                    className={inputClass}
                  />
                </div>
              </div>
            </div>

            {/* Lot Traceability */}
            <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
              <h3 className="text-sm font-semibold text-gray-700">Lot Traceability</h3>

              <p className="mt-1 text-sm text-gray-500">
                This lot remains linked to its original collection and supplier for traceability throughout the coffee workflow.
              </p>

              {collection && (
                <div className="mt-3 grid grid-cols-1 gap-3 text-sm md:grid-cols-2">
                  <div>
                    <span className="text-gray-500">Collection:</span>{' '}
                    <span className="font-medium text-gray-900">{collection.collection_code}</span>
                  </div>

                  <div>
                    <span className="text-gray-500">Supplier:</span>{' '}
                    <span className="font-medium text-gray-900">
                      {collection.supplier ? `${collection.supplier.supplier_code} — ${collection.supplier.name}` : '-'}
                    </span>
                  </div>

                  <div>
                    <span className="text-gray-500">Collected:</span>{' '}
                    <span className="font-medium text-gray-900">{formatKg(collection.quantity_kg)}</span>
                  </div>

                  <div>
                    <span className="text-gray-500">Already in lots:</span>{' '}
                    <span className="font-medium text-gray-900">{formatKg(collection.lotted_kg)}</span>
                  </div>
                </div>
              )}
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
                {saving ? (editing ? 'Saving...' : 'Creating...') : editing ? 'Save Changes' : 'Create Coffee Lot'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Coffee Lot Table */}
      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        <div className="flex flex-col gap-3 border-b border-gray-200 px-6 py-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="font-semibold text-gray-900">Coffee Lots</h2>

            <p className="text-sm text-gray-500">
              {total} lot
              {total !== 1 ? 's' : ''} {statusFilter || debouncedSearch ? 'found' : 'registered'}
            </p>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search lot code, origin, grade…"
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-black"
            />
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm outline-none focus:border-black"
            >
              <option value="">All statuses</option>
              {STATUS_FILTERS.map((s) => (
                <option key={s} value={s}>
                  {prettyStatus(s)}
                </option>
              ))}
            </select>
          </div>
        </div>

        {lotsQuery.isLoading ? (
          <LoadingState label="Loading coffee lots..." />
        ) : lotsQuery.isError ? (
          <ErrorState error={lotsQuery.error} onRetry={() => lotsQuery.refetch()} />
        ) : lots.length === 0 ? (
          statusFilter || debouncedSearch ? (
            <EmptyState title="No coffee lots match your filters." />
          ) : (
            <EmptyState
              title="No coffee lots have been created yet."
              action={
                canCreate ? (
                  <button type="button" onClick={openCreate} className="text-sm font-medium text-black underline">
                    Create your first coffee lot
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
                  <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Lot Code</th>

                  <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Origin</th>

                  <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Supplier</th>

                  <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Quantity</th>

                  <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Processing</th>

                  <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Grade</th>

                  <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Status</th>

                  <th className="px-6 py-3 text-right text-xs font-semibold uppercase tracking-wider text-gray-500">Actions</th>
                </tr>
              </thead>

              <tbody className="divide-y divide-gray-100 bg-white">
                {lots.map((lot) => (
                  <tr key={lot.id} className="hover:bg-gray-50">
                    {/* Lot Code */}
                    <td className="whitespace-nowrap px-6 py-4">
                      <span className="rounded-md bg-gray-100 px-2 py-1 text-xs font-semibold text-gray-700">{lot.lot_code}</span>
                    </td>

                    {/* Origin */}
                    <td className="px-6 py-4">
                      <div className="font-medium text-gray-900">{lot.origin}</div>

                      <div className="mt-1 text-xs text-gray-500">Collection: {lot.collection?.collection_code ?? '-'}</div>
                    </td>

                    {/* Supplier */}
                    <td className="px-6 py-4 text-sm text-gray-600">{getSupplierName(lot)}</td>

                    {/* Quantity */}
                    <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-600">{formatKg(lot.quantity_kg)}</td>

                    {/* Processing */}
                    <td className="whitespace-nowrap px-6 py-4 text-sm capitalize text-gray-600">
                      {lot.processing_method ? prettyStatus(lot.processing_method) : '—'}
                    </td>

                    {/* Grade */}
                    <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-600">{lot.grade || '—'}</td>

                    {/* Status */}
                    <td className="whitespace-nowrap px-6 py-4">
                      <StatusBadge status={lot.status} />
                    </td>

                    {/* Actions */}
                    <td className="whitespace-nowrap px-6 py-4 text-right text-sm">
                      <div className="flex justify-end gap-3">
                        <button type="button" onClick={() => setViewingId(lot.id)} className="font-medium text-gray-700 hover:text-black">
                          View
                        </button>
                        {canEdit && (
                          <button type="button" onClick={() => openEdit(lot)} className="font-medium text-gray-700 hover:text-black">
                            {lot.status === 'pending_quality' ? 'Edit' : 'Notes'}
                          </button>
                        )}
                        {canDelete && (
                          <button
                            type="button"
                            onClick={() => handleDelete(lot)}
                            disabled={actions.remove.isPending}
                            className="font-medium text-red-600 hover:text-red-700 disabled:opacity-50"
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

      <LotDetailModal id={viewingId} onClose={() => setViewingId(null)} />
    </div>
  )
}

function LotDetailModal({ id, onClose }: { id: string | null; onClose: () => void }) {
  const lotQuery = useLot(id)
  const lot = lotQuery.data

  return (
    <Modal open={Boolean(id)} title={lot ? `Coffee Lot ${lot.lot_code}` : 'Coffee Lot'} onClose={onClose} size="xl">
      {lotQuery.isLoading ? (
        <LoadingState label="Loading lot..." />
      ) : lotQuery.isError ? (
        <ErrorState error={lotQuery.error} onRetry={() => lotQuery.refetch()} />
      ) : !lot ? null : (
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            <Field label="Status" value={<StatusBadge status={lot.status} />} />
            <Field label="Origin" value={lot.origin} />
            <Field label="Processing" value={lot.processing_method ? prettyStatus(lot.processing_method) : null} />
            <Field label="Grade" value={lot.grade} />
            <Field label="Collection" value={lot.collection ? `${lot.collection.collection_code} (${formatDate(lot.collection.collection_date)})` : null} />
            <Field label="Supplier" value={lot.supplier ? `${lot.supplier.supplier_code} — ${lot.supplier.name}` : null} />
            <Field label="Created" value={formatDate(lot.created_at)} />
            <Field label="Notes" value={lot.notes} />
          </div>

          <div className="grid grid-cols-2 gap-4 rounded-lg border border-gray-200 bg-gray-50 p-4 md:grid-cols-4">
            <Field label="Lot quantity" value={formatKg(lot.quantity_kg)} />
            <Field label="Received into stock" value={formatKg(lot.received_kg)} />
            <Field label="Not yet received" value={formatKg(lot.unreceived_kg)} />
            <Field label="On hand" value={formatKg(lot.on_hand_kg)} />
          </div>

          <section>
            <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-gray-700">Quality Inspections</h3>
            {lot.inspections.length === 0 ? (
              <p className="text-sm text-gray-500">No inspections recorded yet.</p>
            ) : (
              <table className="min-w-full divide-y divide-gray-200 text-sm">
                <thead className="bg-gray-50 text-left text-xs uppercase text-gray-500">
                  <tr>
                    <th className="px-3 py-2">Date</th>
                    <th className="px-3 py-2">Sample</th>
                    <th className="px-3 py-2">Inspector</th>
                    <th className="px-3 py-2">Cup score</th>
                    <th className="px-3 py-2">Moisture</th>
                    <th className="px-3 py-2">Grade</th>
                    <th className="px-3 py-2">Result</th>
                    <th className="px-3 py-2">Approval</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {lot.inspections.map((i) => (
                    <tr key={i.id}>
                      <td className="px-3 py-2">{formatDate(i.inspection_date)}</td>
                      <td className="px-3 py-2">{prettyStatus(i.sample_type)}</td>
                      <td className="px-3 py-2">{i.inspector?.full_name ?? '-'}</td>
                      <td className="px-3 py-2">{i.cup_score ?? '-'}</td>
                      <td className="px-3 py-2">{i.moisture != null ? `${i.moisture}%` : '-'}</td>
                      <td className="px-3 py-2">{i.final_grade ?? '-'}</td>
                      <td className="px-3 py-2"><StatusBadge status={i.result} /></td>
                      <td className="px-3 py-2">
                        <StatusBadge status={i.approval_status} />
                        {i.approved_at && <span className="ml-2 text-xs text-gray-500">{formatDate(i.approved_at)}</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>

          <section>
            <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-gray-700">Stock per Warehouse</h3>
            {lot.inventory.length === 0 ? (
              <p className="text-sm text-gray-500">This lot has not been received into any warehouse.</p>
            ) : (
              <table className="min-w-full divide-y divide-gray-200 text-sm">
                <thead className="bg-gray-50 text-left text-xs uppercase text-gray-500">
                  <tr>
                    <th className="px-3 py-2">Warehouse</th>
                    <th className="px-3 py-2">Quantity</th>
                    <th className="px-3 py-2">Bags</th>
                    <th className="px-3 py-2">Received</th>
                    <th className="px-3 py-2">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {lot.inventory.map((s) => (
                    <tr key={s.id}>
                      <td className="px-3 py-2">{s.warehouse ? `${s.warehouse.code} — ${s.warehouse.name}` : '-'}</td>
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
            <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-gray-700">Export Allocations</h3>
            {lot.allocations.length === 0 ? (
              <p className="text-sm text-gray-500">This lot is not allocated to any export batch.</p>
            ) : (
              <table className="min-w-full divide-y divide-gray-200 text-sm">
                <thead className="bg-gray-50 text-left text-xs uppercase text-gray-500">
                  <tr>
                    <th className="px-3 py-2">Batch</th>
                    <th className="px-3 py-2">Quantity</th>
                    <th className="px-3 py-2">Batch status</th>
                    <th className="px-3 py-2">Released</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {lot.allocations.map((a) => (
                    <tr key={a.id}>
                      <td className="px-3 py-2">{a.batch?.batch_number ?? '-'}</td>
                      <td className="px-3 py-2">{formatKg(a.quantity_kg)}</td>
                      <td className="px-3 py-2">{a.batch ? <StatusBadge status={a.batch.status} /> : '-'}</td>
                      <td className="px-3 py-2">{a.released_at ? formatDate(a.released_at) : '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>

          <p className="text-sm text-gray-500">
            Full chain from farm to shipment:{' '}
            <Link to="/admin/traceability" onClick={onClose} className="font-medium text-black underline">
              open Traceability and search {lot.lot_code}
            </Link>
          </p>
        </div>
      )}
    </Modal>
  )
}
