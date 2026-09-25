import { Router } from 'express'
import * as ctrl from '../controllers/public.controller.js'
import { validate } from '../middleware/validate.js'
import { publicFormLimiter } from '../middleware/security.js'
import { idParams } from '../validators/common.js'
import {
  contactMessageBody,
  newsletterBody,
  quoteRequestBody,
  sampleRequestBody,
  slugParams,
} from '../validators/public.validators.js'

/** Public website endpoints: no authentication, form endpoints rate-limited. */
const router = Router()

router.post('/quote-requests', publicFormLimiter, validate({ body: quoteRequestBody }), ctrl.createQuoteRequest)
router.post('/sample-requests', publicFormLimiter, validate({ body: sampleRequestBody }), ctrl.createSampleRequest)
router.post('/contact-messages', publicFormLimiter, validate({ body: contactMessageBody }), ctrl.createContactMessage)
router.post('/newsletter', publicFormLimiter, validate({ body: newsletterBody }), ctrl.subscribeNewsletter)

router.get('/products', ctrl.listProducts)
router.get('/products/:slug', validate({ params: slugParams }), ctrl.getProduct)
router.get('/documents/:id/download', validate({ params: idParams }), ctrl.downloadDocument)

export default router
