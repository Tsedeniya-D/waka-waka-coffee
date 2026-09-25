import { env } from '../config/env.js'
import { canonicalRole, isAdminRole } from '../config/permissions.js'
import { attachProfiles } from '../lib/profiles.js'
import { compact, getById, insertOne, runList, updateOne } from '../lib/query.js'
import { objectPath, removeObject, signedUrl, uploadObject } from '../lib/storage.js'
import { unwrap } from '../utils/dbError.js'
import { AppError } from '../utils/AppError.js'

/** Related record -> table (documents.related_type values). */
export const RELATED_TABLES = {
  quote_request: 'quote_requests',
  sample_request: 'sample_requests',
  customer: 'customers',
  sales_order: 'sales_orders',
  export_batch: 'export_batches',
  shipment: 'shipments',
  coffee_lot: 'coffee_lots',
  quality_inspection: 'quality_inspections',
  warehouse: 'warehouses',
  product: 'products',
  supplier: 'suppliers',
  farmer: 'farmers',
  collection: 'collection_records',
}

/**
 * Which departments may attach documents to which records. Mirrors the
 * database function can_access_document(), which RLS enforces as well.
 */
const DEPARTMENT_TYPES = {
  sales: ['quote_request', 'sample_request', 'customer', 'sales_order', 'product', 'general'],
  quality_officer: ['coffee_lot', 'quality_inspection', 'general'],
  warehouse_officer: ['warehouse', 'coffee_lot', 'general'],
  field_officer: ['coffee_lot', 'collection', 'supplier', 'farmer', 'general'],
}

export function canAttach(role, relatedType) {
  const r = canonicalRole(role)
  if (isAdminRole(role) || r === 'export_manager') return true
  if (relatedType === 'general') return false
  return (DEPARTMENT_TYPES[r] ?? []).includes(relatedType)
}

const SELECT = '*'

async function assertRelatedExists(db, relatedType, relatedId) {
  if (relatedType === 'general') return
  const table = RELATED_TABLES[relatedType]
  const row = unwrap(await db.from(table).select('id').eq('id', relatedId).maybeSingle(), 'Checking related record')
  if (!row) throw AppError.notFound(`The ${relatedType.replace(/_/g, ' ')} this document belongs to was not found.`)
}

export async function list(db, q) {
  const result = await runList(
    db.from('documents').select(SELECT, { count: 'exact' }),
    {
      ...q,
      eq: {
        related_type: q.related_type,
        related_id: q.related_id,
        document_type: q.document_type,
        is_public: q.is_public,
      },
      searchColumns: ['title', 'file_name', 'notes'],
      range: { column: 'created_at', from: q.from, to: q.to },
    },
    'Loading documents'
  )
  await attachProfiles(db, result.rows, [['uploaded_by', 'uploader']])
  await attachLabels(db, result.rows)
  return result
}

/** Human-readable reference of the related record (e.g. SHP-2026-0004). */
async function attachLabels(db, rows) {
  const LABEL = {
    quote_request: 'reference_number',
    sample_request: 'reference_number',
    customer: 'company_name',
    sales_order: 'order_number',
    export_batch: 'batch_number',
    shipment: 'shipment_number',
    coffee_lot: 'lot_code',
    warehouse: 'name',
    product: 'name',
    supplier: 'name',
    farmer: 'name',
    collection: 'collection_code',
  }
  const byType = new Map()
  for (const r of rows) {
    if (!r.related_id || !LABEL[r.related_type]) continue
    if (!byType.has(r.related_type)) byType.set(r.related_type, new Set())
    byType.get(r.related_type).add(r.related_id)
  }
  const labels = new Map()
  await Promise.all(
    [...byType].map(async ([type, ids]) => {
      const col = LABEL[type]
      const { data } = await db.from(RELATED_TABLES[type]).select(`id, ${col}`).in('id', [...ids])
      for (const d of data ?? []) labels.set(d.id, d[col])
    })
  )
  for (const r of rows) r.related_label = r.related_id ? labels.get(r.related_id) ?? null : null
}

