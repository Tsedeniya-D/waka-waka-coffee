import { Router } from 'express'
import { authorize, requireRoles } from '../middleware/auth.js'
import { validate } from '../middleware/validate.js'
import { idParams, idsBody } from '../validators/common.js'
import { sendData, sendList, sendNoContent } from '../utils/respond.js'
import * as customers from '../services/customers.service.js'
import * as quotes from '../services/quotes.service.js'
import * as samples from '../services/samples.service.js'
import * as orders from '../services/orders.service.js'
import * as v from '../validators/sales.validators.js'

const SALES = ['sales', 'admin', 'super_admin']
const auth = (req) => req.auth

// -----------------------------------------------------------------------------
// Customers (Sales manage; Export Manager reads)
// -----------------------------------------------------------------------------
export const customersRouter = Router()
customersRouter.get('/', authorize('customers'), validate({ query: v.customerList }), async (req, res) =>
  sendList(res, await customers.listCustomers(req.auth.db, req.valid.query))
)
customersRouter.post('/', authorize('customers', 'create'), requireRoles(...SALES), validate({ body: v.customerCreate }), async (req, res) =>
  sendData(res, await customers.createCustomer(req.auth.db, req.valid.body, auth(req)), 201)
)
customersRouter.post('/bulk-delete', authorize('customers', 'delete'), validate({ body: idsBody }), async (req, res) =>
  sendData(res, { deleted: await customers.deleteCustomers(req.auth.db, req.valid.body.ids) })
)
customersRouter.get('/:id', authorize('customers'), validate({ params: idParams }), async (req, res) =>
  sendData(res, await customers.getCustomer(req.auth.db, req.valid.params.id))
)
customersRouter.patch('/:id', authorize('customers', 'update'), requireRoles(...SALES), validate({ params: idParams, body: v.customerUpdate }), async (req, res) =>
  sendData(res, await customers.updateCustomer(req.auth.db, req.valid.params.id, req.valid.body))
)
customersRouter.delete('/:id', authorize('customers', 'delete'), validate({ params: idParams }), async (req, res) => {
  await customers.deleteCustomer(req.auth.db, req.valid.params.id)
  sendNoContent(res)
})

// -----------------------------------------------------------------------------
// Quote requests
// -----------------------------------------------------------------------------
export const quotesRouter = Router()
const quoteItem = validate({ params: v.itemParams, body: v.quoteItemUpdate })
quotesRouter.get('/', authorize('quote_requests'), validate({ query: v.quoteList }), async (req, res) =>
  sendList(res, await quotes.list(req.auth.db, req.valid.query))
)
quotesRouter.post('/', authorize('quote_requests', 'create'), validate({ body: v.quoteCreate }), async (req, res) =>
  sendData(res, await quotes.create(req.auth.db, req.valid.body, auth(req)), 201)
)
quotesRouter.post('/bulk-delete', authorize('quote_requests', 'delete'), validate({ body: idsBody }), async (req, res) =>
  sendData(res, await quotes.removeMany(req.auth.db, req.valid.body.ids))
)
quotesRouter.get('/:id', authorize('quote_requests'), validate({ params: idParams }), async (req, res) =>
  sendData(res, await quotes.get(req.auth.db, req.valid.params.id, req.auth.role))
)
quotesRouter.patch('/:id', authorize('quote_requests', 'update'), validate({ params: idParams, body: v.quoteUpdate }), async (req, res) =>
  sendData(res, await quotes.update(req.auth.db, req.valid.params.id, req.valid.body, auth(req)))
)
quotesRouter.patch('/:id/status', authorize('quote_requests', 'update'), validate({ params: idParams, body: v.quoteStatusBody }), async (req, res) =>
  sendData(res, await quotes.setStatus(req.auth.db, auth(req), req.valid.params.id, req.valid.body))
)
quotesRouter.patch('/:id/assign', authorize('quote_requests', 'update'), validate({ params: idParams, body: v.assignBody }), async (req, res) =>
  sendData(res, await quotes.assign(req.auth.db, auth(req), req.valid.params.id, req.valid.body.assigned_to))
)
quotesRouter.post('/:id/link-customer', authorize('quote_requests', 'update'), validate({ params: idParams }), async (req, res) =>
  sendData(res, await quotes.linkCustomer(req.auth.db, auth(req), req.valid.params.id))
)
quotesRouter.post('/:id/convert', authorize('quote_requests', 'update'), authorize('orders', 'create'), validate({ params: idParams }), async (req, res) =>
  sendData(res, await quotes.convert(req.auth.db, req.valid.params.id), 201)
)
quotesRouter.post('/:id/items', authorize('quote_requests', 'update'), validate({ params: idParams, body: v.quoteItemCreate }), async (req, res) =>
  sendData(res, await quotes.addItem(req.auth.db, auth(req), req.valid.params.id, req.valid.body), 201)
)
quotesRouter.patch('/:id/items/:itemId', authorize('quote_requests', 'update'), quoteItem, async (req, res) =>
  sendData(res, await quotes.updateItem(req.auth.db, auth(req), req.valid.params.id, req.valid.params.itemId, req.valid.body))
)
quotesRouter.delete('/:id/items/:itemId', authorize('quote_requests', 'update'), validate({ params: v.itemParams }), async (req, res) =>
  sendData(res, await quotes.removeItem(req.auth.db, auth(req), req.valid.params.id, req.valid.params.itemId))
)
quotesRouter.delete('/:id', authorize('quote_requests', 'delete'), validate({ params: idParams }), async (req, res) => {
  await quotes.remove(req.auth.db, req.valid.params.id)
  sendNoContent(res)
})

