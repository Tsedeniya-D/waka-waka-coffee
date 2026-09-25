import { useState } from 'react'
import { useAuth } from '../../contexts/AuthContext'
import { useDebounce } from '../../hooks'
import { downloadCsv } from '../../lib/api'
import { useInspectionActions, useInspections, useLots } from '../../queries/admin'
import type { QualityInspection } from '../../types'
import {
  EmptyState,
  ErrorState,
  LoadingState,
  StatusBadge,
  formatDate,
  formatDateTime,
  prettyStatus,
  useConfirm,
  useFlash,
} from '../../components/admin/ui'

type FormData = {
  lot_id: string
  sample_type: string
  inspection_date: string
  sample_reference: string
  moisture: string
  defect_count: string
  screen_size: string
  cup_score: string
  aroma: string
  flavor: string
  acidity: string
  body: string
  final_grade: string
  result: string
  notes: string
}

const today = () => new Date().toISOString().split('T')[0]

const initialForm = (): FormData => ({
  lot_id: '',
  sample_type: 'offer',
  inspection_date: today(),
  sample_reference: '',
  moisture: '',
  defect_count: '',
  screen_size: '',
  cup_score: '',
  aroma: '',
  flavor: '',
  acidity: '',
  body: '',
  final_grade: '',
  result: 'pending',
  notes: '',
})

const SAMPLE_TYPES = [
  { value: 'offer', label: 'Offer Sample' },
  { value: 'pre_shipment', label: 'Pre-Shipment Sample' },
  { value: 'arrival', label: 'Arrival Sample' },
  { value: 'type_sample', label: 'Type Sample' },
  { value: 'other', label: 'Other' },
]

const GRADES = ['Grade 1', 'Grade 2', 'Grade 3', 'Grade 4', 'Grade 5']

/** Lots that can still be inspected (never shipped ones). */
const INSPECTABLE_LOT_STATUSES = 'pending_quality,approved,rejected,in_warehouse'

function getSampleLabel(type: string) {
  return SAMPLE_TYPES.find((s) => s.value === type)?.label ?? prettyStatus(type)
}

