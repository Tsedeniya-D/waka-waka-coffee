import { Router } from 'express'
import * as ctrl from '../controllers/users.controller.js'
import { authorize } from '../middleware/auth.js'
import { validate } from '../middleware/validate.js'
import { idParams } from '../validators/common.js'
import {
  createUserBody,
  directoryQuery,
  roleBody,
  statusBody,
  updateUserBody,
  usersListQuery,
} from '../validators/users.validators.js'

/** Mounted after `authenticate`. Privileged operations: administrators only. */
const router = Router()

// Any employee: colleague list for assignment pickers.
router.get('/directory', validate({ query: directoryQuery }), ctrl.directory)

router.get('/', authorize('users'), validate({ query: usersListQuery }), ctrl.list)
router.post('/', authorize('users', 'create'), validate({ body: createUserBody }), ctrl.create)
router.get('/:id', authorize('users'), validate({ params: idParams }), ctrl.get)
router.patch('/:id', authorize('users', 'update'), validate({ params: idParams, body: updateUserBody }), ctrl.update)
router.patch('/:id/role', authorize('users', 'update'), validate({ params: idParams, body: roleBody }), ctrl.changeRole)
router.patch('/:id/status', authorize('users', 'update'), validate({ params: idParams, body: statusBody }), ctrl.setStatus)
router.post('/:id/password-reset', authorize('users', 'update'), validate({ params: idParams }), ctrl.passwordReset)

export default router
