import { Router } from 'express'
import { authorize } from '../middleware/auth.js'
import { validate } from '../middleware/validate.js'
import { uploadImage } from '../middleware/upload.js'
import { createResourceController, createResourceRouter } from '../lib/resource.js'
import { idParams } from '../validators/common.js'
import { sendData, sendList, sendNoContent } from '../utils/respond.js'
import * as svc from '../services/catalog.service.js'
import * as v from '../validators/catalog.validators.js'

export const productsRouter = Router()
const id = (req) => req.valid.params.id

productsRouter.get('/', authorize('products'), validate({ query: v.productList }), async (req, res) =>
  sendList(res, await svc.listProducts(req.auth.db, req.valid.query))
)
productsRouter.post('/', authorize('products', 'create'), validate({ body: v.productCreate }), async (req, res) =>
  sendData(res, await svc.createProduct(req.auth.db, req.valid.body), 201)
)
productsRouter.get('/:id', authorize('products'), validate({ params: idParams }), async (req, res) =>
  sendData(res, await svc.getProduct(req.auth.db, id(req)))
)
productsRouter.patch('/:id', authorize('products', 'update'), validate({ params: idParams, body: v.productUpdate }), async (req, res) =>
  sendData(res, await svc.updateProduct(req.auth.db, id(req), req.valid.body))
)
productsRouter.patch('/:id/publish', authorize('products', 'update'), validate({ params: idParams, body: v.publishBody }), async (req, res) =>
  sendData(res, await svc.setPublished(req.auth.db, id(req), req.valid.body.is_active))
)
productsRouter.patch('/:id/feature', authorize('products', 'update'), validate({ params: idParams, body: v.featureBody }), async (req, res) =>
  sendData(res, await svc.setFeatured(req.auth.db, id(req), req.valid.body.is_featured))
)
productsRouter.patch('/:id/archive', authorize('products', 'update'), validate({ params: idParams, body: v.archiveBody }), async (req, res) =>
  sendData(res, await svc.setArchived(req.auth.db, id(req), req.valid.body.is_archived))
)
productsRouter.post('/:id/images', authorize('products', 'update'), validate({ params: idParams }), uploadImage('file'), validate({ body: v.imageUpload }), async (req, res) =>
  sendData(res, await svc.addImage(req.auth.db, id(req), req.file, req.valid.body), 201)
)
productsRouter.patch('/:id/images/:imageId', authorize('products', 'update'), validate({ params: v.imageParams, body: v.imageUpdate }), async (req, res) =>
  sendData(res, await svc.updateImage(req.auth.db, id(req), req.valid.params.imageId, req.valid.body))
)
productsRouter.delete('/:id/images/:imageId', authorize('products', 'update'), validate({ params: v.imageParams }), async (req, res) =>
  sendData(res, await svc.deleteImage(req.auth.db, id(req), req.valid.params.imageId))
)
productsRouter.delete('/:id', authorize('products', 'delete'), validate({ params: idParams }), async (req, res) => {
  await svc.deleteProduct(req.auth.db, id(req))
  sendNoContent(res)
})

export const categoriesRouter = createResourceRouter({
  module: 'products',
  ctrl: createResourceController(svc.categories),
  schemas: { list: v.taxonomyList, create: v.categoryCreate, update: v.categoryUpdate },
})

export const regionsRouter = createResourceRouter({
  module: 'products',
  ctrl: createResourceController(svc.regions),
  schemas: { list: v.taxonomyList, create: v.regionCreate, update: v.regionUpdate },
})