export default function AdminQuality() {
  const { isAdmin, can } = useAuth()
  const canCreate = can('quality', 'create')
  const canUpdate = can('quality', 'update')
  const canDelete = isAdmin && can('quality', 'delete')

  const [form, setForm] = useState<FormData>(initialForm)
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<QualityInspection | null>(null)
  const [selectedIds, setSelectedIds] = useState<string[]>([])

  const [resultFilter, setResultFilter] = useState('')
  const [approvalFilter, setApprovalFilter] = useState('')
  const [sampleFilter, setSampleFilter] = useState('')
  const [search, setSearch] = useState('')
  const debouncedSearch = useDebounce(search, { delay: 400 })
  const hasFilters = Boolean(resultFilter || approvalFilter || sampleFilter || debouncedSearch.trim())

  const flash = useFlash()
  const { confirm, dialog } = useConfirm()
  const actions = useInspectionActions()

  const inspectionsQuery = useInspections({
    limit: 500,
    result: resultFilter || undefined,
    approval_status: approvalFilter || undefined,
    sample_type: sampleFilter || undefined,
    search: debouncedSearch.trim() || undefined,
  })
  const inspections = inspectionsQuery.data?.data ?? []

  const lotsQuery = useLots({ status: INSPECTABLE_LOT_STATUSES, limit: 500 })
  const lots = lotsQuery.data?.data ?? []
  const lotOptions =
    editing?.lot && !lots.some((l) => l.id === editing.lot_id) ? [{ id: editing.lot_id, lot_code: editing.lot.lot_code, origin: editing.lot.origin }, ...lots] : lots

  const saving = actions.create.isPending || actions.update.isPending
  const deciding = actions.decide.isPending || actions.reopen.isPending
  const deleting = actions.remove.isPending || actions.bulkRemove.isPending

  // Only rows currently shown can be selected.
  const visibleSelected = selectedIds.filter((id) => inspections.some((i) => i.id === id))

  function updateField(field: keyof FormData, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }))
  }

  function openCreate() {
    setForm(initialForm())
    setEditing(null)
    setShowForm(true)
    flash.clear()
  }

  function resetForm() {
    setForm(initialForm())
    setEditing(null)
    setShowForm(false)
  }

  /** Decided inspections are read-only for everyone but administrators. */
  function canEditRow(item: QualityInspection) {
    return canUpdate && (item.approval_status === 'pending' || isAdmin)
  }

  // EDIT
  function startEdit(item: QualityInspection) {
    setForm({
      lot_id: item.lot_id,
      sample_type: item.sample_type,
      inspection_date: item.inspection_date,
      sample_reference: item.sample_reference || '',
      moisture: item.moisture !== null ? String(item.moisture) : '',
      defect_count: item.defect_count !== null ? String(item.defect_count) : '',
      screen_size: item.screen_size || '',
      cup_score: item.cup_score !== null ? String(item.cup_score) : '',
      aroma: item.aroma || '',
      flavor: item.flavor || '',
      acidity: item.acidity || '',
      body: item.body || '',
      final_grade: item.final_grade || '',
      result: item.result,
      notes: item.notes || '',
    })

    setEditing(item)
    flash.clear()
    setShowForm(true)

    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  function validate(): string | null {
    if (!form.lot_id) return 'Please select a coffee lot.'
    if (!form.inspection_date) return 'Please enter the inspection date.'
    if (form.moisture !== '') {
      const n = Number(form.moisture)
      if (!Number.isFinite(n) || n < 0 || n > 100) return 'Moisture must be between 0 and 100%.'
    }
    if (form.defect_count !== '') {
      const n = Number(form.defect_count)
      if (!Number.isInteger(n) || n < 0) return 'Defect count must be a whole number of 0 or more.'
    }
    if (form.cup_score !== '') {
      const n = Number(form.cup_score)
      if (!Number.isFinite(n) || n < 0 || n > 100) return 'Cup score must be between 0 and 100.'
    }
    return null
  }

  // SAVE / UPDATE
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    flash.clear()

    const problem = validate()
    if (problem) {
      flash.error(new Error(problem))
      return
    }

    const num = (v: string) => (v === '' ? null : Number(v))
    const text = (v: string) => v.trim() || null

    const body = {
      lot_id: form.lot_id,
      inspection_date: form.inspection_date,
      sample_type: form.sample_type,
      sample_reference: text(form.sample_reference),
      moisture: num(form.moisture),
      defect_count: num(form.defect_count),
      screen_size: text(form.screen_size),
      cup_score: num(form.cup_score),
      aroma: text(form.aroma),
      flavor: text(form.flavor),
      acidity: text(form.acidity),
      body: text(form.body),
      final_grade: text(form.final_grade),
      result: form.result,
      notes: text(form.notes),
    }

    try {
      if (editing) {
        await actions.update.mutateAsync({ id: editing.id, body })
        flash.success('Quality inspection updated successfully.')
      } else {
        await actions.create.mutateAsync(body)
        flash.success(
          form.result === 'passed'
            ? 'Quality inspection recorded. Use "Approve" to release the lot.'
            : 'Quality inspection recorded successfully.'
        )
      }
      resetForm()
    } catch (err) {
      flash.error(err)
    }
  }

  // APPROVE / REJECT / REOPEN
  async function approve(item: QualityInspection) {
    const ok = await confirm({
      title: `Approve inspection for ${item.lot?.lot_code ?? 'this lot'}?`,
      message: 'The lot will move to Approved and the Field and Warehouse teams will be notified so it can be received into stock.',
      confirmLabel: 'Approve',
    })
    if (!ok) return
    try {
      await actions.decide.mutateAsync({ id: item.id, decision: 'approved' })
      flash.success(`Inspection approved. Lot ${item.lot?.lot_code ?? ''} is now Approved.`)
    } catch (err) {
      flash.error(err)
    }
  }

  async function reject(item: QualityInspection) {
    const reason = await confirm({
      title: `Reject inspection for ${item.lot?.lot_code ?? 'this lot'}?`,
      message: 'The lot will move to Rejected and the Field and Warehouse teams will be notified.',
      withReason: true,
      reasonLabel: 'Reason (optional)',
      danger: true,
      confirmLabel: 'Reject',
    })
    if (reason === false) return
    try {
      await actions.decide.mutateAsync({ id: item.id, decision: 'rejected', notes: typeof reason === 'string' && reason ? reason : undefined })
      flash.success(`Inspection rejected. Lot ${item.lot?.lot_code ?? ''} is now Rejected.`)
    } catch (err) {
      flash.error(err)
    }
  }

  async function reopen(item: QualityInspection) {
    const ok = await confirm({
      title: 'Reopen this inspection?',
      message: `The ${item.approval_status} decision will be withdrawn and the inspection returns to pending approval.`,
      confirmLabel: 'Reopen',
    })
    if (!ok) return
    try {
      await actions.reopen.mutateAsync(item.id)
      flash.success('Inspection reopened.')
    } catch (err) {
      flash.error(err)
    }
  }

  // DELETE ONE
  async function deleteInspection(item: QualityInspection) {
    const lotCode = item.lot?.lot_code || 'this lot'

    const ok = await confirm({
      title: 'Delete inspection?',
      message: `Are you sure you want to delete the quality inspection for ${lotCode}?`,
      danger: true,
      confirmLabel: 'Delete',
    })
    if (!ok) return

    try {
      await actions.remove.mutateAsync(item.id)
      flash.success('Quality inspection deleted successfully.')
      setSelectedIds((prev) => prev.filter((selectedId) => selectedId !== item.id))
      if (editing?.id === item.id) resetForm()
    } catch (err) {
      flash.error(err)
    }
  }

  // SELECT ONE
  function toggleSelect(id: string) {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((selectedId) => selectedId !== id) : [...prev, id]))
  }

  // SELECT ALL
  function toggleSelectAll() {
    if (visibleSelected.length === inspections.length) {
      setSelectedIds([])
    } else {
      setSelectedIds(inspections.map((item) => item.id))
    }
  }

  // BULK DELETE
  async function deleteSelected() {
    if (visibleSelected.length === 0) {
      flash.error(new Error('Please select at least one inspection to delete.'))
      return
    }

    const ok = await confirm({
      title: `Delete ${visibleSelected.length} inspection(s)?`,
      message: 'This action cannot be undone.',
      danger: true,
      confirmLabel: 'Delete',
    })
    if (!ok) return

    const idsToDelete = [...visibleSelected]
    try {
      const res = await actions.bulkRemove.mutateAsync(idsToDelete)
      flash.success(`${res.deleted?.length ?? idsToDelete.length} quality inspection(s) deleted successfully.`)
      setSelectedIds([])
      if (editing && idsToDelete.includes(editing.id)) resetForm()
    } catch (err) {
      flash.error(err)
    }
  }

  function downloadCSV() {
    downloadCsv(
      `quality-inspections-${today()}.csv`,
      [
        'Lot Code',
        'Origin',
        'Sample Type',
        'Inspection Date',
        'Inspector',
        'Moisture',
        'Defect Count',
        'Screen Size',
        'Cup Score',
        'Final Grade',
        'Result',
        'Approval Status',
        'Approved/Rejected By',
        'Decided At',
        'Sample Reference',
        'Notes',
      ],
      inspections.map((item) => [
        item.lot?.lot_code ?? '',
        item.lot?.origin ?? '',
        getSampleLabel(item.sample_type),
        item.inspection_date,
        item.inspector?.full_name ?? '',
        item.moisture,
        item.defect_count,
        item.screen_size,
        item.cup_score,
        item.final_grade,
        item.result,
        item.approval_status,
        item.approver?.full_name ?? '',
        item.approved_at ? formatDateTime(item.approved_at) : '',
        item.sample_reference,
        item.notes,
      ])
    )
  }

  const inputClass = 'h-11 w-full rounded-lg border border-gray-300 px-3 text-sm focus:border-black focus:outline-none'
  const selectClass = 'h-11 w-full rounded-lg border border-gray-300 bg-white px-3 text-sm focus:border-black focus:outline-none'
  const filterClass = 'rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-black focus:outline-none'

  return (
    <div className="space-y-6">
      {dialog}

      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Quality Management</h1>

          <p className="mt-1 text-sm text-gray-500">Inspect and track coffee quality from origin to arrival.</p>
        </div>

        <div className="flex gap-3">
          <button
            type="button"
            onClick={downloadCSV}
            disabled={inspections.length === 0}
            className="rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Download CSV
          </button>

          {canCreate && (
            <button type="button" onClick={openCreate} className="rounded-lg bg-black px-4 py-2.5 text-sm font-medium text-white hover:bg-gray-800">
              + New Quality Inspection
            </button>
          )}
        </div>
      </div>

      {/* Messages */}
      {flash.banner}

      <div className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800">
        Record the inspection first, then use <strong>Approve</strong> (only for a “passed” result) or <strong>Reject</strong>. Approving moves the
        lot to <strong>Approved</strong> and notifies the Field and Warehouse teams so it can be received into stock.
      </div>

      {/* Form */}
      {showForm && (
        <form onSubmit={handleSubmit} className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
          {editing && (
            <p className="mb-6 text-sm text-gray-500">
              Editing inspection for <strong>{editing.lot?.lot_code ?? 'lot'}</strong>
              {editing.approval_status !== 'pending' && ` — already ${editing.approval_status}; changes are recorded by an administrator.`}
            </p>
          )}

          {/* Quality Checkpoint */}
          <div className="mb-8">
            <h2 className="mb-4 text-lg font-semibold text-gray-900">Quality Checkpoint</h2>

            <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
              <div>
                <label className="mb-2 block text-sm font-medium text-gray-700">Sample Type</label>

                <select value={form.sample_type} onChange={(e) => updateField('sample_type', e.target.value)} className={selectClass}>
                  {SAMPLE_TYPES.map((s) => (
                    <option key={s.value} value={s.value}>
                      {s.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-gray-700">Coffee Lot</label>

                <select required value={form.lot_id} onChange={(e) => updateField('lot_id', e.target.value)} className={selectClass}>
                  <option value="">{lotsQuery.isLoading ? 'Loading lots…' : 'Select coffee lot'}</option>

                  {lotOptions.map((lot) => (
                    <option key={lot.id} value={lot.id}>
                      {lot.lot_code} — {lot.origin}
                      {'status' in lot && lot.status ? ` (${prettyStatus(lot.status)})` : ''}
                    </option>
                  ))}
                </select>
                {lotsQuery.isError && <p className="mt-1 text-xs text-red-600">Could not load coffee lots.</p>}
              </div>
            </div>
          </div>

          {/* Sample Information */}
          <div className="mb-8">
            <h2 className="mb-4 text-lg font-semibold text-gray-900">Sample Information</h2>

            <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
              <div>
                <label className="mb-2 block text-sm font-medium text-gray-700">Inspection Date</label>

                <input
                  type="date"
                  required
                  value={form.inspection_date}
                  onChange={(e) => updateField('inspection_date', e.target.value)}
                  className={inputClass}
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-gray-700">
                  Sample Reference
                  <span className="ml-1 text-gray-400">(Optional)</span>
                </label>

                <input
                  type="text"
                  value={form.sample_reference}
                  maxLength={120}
                  onChange={(e) => updateField('sample_reference', e.target.value)}
                  placeholder="e.g. PSS-2026-001"
                  className={inputClass}
                />
              </div>
            </div>
          </div>

          {/* Quality Measurements */}
          <div className="mb-8">
            <h2 className="mb-4 text-lg font-semibold text-gray-900">Quality Measurements</h2>

            <div className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-4">
              <div>
                <label className="mb-2 block text-sm font-medium text-gray-700">Moisture (%)</label>

                <input
                  type="number"
                  step="0.01"
                  min="0"
                  max="100"
                  value={form.moisture}
                  onChange={(e) => updateField('moisture', e.target.value)}
                  placeholder="e.g. 11.20"
                  className={inputClass}
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-gray-700">Defect Count</label>

                <input
                  type="number"
                  min="0"
                  step="1"
                  value={form.defect_count}
                  onChange={(e) => updateField('defect_count', e.target.value)}
                  placeholder="e.g. 3"
                  className={inputClass}
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-gray-700">Screen Size</label>

                <input
                  type="text"
                  maxLength={40}
                  value={form.screen_size}
                  onChange={(e) => updateField('screen_size', e.target.value)}
                  placeholder="e.g. 15/16"
                  className={inputClass}
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-gray-700">Cup Score</label>

                <input
                  type="number"
                  step="0.01"
                  min="0"
                  max="100"
                  value={form.cup_score}
                  onChange={(e) => updateField('cup_score', e.target.value)}
                  placeholder="e.g. 87.50"
                  className={inputClass}
                />
              </div>
            </div>
          </div>

          {/* Cupping Evaluation */}
          <div className="mb-8">
            <h2 className="mb-4 text-lg font-semibold text-gray-900">Cupping Evaluation</h2>

            <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
              <div>
                <label className="mb-2 block text-sm font-medium text-gray-700">Aroma</label>

                <input type="text" maxLength={200} value={form.aroma} onChange={(e) => updateField('aroma', e.target.value)} placeholder="Describe aroma" className={inputClass} />
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-gray-700">Flavor</label>

                <input type="text" maxLength={500} value={form.flavor} onChange={(e) => updateField('flavor', e.target.value)} placeholder="Describe flavor" className={inputClass} />
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-gray-700">Acidity</label>

                <input type="text" maxLength={200} value={form.acidity} onChange={(e) => updateField('acidity', e.target.value)} placeholder="Describe acidity" className={inputClass} />
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-gray-700">Body</label>

                <input type="text" maxLength={200} value={form.body} onChange={(e) => updateField('body', e.target.value)} placeholder="Describe body" className={inputClass} />
              </div>
            </div>
          </div>

          {/* Final Assessment */}
          <div className="mb-8">
            <h2 className="mb-4 text-lg font-semibold text-gray-900">Final Assessment</h2>

            <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
              <div>
                <label className="mb-2 block text-sm font-medium text-gray-700">Final Grade</label>

                <select value={form.final_grade} onChange={(e) => updateField('final_grade', e.target.value)} className={selectClass}>
                  <option value="">Select grade</option>
                  {form.final_grade && !GRADES.includes(form.final_grade) && <option value={form.final_grade}>{form.final_grade}</option>}
                  {GRADES.map((g) => (
                    <option key={g} value={g}>
                      {g}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-gray-700">Result</label>

                <select value={form.result} onChange={(e) => updateField('result', e.target.value)} className={selectClass}>
                  <option value="pending">Pending</option>
                  <option value="passed">Passed</option>
                  <option value="failed">Failed</option>
                </select>
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-gray-700">Approval Status</label>

                <div className="flex h-11 items-center gap-2">
                  <StatusBadge status={editing?.approval_status ?? 'pending'} />
                  <span className="text-xs text-gray-500">Set with the Approve / Reject actions in the table.</span>
                </div>
              </div>
            </div>
          </div>

          {/* Notes */}
          <div className="mb-8">
            <h2 className="mb-4 text-lg font-semibold text-gray-900">Notes</h2>

            <textarea
              value={form.notes}
              maxLength={4000}
              onChange={(e) => updateField('notes', e.target.value)}
              rows={4}
              placeholder="Add quality observations or comments..."
              className="w-full rounded-lg border border-gray-300 px-3 py-3 text-sm focus:border-black focus:outline-none"
            />
          </div>

          {/* Buttons */}
          <div className="flex justify-end gap-3 border-t border-gray-200 pt-5">
            <button
              type="button"
              onClick={resetForm}
              className="rounded-lg border border-gray-300 bg-white px-5 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              Cancel
            </button>

            <button
              type="submit"
              disabled={saving}
              className="rounded-lg bg-black px-5 py-2.5 text-sm font-medium text-white hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {saving ? 'Saving...' : editing ? 'Update Inspection' : 'Save Inspection'}
            </button>
          </div>
        </form>
      )}

      {/* Table */}
      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        <div className="flex flex-col gap-3 border-b border-gray-200 px-6 py-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Quality Inspections</h2>

            <p className="mt-1 text-sm text-gray-500">Quality checks performed on coffee lots.</p>
          </div>

          <div className="flex flex-wrap gap-2">
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search lot code…" className={filterClass} />
            <select value={resultFilter} onChange={(e) => setResultFilter(e.target.value)} className={filterClass}>
              <option value="">All results</option>
              <option value="pending">Pending</option>
              <option value="passed">Passed</option>
              <option value="failed">Failed</option>
            </select>
            <select value={approvalFilter} onChange={(e) => setApprovalFilter(e.target.value)} className={filterClass}>
              <option value="">All approvals</option>
              <option value="pending">Pending approval</option>
              <option value="approved">Approved</option>
              <option value="rejected">Rejected</option>
            </select>
            <select value={sampleFilter} onChange={(e) => setSampleFilter(e.target.value)} className={filterClass}>
              <option value="">All sample types</option>
              {SAMPLE_TYPES.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Selection Toolbar */}
        {canDelete && !inspectionsQuery.isLoading && inspections.length > 0 && (
          <div className="flex flex-col gap-3 border-b border-gray-200 px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <label className="flex cursor-pointer items-center gap-2 text-sm font-medium text-gray-700">
                <input
                  type="checkbox"
                  checked={inspections.length > 0 && visibleSelected.length === inspections.length}
                  onChange={toggleSelectAll}
                  className="h-4 w-4 rounded border-gray-300"
                />
                Select All
              </label>

              {visibleSelected.length > 0 && <span className="text-sm text-gray-500">{visibleSelected.length} selected</span>}
            </div>

            {visibleSelected.length > 0 && (
              <button
                type="button"
                onClick={deleteSelected}
                disabled={deleting}
                className="rounded-lg bg-red-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {deleting ? 'Deleting...' : `Delete Selected (${visibleSelected.length})`}
              </button>
            )}
          </div>
        )}

        {inspectionsQuery.isLoading ? (
          <LoadingState label="Loading quality inspections..." />
        ) : inspectionsQuery.isError ? (
          <ErrorState error={inspectionsQuery.error} onRetry={() => inspectionsQuery.refetch()} />
        ) : inspections.length === 0 ? (
          hasFilters ? (
            <EmptyState title="No inspections match your filters." />
          ) : (
            <EmptyState
              title="No quality inspections recorded yet."
              action={
                canCreate ? (
                  <button type="button" onClick={openCreate} className="rounded-lg bg-black px-4 py-2.5 text-sm font-medium text-white hover:bg-gray-800">
                    + Add First Inspection
                  </button>
                ) : undefined
              }
            />
          )
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50">
                <tr className="border-b border-gray-200">
                  {canDelete && (
                    <th className="px-6 py-3 text-left font-medium text-gray-600">
                      <input
                        type="checkbox"
                        checked={inspections.length > 0 && visibleSelected.length === inspections.length}
                        onChange={toggleSelectAll}
                        className="h-4 w-4 rounded border-gray-300"
                      />
                    </th>
                  )}

                  <th className="px-6 py-3 text-left font-medium text-gray-600">Lot Code</th>
                  <th className="px-6 py-3 text-left font-medium text-gray-600">Sample</th>
                  <th className="px-6 py-3 text-left font-medium text-gray-600">Date</th>
                  <th className="px-6 py-3 text-left font-medium text-gray-600">Moisture</th>
                  <th className="px-6 py-3 text-left font-medium text-gray-600">Cup Score</th>
                  <th className="px-6 py-3 text-left font-medium text-gray-600">Grade</th>
                  <th className="px-6 py-3 text-left font-medium text-gray-600">Result</th>
                  <th className="px-6 py-3 text-left font-medium text-gray-600">Approval</th>
                  <th className="px-6 py-3 text-left font-medium text-gray-600">Actions</th>
                </tr>
              </thead>

              <tbody className="divide-y divide-gray-100">
                {inspections.map((item) => (
                  <tr key={item.id} className="hover:bg-gray-50">
                    {canDelete && (
                      <td className="px-6 py-4">
                        <input
                          type="checkbox"
                          checked={selectedIds.includes(item.id)}
                          onChange={() => toggleSelect(item.id)}
                          className="h-4 w-4 rounded border-gray-300"
                        />
                      </td>
                    )}

                    <td className="px-6 py-4 font-medium text-gray-900">
                      {item.lot?.lot_code || '—'}
                      {item.lot?.status && <div className="mt-1 text-xs font-normal text-gray-500">Lot: {prettyStatus(item.lot.status)}</div>}
                    </td>

                    <td className="px-6 py-4 text-gray-700">
                      {getSampleLabel(item.sample_type)}
                      {item.inspector?.full_name && <div className="mt-1 text-xs text-gray-500">by {item.inspector.full_name}</div>}
                    </td>

                    <td className="px-6 py-4 text-gray-600">{formatDate(item.inspection_date)}</td>

                    <td className="px-6 py-4 text-gray-600">{item.moisture !== null ? `${item.moisture}%` : '—'}</td>

                    <td className="px-6 py-4 text-gray-600">{item.cup_score ?? '—'}</td>

                    <td className="px-6 py-4 text-gray-600">{item.final_grade || '—'}</td>

                    <td className="px-6 py-4">
                      <StatusBadge status={item.result} />
                    </td>

                    <td className="px-6 py-4">
                      <StatusBadge status={item.approval_status} />
                      {item.approval_status !== 'pending' && (
                        <div className="mt-1 text-xs text-gray-500">
                          {item.approver?.full_name ? `by ${item.approver.full_name}` : ''}
                          {item.approved_at ? ` · ${formatDateTime(item.approved_at)}` : ''}
                        </div>
                      )}
                    </td>

                    <td className="px-6 py-4">
                      <div className="flex flex-wrap items-center gap-2">
                        {canUpdate && item.approval_status === 'pending' && item.result === 'passed' && (
                          <button
                            type="button"
                            onClick={() => approve(item)}
                            disabled={deciding}
                            className="rounded-lg border border-green-200 bg-white px-3 py-1.5 text-xs font-medium text-green-700 hover:bg-green-50 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            Approve
                          </button>
                        )}

                        {canUpdate && item.approval_status === 'pending' && (
                          <button
                            type="button"
                            onClick={() => reject(item)}
                            disabled={deciding}
                            className="rounded-lg border border-red-200 bg-white px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            Reject
                          </button>
                        )}

                        {isAdmin && item.approval_status !== 'pending' && (
                          <button
                            type="button"
                            onClick={() => reopen(item)}
                            disabled={deciding}
                            className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            Reopen
                          </button>
                        )}

                        {canEditRow(item) && (
                          <button
                            type="button"
                            onClick={() => startEdit(item)}
                            className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
                          >
                            Edit
                          </button>
                        )}

                        {canDelete && (
                          <button
                            type="button"
                            onClick={() => deleteInspection(item)}
                            disabled={deleting}
                            className="rounded-lg border border-red-200 bg-white px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
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
    </div>
  )
}