// -----------------------------------------------------------------------------
// Sample requests (separate workflow; never become sales orders)
// -----------------------------------------------------------------------------
export const samplesRouter = Router()
samplesRouter.get('/', authorize('sample_requests'), validate({ query: v.sampleList }), async (req, res) =>
  sendList(res, await samples.list(req.auth.db, req.valid.query))
)
samplesRouter.post('/', authorize('sample_requests', 'create'), validate({ body: v.sampleCreate }), async (req, res) =>
  sendData(res, await samples.create(req.auth.db, req.valid.body, auth(req)), 201)
)
samplesRouter.post('/bulk-delete', authorize('sample_requests', 'delete'), validate({ body: idsBody }), async (req, res) =>
  sendData(res, await samples.removeMany(req.auth.db, req.valid.body.ids))
)
samplesRouter.get('/:id', authorize('sample_requests'), validate({ params: idParams }), async (req, res) =>
  sendData(res, await samples.get(req.auth.db, req.valid.params.id, req.auth.role))
)
samplesRouter.patch('/:id', authorize('sample_requests', 'update'), validate({ params: idParams, body: v.sampleUpdate }), async (req, res) =>
  sendData(res, await samples.update(req.auth.db, req.valid.params.id, req.valid.body, auth(req)))
)
samplesRouter.patch('/:id/status', authorize('sample_requests', 'update'), validate({ params: idParams, body: v.sampleStatusBody }), async (req, res) =>
  sendData(res, await samples.setStatus(req.auth.db, auth(req), req.valid.params.id, req.valid.body))
)
samplesRouter.patch('/:id/assign', authorize('sample_requests', 'update'), validate({ params: idParams, body: v.assignBody }), async (req, res) =>
  sendData(res, await samples.assign(req.auth.db, auth(req), req.valid.params.id, req.valid.body.assigned_to))
)
samplesRouter.post('/:id/link-customer', authorize('sample_requests', 'update'), validate({ params: idParams }), async (req, res) =>
  sendData(res, await samples.linkCustomer(req.auth.db, auth(req), req.valid.params.id))
)
samplesRouter.delete('/:id', authorize('sample_requests', 'delete'), validate({ params: idParams }), async (req, res) => {
  await samples.remove(req.auth.db, req.valid.params.id)
  sendNoContent(res)
})

// -----------------------------------------------------------------------------
// Contact messages & newsletter subscribers
// -----------------------------------------------------------------------------
export const contactsRouter = Router()
contactsRouter.get('/', authorize('contact_messages'), validate({ query: v.contactList }), async (req, res) =>
  sendList(res, await customers.listContacts(req.auth.db, req.valid.query))
)
contactsRouter.get('/:id', authorize('contact_messages'), validate({ params: idParams }), async (req, res) =>
  sendData(res, await customers.getContact(req.auth.db, req.valid.params.id))
)
contactsRouter.patch('/:id', authorize('contact_messages', 'update'), validate({ params: idParams, body: v.contactUpdate }), async (req, res) =>
  sendData(res, await customers.updateContact(req.auth.db, req.valid.params.id, req.valid.body))
)
contactsRouter.delete('/:id', authorize('contact_messages', 'delete'), validate({ params: idParams }), async (req, res) => {
  await customers.deleteContact(req.auth.db, req.valid.params.id)
  sendNoContent(res)
})

