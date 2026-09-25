import multer from 'multer'
import { env } from '../config/env.js'
import { AppError } from '../utils/AppError.js'

/** Allowed document types: extension -> MIME types browsers commonly send. */
const DOCUMENT_TYPES = {
  pdf: ['application/pdf'],
  png: ['image/png'],
  jpg: ['image/jpeg'],
  jpeg: ['image/jpeg'],
  webp: ['image/webp'],
  doc: ['application/msword'],
  docx: ['application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
  xls: ['application/vnd.ms-excel'],
  xlsx: ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
  csv: ['text/csv', 'application/vnd.ms-excel', 'text/plain'],
  txt: ['text/plain'],
}

const IMAGE_TYPES = {
  png: ['image/png'],
  jpg: ['image/jpeg'],
  jpeg: ['image/jpeg'],
  webp: ['image/webp'],
}

/** Leading bytes of binary formats, checked so a renamed file is rejected. */
const SIGNATURES = {
  pdf: [[0x25, 0x50, 0x44, 0x46]], // %PDF
  png: [[0x89, 0x50, 0x4e, 0x47]],
  jpg: [[0xff, 0xd8, 0xff]],
  jpeg: [[0xff, 0xd8, 0xff]],
  webp: [[0x52, 0x49, 0x46, 0x46]], // RIFF
  docx: [[0x50, 0x4b, 0x03, 0x04]], // zip
  xlsx: [[0x50, 0x4b, 0x03, 0x04]],
  doc: [[0xd0, 0xcf, 0x11, 0xe0]], // OLE
  xls: [[0xd0, 0xcf, 0x11, 0xe0]],
}

export function fileExtension(name) {
  const m = /\.([a-z0-9]+)$/i.exec(name ?? '')
  return m ? m[1].toLowerCase() : ''
}

function matchesSignature(ext, buffer) {
  const sigs = SIGNATURES[ext]
  if (!sigs) return true
  return sigs.some((sig) => sig.every((byte, i) => buffer[i] === byte))
}

/** Make a user-supplied file name safe for a storage path. */
export function safeFileName(name) {
  const basename = String(name ?? 'file').split(/[\\/]/).pop()
  const ext = fileExtension(basename)
  const base = basename
    .replace(/\.[a-z0-9]+$/i, '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\w-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80)
  return `${base || 'file'}${ext ? `.${ext}` : ''}`
}

function buildUpload(allowed, maxMb) {
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: maxMb * 1024 * 1024, files: 1, fields: 20 },
    fileFilter(_req, file, cb) {
      const ext = fileExtension(file.originalname)
      const mimes = allowed[ext]
      if (!mimes) {
        return cb(new AppError(415, `File type .${ext || '?'} is not allowed. Allowed: ${Object.keys(allowed).join(', ')}.`, { code: 'UNSUPPORTED_FILE_TYPE' }))
      }
      if (!mimes.includes(file.mimetype) && file.mimetype !== 'application/octet-stream') {
        return cb(new AppError(415, `The file content type (${file.mimetype}) does not match its .${ext} extension.`, { code: 'UNSUPPORTED_FILE_TYPE' }))
      }
      cb(null, true)
    },
  })

  /**
   * @param {string} field multipart field name
   * @param {{ required?: boolean }} [opts]
   */
  return (field, { required = true } = {}) =>
    function handleUpload(req, res, next) {
      upload.single(field)(req, res, (err) => {
        if (err instanceof multer.MulterError) {
          const message =
            err.code === 'LIMIT_FILE_SIZE' ? `The file is larger than ${maxMb} MB.` : `Upload rejected: ${err.message}.`
          return next(new AppError(err.code === 'LIMIT_FILE_SIZE' ? 413 : 400, message, { code: 'UPLOAD_REJECTED' }))
        }
        if (err) return next(err)
        if (!req.file) {
          return required ? next(AppError.badRequest(`Attach a file in the "${field}" field.`)) : next()
        }
        const ext = fileExtension(req.file.originalname)
        if (!matchesSignature(ext, req.file.buffer)) {
          return next(new AppError(415, `The file does not look like a valid .${ext} file.`, { code: 'UNSUPPORTED_FILE_TYPE' }))
        }
        // Normalise the MIME type from the verified extension.
        req.file.mimetype = allowed[ext][0]
        next()
      })
    }
}

export const uploadDocument = buildUpload(DOCUMENT_TYPES, env.MAX_UPLOAD_MB)
export const uploadImage = buildUpload(IMAGE_TYPES, Math.min(env.MAX_UPLOAD_MB, 5))
