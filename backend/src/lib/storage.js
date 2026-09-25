import { randomUUID } from 'node:crypto'
import { AppError } from '../utils/AppError.js'
import { safeFileName } from '../middleware/upload.js'

/**
 * Storage helpers. Callers pass the request's user-scoped client, so the
 * storage.objects RLS policies from the migrations decide who may upload,
 * read or delete (the service key is never needed for files).
 */

function storageError(error, action) {
  const status = Number(error?.statusCode ?? error?.status)
  if (status === 403 || /row-level security|unauthori[sz]ed|not allowed/i.test(error?.message ?? '')) {
    return AppError.forbidden(`You do not have permission to ${action}.`)
  }
  if (status === 404 || /not found/i.test(error?.message ?? '')) {
    return AppError.notFound('File not found in storage.')
  }
  if (status === 413 || /exceeded the maximum allowed size/i.test(error?.message ?? '')) {
    return new AppError(413, 'The file is too large for this bucket.', { code: 'PAYLOAD_TOO_LARGE' })
  }
  return AppError.unavailable(`File storage failed to ${action}. Please retry.`)
}

/** Build a collision-free object path: <folder>/<uuid>-<safe-name> */
export function objectPath(folder, originalName) {
  const clean = folder
    .split('/')
    .map((p) => p.replace(/[^\w-]+/g, '-'))
    .filter(Boolean)
    .join('/')
  return `${clean}/${randomUUID()}-${safeFileName(originalName)}`
}

export async function uploadObject(db, bucket, path, file) {
  const { error } = await db.storage.from(bucket).upload(path, file.buffer, {
    contentType: file.mimetype,
    cacheControl: '3600',
    upsert: false,
  })
  if (error) throw storageError(error, 'upload this file')
  return path
}

export async function removeObject(db, bucket, path) {
  if (!path) return
  const { error } = await db.storage.from(bucket).remove([path])
  if (error) throw storageError(error, 'delete this file')
}

/** Short-lived download link for a private object. */
export async function signedUrl(db, bucket, path, { expiresIn = 120, downloadName } = {}) {
  const { data, error } = await db.storage
    .from(bucket)
    .createSignedUrl(path, expiresIn, downloadName ? { download: downloadName } : undefined)
  if (error || !data?.signedUrl) throw storageError(error ?? {}, 'open this file')
  return data.signedUrl
}

export function publicUrl(db, bucket, path) {
  return db.storage.from(bucket).getPublicUrl(path).data.publicUrl
}
