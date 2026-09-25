import { Router } from 'express'
import { validate } from '../middleware/validate.js'
import { uploadDocument } from '../middleware/upload.js'
import { idParams } from '../validators/common.js'
import { documentCreate, documentList, documentUpdate } from '../validators/documents.validators.js'
import { sendData, sendList, sendNoContent } from '../utils/respond.js'
import * as svc from '../services/documents.service.js'

/**
 * Documents are attached by several departments (quotations by Sales, quality
 * certificates by Quality, export papers by Export). Access is decided per
 * record: canAttach() here and can_access_document() in RLS/storage policies.
 * Mounted after `authenticate` (active employees only).
 */
const router = Router()

router.get('/', validate({ query: documentList }), async (req, res) =>
  sendList(res, await svc.list(req.auth.db, req.valid.query))
)
router.post('/', uploadDocument('file', { required: false }), validate({ body: documentCreate }), async (req, res) =>
  sendData(res, await svc.create(req.auth.db, req.auth, req.valid.body, req.file), 201)
)
router.get('/:id', validate({ params: idParams }), async (req, res) =>
  sendData(res, await svc.get(req.auth.db, req.valid.params.id))
)
router.get('/:id/download', validate({ params: idParams }), async (req, res) =>
  sendData(res, await svc.download(req.auth.db, req.valid.params.id))
)
router.patch('/:id', validate({ params: idParams, body: documentUpdate }), async (req, res) =>
  sendData(res, await svc.update(req.auth.db, req.auth, req.valid.params.id, req.valid.body))
)
router.delete('/:id', validate({ params: idParams }), async (req, res) => {
  await svc.remove(req.auth.db, req.auth, req.valid.params.id)
  sendNoContent(res)
})

export default router