export const newsletterRouter = Router()
newsletterRouter.get('/', authorize('contact_messages'), validate({ query: v.newsletterList }), async (req, res) =>
  sendList(res, await customers.listSubscribers(req.auth.db, req.valid.query))
)
newsletterRouter.patch('/:id', authorize('contact_messages', 'delete'), validate({ params: idParams, body: v.newsletterUpdate }), async (req, res) =>
  sendData(res, await customers.updateSubscriber(req.auth.db, req.valid.params.id, req.valid.body))
)
newsletterRouter.delete('/:id', authorize('contact_messages', 'delete'), validate({ params: idParams }), async (req, res) => {
  await customers.deleteSubscriber(req.auth.db, req.valid.params.id)
  sendNoContent(res)
})

// -----------------------------------------------------------------------------
// Sales orders: Sales create/edit/send; Export Manager accepts
// -----------------------------------------------------------------------------
export const ordersRouter = Router()
ordersRouter.get('/', authorize('orders'), validate({ query: v.orderList }), async (req, res) =>
  sendList(res, await orders.list(req.auth.db, req.valid.query))
)
ordersRouter.post('/', authorize('orders', 'create'), requireRoles(...SALES), validate({ body: v.orderCreate }), async (req, res) =>
  sendData(res, await orders.create(req.auth.db, req.valid.body, auth(req)), 201)
)
ordersRouter.get('/:id', authorize('orders'), validate({ params: idParams }), async (req, res) =>
  sendData(res, await orders.get(req.auth.db, req.valid.params.id, req.auth.role))
)
ordersRouter.patch('/:id', authorize('orders', 'update'), requireRoles(...SALES), validate({ params: idParams, body: v.orderUpdate }), async (req, res) =>
  sendData(res, await orders.update(req.auth.db, req.valid.params.id, req.valid.body, auth(req)))
)
ordersRouter.patch('/:id/status', authorize('orders', 'update'), validate({ params: idParams, body: v.orderStatusBody }), async (req, res) =>
  sendData(res, await orders.setStatus(req.auth.db, auth(req), req.valid.params.id, req.valid.body))
)
ordersRouter.post('/:id/send-to-export', authorize('orders', 'update'), requireRoles(...SALES), validate({ params: idParams }), async (req, res) =>
  sendData(res, await orders.sendToExport(req.auth.db, auth(req), req.valid.params.id))
)
ordersRouter.post('/:id/accept', authorize('orders', 'update'), requireRoles('export_manager', 'admin', 'super_admin'), validate({ params: idParams }), async (req, res) =>
  sendData(res, await orders.acceptOrder(req.auth.db, auth(req), req.valid.params.id))
)
ordersRouter.post('/:id/items', authorize('orders', 'update'), requireRoles(...SALES), validate({ params: idParams, body: v.orderItemCreate }), async (req, res) =>
  sendData(res, await orders.addItem(req.auth.db, auth(req), req.valid.params.id, req.valid.body), 201)
)
ordersRouter.patch('/:id/items/:itemId', authorize('orders', 'update'), requireRoles(...SALES), validate({ params: v.itemParams, body: v.orderItemUpdate }), async (req, res) =>
  sendData(res, await orders.updateItem(req.auth.db, auth(req), req.valid.params.id, req.valid.params.itemId, req.valid.body))
)
ordersRouter.delete('/:id/items/:itemId', authorize('orders', 'update'), requireRoles(...SALES), validate({ params: v.itemParams }), async (req, res) =>
  sendData(res, await orders.removeItem(req.auth.db, auth(req), req.valid.params.id, req.valid.params.itemId))
)
ordersRouter.delete('/:id', authorize('orders', 'delete'), validate({ params: idParams }), async (req, res) => {
  await orders.remove(req.auth.db, req.valid.params.id)
  sendNoContent(res)
})
