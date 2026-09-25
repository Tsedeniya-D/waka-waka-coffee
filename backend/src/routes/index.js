import { Router } from 'express'
import healthRoutes from './health.routes.js'
import authRoutes from './auth.routes.js'
import publicRoutes from './public.routes.js'
import usersRoutes from './users.routes.js'
import documentsRoutes from './documents.routes.js'
import { authenticate } from '../middleware/auth.js'
import { categoriesRouter, productsRouter, regionsRouter } from './catalog.routes.js'
import { contactsRouter, customersRouter, newsletterRouter, ordersRouter, quotesRouter, samplesRouter } from './sales.routes.js'
import {
  collectionsRouter,
  farmersRouter,
  farmsRouter,
  locationsRouter,
  lotsRouter,
  suppliersRouter,
} from './sourcing.routes.js'
import { inventoryRouter, qualityRouter, warehousesRouter } from './operations.routes.js'
import { batchesRouter, shipmentsRouter } from './export.routes.js'
import {
  activityRouter,
  dashboardRouter,
  notificationsRouter,
  reportsRouter,
  traceabilityRouter,
} from './insights.routes.js'

/** All routes are mounted under /api/v1 (see app.js). */
const router = Router()

router.use('/health', healthRoutes)
router.use('/auth', authRoutes)
router.use('/public', publicRoutes)

// Everything below requires an active employee session; each router then
// checks the role's module permission, and RLS applies to every query.
const secured = [
  ['/users', usersRoutes],
  ['/dashboard', dashboardRouter],
  ['/notifications', notificationsRouter],
  ['/activity-logs', activityRouter],
  ['/products', productsRouter],
  ['/categories', categoriesRouter],
  ['/coffee-regions', regionsRouter],
  ['/customers', customersRouter],
  ['/quote-requests', quotesRouter],
  ['/sample-requests', samplesRouter],
  ['/contact-messages', contactsRouter],
  ['/newsletter-subscribers', newsletterRouter],
  ['/sales-orders', ordersRouter],
  ['/suppliers', suppliersRouter],
  ['/farmers', farmersRouter],
  ['/farms', farmsRouter],
  ['/locations', locationsRouter],
  ['/collections', collectionsRouter],
  ['/lots', lotsRouter],
  ['/quality-inspections', qualityRouter],
  ['/warehouses', warehousesRouter],
  ['/inventory', inventoryRouter],
  ['/export-batches', batchesRouter],
  ['/shipments', shipmentsRouter],
  ['/documents', documentsRoutes],
  ['/traceability', traceabilityRouter],
  ['/reports', reportsRouter],
]
for (const [path, r] of secured) router.use(path, authenticate, r)

export default router
