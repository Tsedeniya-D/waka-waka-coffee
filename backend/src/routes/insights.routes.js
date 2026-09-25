import { Router } from 'express'
import { z } from 'zod'
import { authorize, requireRoles } from '../middleware/auth.js'
import { validate } from '../middleware/validate.js'
import { EMPLOYEE_ROLES } from '../config/permissions.js'
import { dateOnly, idParams, listQuery, optionalText, requiredText, uuid } from '../validators/common.js'
import { sendData, sendList, sendNoContent } from '../utils/respond.js'
import * as svc from '../services/insights.service.js'

// -----------------------------------------------------------------------------
// Traceability
// -----------------------------------------------------------------------------
export const traceabilityRouter = Router()
traceabilityRouter.use(authorize('traceability'))
traceabilityRouter.get(
  '/',
  validate({ query: z.object({ search: optionalText(100), page: z.coerce.number().int().min(1).optional(), limit: z.coerce.number().int().min(1).max(500).optional() }) }),
  async (req, res) => sendList(res, await svc.traceOverview(req.auth.db, req.valid.query))
)
traceabilityRouter.get('/search', validate({ query: z.object({ q: requiredText('Search', 100) }) }), async (req, res) =>
  sendData(res, await svc.traceSearch(req.auth.db, req.valid.query.q))
)
traceabilityRouter.get('/lots/:id', validate({ params: idParams }), async (req, res) =>
  sendData(res, await svc.traceLot(req.auth.db, req.valid.params.id))
)
traceabilityRouter.get('/shipments/:id', validate({ params: idParams }), async (req, res) =>
  sendData(res, await svc.traceShipment(req.auth.db, req.valid.params.id))
)

// -----------------------------------------------------------------------------
// Notifications (own inbox)
// -----------------------------------------------------------------------------
export const notificationsRouter = Router()
notificationsRouter.use(authorize('notifications'))
const notificationList = listQuery(['created_at']).extend({
  filter: z.enum(['all', 'unread', 'read']).optional(),
  type: optionalText(60),
})
notificationsRouter.get('/', validate({ query: notificationList }), async (req, res) =>
  sendList(res, await svc.listNotifications(req.auth.db, req.auth.userId, req.valid.query))
)
notificationsRouter.get('/unread-count', async (req, res) => sendData(res, await svc.unreadCount(req.auth.db, req.auth.userId)))
notificationsRouter.post('/read-all', async (req, res) => sendData(res, await svc.markAllRead(req.auth.db, req.auth.userId)))
notificationsRouter.post(
  '/broadcast',
  requireRoles('admin', 'super_admin'),
  validate({
    body: z
      .object({
        title: requiredText('Title', 160),
        message: requiredText('Message', 2000),
        roles: z.array(z.enum([...EMPLOYEE_ROLES])).max(20).optional(),
        user_ids: z.array(uuid).max(500).optional(),
      })
      .refine((b) => b.roles?.length || b.user_ids?.length, 'Choose at least one role or person.'),
  }),
  async (req, res) => sendData(res, await svc.broadcast(req.auth.db, req.valid.body), 201)
)
notificationsRouter.patch(
  '/:id',
  validate({ params: idParams, body: z.object({ is_read: z.boolean() }).strict() }),
  async (req, res) => sendData(res, await svc.setRead(req.auth.db, req.auth.userId, req.valid.params.id, req.valid.body.is_read))
)
notificationsRouter.delete('/:id', validate({ params: idParams }), async (req, res) => {
  await svc.removeNotification(req.auth.db, req.auth.userId, req.valid.params.id)
  sendNoContent(res)
})

// -----------------------------------------------------------------------------
// Reports, dashboard, audit log
// -----------------------------------------------------------------------------
export const reportsRouter = Router()
reportsRouter.get(
  '/summary',
  authorize('reports'),
  validate({
    query: z
      .object({ from: dateOnly.optional(), to: dateOnly.optional() })
      .refine((q) => !q.from || !q.to || q.from <= q.to, 'The start date must be before the end date.'),
  }),
  async (req, res) => sendData(res, await svc.reportSummary(req.auth.db, req.valid.query))
)

export const dashboardRouter = Router()
dashboardRouter.get('/', authorize('dashboard'), async (req, res) => sendData(res, await svc.dashboard(req.auth.db, req.auth)))

export const activityRouter = Router()
activityRouter.get(
  '/',
  requireRoles('admin', 'super_admin'),
  validate({
    query: listQuery(['created_at']).extend({
      entity_type: optionalText(60),
      entity_id: uuid.optional(),
      user_id: uuid.optional(),
      action: optionalText(40),
    }),
  }),
  async (req, res) => sendList(res, await svc.activityLogs(req.auth.db, req.valid.query))
)
