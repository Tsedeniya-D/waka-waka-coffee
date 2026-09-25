import { z } from 'zod'
import { EMPLOYEE_ROLES } from '../config/permissions.js'
import { booleanish, email, listQuery, nullablePhone, nullableText, requiredText } from './common.js'
import { strongPassword } from './auth.validators.js'

const roleEnum = z.enum([...EMPLOYEE_ROLES], { error: `Role must be one of: ${EMPLOYEE_ROLES.join(', ')}.` })

export const usersListQuery = listQuery(['created_at', 'full_name', 'email', 'role', 'last_login_at']).extend({
  role: z.enum([...EMPLOYEE_ROLES, 'user']).optional(),
  status: z.enum(['active', 'inactive']).optional(),
  include_public: booleanish.optional(),
})

export const createUserBody = z
  .object({
    email,
    password: strongPassword,
    full_name: requiredText('Full name', 120).min(2, 'Full name must be at least 2 characters.'),
    role: roleEnum,
    phone: nullablePhone,
    job_title: nullableText(120),
  })
  .strict()

export const updateUserBody = z
  .object({
    full_name: requiredText('Full name', 120).optional(),
    phone: nullablePhone,
    job_title: nullableText(120),
  })
  .strict()
  .refine((b) => Object.keys(b).length > 0, 'Nothing to update.')

export const roleBody = z.object({ role: roleEnum }).strict()

export const statusBody = z.object({ is_active: z.boolean({ error: 'is_active must be true or false.' }) }).strict()

export const directoryQuery = z.object({
  role: z
    .preprocess(
      (v) => (typeof v === 'string' ? v.split(',').map((s) => s.trim()).filter(Boolean) : v),
      z.array(roleEnum).optional()
    )
    .optional(),
})
