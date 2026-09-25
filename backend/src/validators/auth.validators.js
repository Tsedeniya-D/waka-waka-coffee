import { z } from 'zod'
import { email, nullablePhone, nullableText, requiredText } from './common.js'

export const loginBody = z.object({
  email,
  password: z.string({ error: 'Password is required.' }).min(6, 'Password must be at least 6 characters.').max(200),
})

export const refreshBody = z.object({
  refresh_token: z.string({ error: 'refresh_token is required.' }).min(10, 'refresh_token is required.'),
})

export const passwordResetBody = z.object({
  email,
  redirect_to: z.string().url('redirect_to must be a valid URL.').optional(),
})

export const updateMeBody = z
  .object({
    full_name: requiredText('Full name', 120),
    phone: nullablePhone,
    job_title: nullableText(120),
  })
  .strict()

const strongPassword = z
  .string({ error: 'Password is required.' })
  .min(8, 'Password must be at least 8 characters.')
  .max(200)
  .regex(/[A-Za-z]/, 'Password must contain a letter.')
  .regex(/\d/, 'Password must contain a number.')

export const changePasswordBody = z
  .object({
    current_password: z.string({ error: 'Current password is required.' }).min(1, 'Current password is required.'),
    new_password: strongPassword,
  })
  .strict()

export const completeResetBody = z.object({ new_password: strongPassword }).strict()

export { strongPassword }
