import { Router } from 'express'
import * as auth from '../controllers/auth.controller.js'
import { authenticate } from '../middleware/auth.js'
import { validate } from '../middleware/validate.js'
import { authLimiter } from '../middleware/security.js'
import {
  changePasswordBody,
  completeResetBody,
  loginBody,
  passwordResetBody,
  refreshBody,
  updateMeBody,
} from '../validators/auth.validators.js'

const router = Router()

router.post('/login', authLimiter, validate({ body: loginBody }), auth.login)
router.post('/refresh', authLimiter, validate({ body: refreshBody }), auth.refresh)
router.post('/password-reset', authLimiter, validate({ body: passwordResetBody }), auth.requestPasswordReset)

router.post('/logout', authenticate, auth.logout)
router.get('/me', authenticate, auth.me)
router.patch('/me', authenticate, validate({ body: updateMeBody }), auth.updateMe)
router.post('/change-password', authLimiter, authenticate, validate({ body: changePasswordBody }), auth.changePassword)
router.post('/reset-password', authLimiter, authenticate, validate({ body: completeResetBody }), auth.completePasswordReset)
router.get('/workflows', authenticate, auth.workflows)

export default router
