import { Router } from 'express'
import { authorize } from '../middleware/auth.js'
import { validate } from '../middleware/validate.js'
import { idParams } from '../validators/common.js'
import { sendData, sendList, sendNoContent } from '../utils/respond.js'
import * as svc from '../services/export.service.js'
import * as v from '../validators/export.validators.js'

// -----------------------------------------------------------------------------
// Export batches (Export Manager)
// -----------------------------------------------------------------------------
export const batchesRouter = Router()
batchesRouter.get('/', authorize('export_batches'), validate({ query: v.batchList }), async (req, res) =>
  sendList(res, await svc.listBatches(req.auth.db, req.valid.query))
)
batchesRouter.get('/eligible-orders', authorize('export_batches'), async (req, res) =>
  sendData(res, await svc.eligibleOrders(req.auth.db))
)
batchesRouter.get('/available-stock', authorize('export_batches'), validate({ query: v.stockQuery }), async (req, res) =>
  sendData(res, await svc.availableStock(req.auth.db, req.valid.query))
)
batchesRouter.post('/', authorize('export_batches', 'create'), validate({ body: v.batchCreate }), async (req, res) =>
  sendData(res, await svc.createBatch(req.auth.db, req.auth, req.valid.body), 201)
)
batchesRouter.get('/:id', authorize('export_batches'), validate({ params: idParams }), async (req, res) =>
  sendData(res, await svc.getBatch(req.auth.db, req.valid.params.id, req.auth.role))
)
batchesRouter.patch('/:id', authorize('export_batches', 'update'), validate({ params: idParams, body: v.batchUpdate }), async (req, res) =>
  sendData(res, await svc.updateBatch(req.auth.db, req.auth, req.valid.params.id, req.valid.body))
)
batchesRouter.patch('/:id/status', authorize('export_batches', 'update'), validate({ params: idParams, body: v.batchStatusBody }), async (req, res) =>
  sendData(res, await svc.setBatchStatus(req.auth.db, req.auth, req.valid.params.id, req.valid.body))
)

// -----------------------------------------------------------------------------
// Shipments (Export Manager)
// -----------------------------------------------------------------------------
export const shipmentsRouter = Router()
shipmentsRouter.get('/', authorize('shipments'), validate({ query: v.shipmentList }), async (req, res) =>
  sendList(res, await svc.listShipments(req.auth.db, req.valid.query))
)
shipmentsRouter.get('/eligible-batches', authorize('shipments'), async (req, res) =>
  sendData(res, await svc.eligibleBatches(req.auth.db))
)
shipmentsRouter.post('/', authorize('shipments', 'create'), validate({ body: v.shipmentCreate }), async (req, res) =>
  sendData(res, await svc.createShipment(req.auth.db, req.auth, req.valid.body), 201)
)
shipmentsRouter.get('/:id', authorize('shipments'), validate({ params: idParams }), async (req, res) =>
  sendData(res, await svc.getShipment(req.auth.db, req.valid.params.id, req.auth.role))
)
shipmentsRouter.patch('/:id', authorize('shipments', 'update'), validate({ params: idParams, body: v.shipmentUpdate }), async (req, res) =>
  sendData(res, await svc.updateShipment(req.auth.db, req.auth, req.valid.params.id, req.valid.body))
)
shipmentsRouter.patch('/:id/status', authorize('shipments', 'update'), validate({ params: idParams, body: v.shipmentStatusBody }), async (req, res) =>
  sendData(res, await svc.setShipmentStatus(req.auth.db, req.auth, req.valid.params.id, req.valid.body))
)
shipmentsRouter.post('/:id/updates', authorize('shipments', 'update'), validate({ params: idParams, body: v.shipmentUpdateEvent }), async (req, res) =>
  sendData(res, await svc.addUpdate(req.auth.db, req.auth, req.valid.params.id, req.valid.body), 201)
)
shipmentsRouter.delete('/:id', authorize('shipments', 'delete'), validate({ params: idParams }), async (req, res) => {
  await svc.removeShipment(req.auth.db, req.valid.params.id)
  sendNoContent(res)
})