export async function get(db, id) {
  const doc = await getById(db, 'documents', id, SELECT, 'Document')
  await attachProfiles(db, doc, [['uploaded_by', 'uploader']])
  await attachLabels(db, [doc])
  return doc
}

/**
 * Upload a file (multipart) or register an external link. The file goes to
 * the private "documents" bucket under <related_type>/<related_id>/.
 */
export async function create(db, auth, body, file) {
  if (!canAttach(auth.role, body.related_type)) {
    throw AppError.forbidden(`Your role cannot attach documents to ${body.related_type.replace(/_/g, ' ')} records.`)
  }
  if (!file && !body.file_url) throw AppError.badRequest('Attach a file or provide a link to the document.')
  await assertRelatedExists(db, body.related_type, body.related_id)

  let path = null
  if (file) {
    path = objectPath(`${body.related_type}/${body.related_id ?? 'general'}`, file.originalname)
    await uploadObject(db, env.DOCUMENTS_BUCKET, path, file)
  }

  try {
    const row = await insertOne(
      db,
      'documents',
      compact({
        title: body.title,
        document_type: body.document_type,
        related_type: body.related_type,
        related_id: body.related_type === 'general' ? null : body.related_id,
        is_public: body.is_public ?? false,
        notes: body.notes,
        file_path: path,
        file_url: file ? null : body.file_url,
        file_name: file?.originalname ?? null,
        mime_type: file?.mimetype ?? null,
        file_size: file?.size ?? null,
        uploaded_by: auth.userId,
      }),
      'id',
      'document'
    )
    return get(db, row.id)
  } catch (err) {
    // Never leave an orphaned file behind.
    if (path) await removeObject(db, env.DOCUMENTS_BUCKET, path).catch(() => {})
    throw err
  }
}

export async function update(db, auth, id, body) {
  const doc = await getById(db, 'documents', id, 'id, uploaded_by, related_type', 'Document')
  if (body.is_public && !(isAdminRole(auth.role) || canonicalRole(auth.role) === 'export_manager')) {
    throw AppError.forbidden('Only administrators and export managers can publish documents.')
  }
  if (doc.uploaded_by !== auth.userId && !(isAdminRole(auth.role) || canonicalRole(auth.role) === 'export_manager')) {
    throw AppError.forbidden('You can only edit documents you uploaded.')
  }
  await updateOne(db, 'documents', id, compact(body), 'id', 'Document')
  return get(db, id)
}

export async function remove(db, auth, id) {
  const doc = await getById(db, 'documents', id, 'id, file_path, uploaded_by', 'Document')
  if (!isAdminRole(auth.role) && doc.uploaded_by !== auth.userId) {
    throw AppError.forbidden('Only administrators or the uploader can delete a document.')
  }
  const deleted = unwrap(await db.from('documents').delete().eq('id', id).select('id'), 'Deleting document')
  if (!deleted.length) throw AppError.notFound('Document not found.')
  if (doc.file_path) {
    await removeObject(db, env.DOCUMENTS_BUCKET, doc.file_path).catch((err) => {
      console.error(`Document ${id} deleted but its file could not be removed: ${err.message}`)
    })
  }
}

/** Short-lived signed link; RLS decides whether the caller may see it. */
export async function download(db, id) {
  const doc = await getById(db, 'documents', id, 'id, file_path, file_url, file_name', 'Document')
  if (!doc.file_path) {
    if (!doc.file_url) throw AppError.notFound('This document has no file attached.')
    return { url: doc.file_url, external: true }
  }
  return {
    url: await signedUrl(db, env.DOCUMENTS_BUCKET, doc.file_path, { downloadName: doc.file_name ?? undefined }),
    expires_in: 120,
    external: false,
  }
}
