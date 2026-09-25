import { Router } from 'express'
import { createResourceController, createResourceRouter } from '../lib/resource.js'
import { authorize, requireRoles } from '../middleware/auth.js'
import { validate } from '../middleware/validate.js'
import { idParams } from '../validators/common.js'
import { sendData, sendList } from '../utils/respond.js'
import * as quality from '../services/quality.service.js'
import * as warehouses from '../services/warehouses.service.js'
import * as inventory from '../services/inventory.service.js'
import * as v from '../validators/operations.validators.js'

export const qualityRouter = createResourceRouter({
  module: 'quality',
  ctrl: createResourceController(quality),
  schemas: { list: v.inspectionList, create: v.inspectionCreate, update: v.inspectionUpdate },
  allow: { bulkDelete: true },
  extend(router) {
    router.post(
      '/:id/decision',
      authorize('quality', 'update'),
      validate({ params: idParams, body: v.decisionBody }),
      async (req, res) => sendData(res, await quality.decide(req.auth.db, req.valid.params.id, req.valid.body))
    )
    router.post(
      '/:id/reopen',
      requireRoles('admin', 'super_admin'),
      validate({ params: idParams }),
      async (req, res) => sendData(res, await quality.reopen(req.auth.db, req.valid.params.id))
    )
  },
})

export const warehousesRouter = createResourceRouter({
  module: 'warehouses',
  ctrl: createResourceController(warehouses),
  schemas: { list: v.warehouseList, create: v.warehouseCreate, update: v.warehouseUpdate },
})

/** Stock is read by several departments but only warehouse staff move it. */
export const inventoryRouter = Router()
const stockWrite = [authorize('inventory', 'update'), requireRoles('warehouse_officer', 'admin', 'super_admin')]

inventoryRouter.get('/', authorize('inventory'), validate({ query: v.inventoryList }), async (req, res) =>
  sendList(res, await inventory.list(req.auth.db, req.valid.query))
)
inventoryRouter.get('/transactions', authorize('inventory'), validate({ query: v.transactionsList }), async (req, res) =>
  sendList(res, await inventory.transactions(req.auth.db, req.valid.query))
)
inventoryRouter.get('/receivable-lots', authorize('inventory'), async (req, res) =>
  sendData(res, await inventory.receivableLots(req.auth.db))
)
inventoryRouter.post('/receive', ...stockWrite, validate({ body: v.receiveBody }), async (req, res) =>
  sendData(res, await inventory.receive(req.auth.db, req.valid.body), 201)
)
inventoryRouter.get('/:id', authorize('inventory'), validate({ params: idParams }), async (req, res) =>
  sendData(res, await inventory.get(req.auth.db, req.valid.params.id))
)
inventoryRouter.patch('/:id', ...stockWrite, validate({ params: idParams, body: v.inventoryDetailsBody }), async (req, res) =>
  sendData(res, await inventory.updateDetails(req.auth.db, req.valid.params.id, req.valid.body))
)
inventoryRouter.post('/:id/adjust', ...stockWrite, validate({ params: idParams, body: v.adjustBody }), async (req, res) =>
  sendData(res, await inventory.adjust(req.auth.db, req.valid.params.id, req.valid.body))
)
inventoryRouter.post('/:id/issue', ...stockWrite, validate({ params: idParams, body: v.issueBody }), async (req, res) =>
  sendData(res, await inventory.issue(req.auth.db, req.valid.params.id, req.valid.body))
)
inventoryRouter.post('/:id/transfer', ...stockWrite, validate({ params: idParams, body: v.transferBody }), async (req, res) =>
  sendData(res, await inventory.transfer(req.auth.db, req.valid.params.id, req.valid.body))
)
