import { z } from 'zod'

/**
 * Client-side validation for the public website forms. These mirror the
 * backend validators (backend/src/validators/public.validators.js) so users
 * get the same messages before the request is sent; the API re-validates.
 */

/** Trimmed optional text; '' becomes undefined so it is omitted from the payload. */
const optionalText = (max = 2000) =>
  z.preprocess(
    (v) => (typeof v === 'string' ? (v.trim() === '' ? undefined : v.trim()) : v),
    z.string().max(max, `Must be at most ${max} characters.`).optional()
  )

const requiredText = (label: string, max = 500) =>
  z
    .string({ error: `${label} is required.` })
    .trim()
    .min(1, `${label} is required.`)
    .max(max, `${label} must be at most ${max} characters.`)

const email = z.string().trim().toLowerCase().email('Enter a valid email address.').max(254)

/** Optional phone: digits, spaces and + ( ) - . only. */
const phone = z.preprocess(
  (v) => (typeof v === 'string' ? (v.trim() === '' ? undefined : v.trim()) : v),
  z.string().max(40).regex(/^[+()\d\s.-]{5,40}$/, 'Enter a valid phone number.').optional()
)

/** Optional positive number that accepts numeric strings from inputs. */
const optionalPositive = (label: string, max: number, maxMessage?: string) =>
  z.preprocess(
    (v) => (v === '' || v === null || v === undefined ? undefined : v),
    z.coerce
      .number({ error: `${label} must be a number.` })
      .refine((n) => Number.isFinite(n), `${label} must be a number.`)
      .refine((n) => n > 0, `${label} must be greater than 0.`)
      .refine((n) => n <= max, maxMessage ?? `${label} must be at most ${max}.`)
      .optional()
  )

export const contactMessageSchema = z.object({
  first_name: requiredText('First name', 80).min(2, 'First name must be at least 2 characters.'),
  last_name: requiredText('Last name', 80),
  email,
  phone,
  company: optionalText(160),
  country: optionalText(80),
  subject: optionalText(200),
  message: requiredText('Message', 5000).min(10, 'Message must be at least 10 characters.'),
})

export const newsletterSchema = z.object({
  email,
  source: optionalText(40),
})

/** Mirrors quoteRequestBody. */
export const quoteRequestSchema = z.object({
  full_name: requiredText('Full name', 120).min(2, 'Full name must be at least 2 characters.'),
  company: requiredText('Company', 160).min(2, 'Company must be at least 2 characters.'),
  email,
  phone,
  country: requiredText('Country', 80),
  destination_port: optionalText(120),
  product_name: optionalText(160),
  region_name: optionalText(120),
  grade: optionalText(40),
  processing: optionalText(60),
  quantity_kg: optionalPositive('Quantity', 10_000_000),
  packaging: optionalText(80),
  certifications: z.array(z.string().trim().min(1).max(60)).max(20).optional(),
  target_shipment: optionalText(80),
  message: optionalText(4000),
})

/** Mirrors sampleRequestBody. sample_quantity is in kg. */
export const sampleRequestSchema = z.object({
  full_name: requiredText('Full name', 120).min(2, 'Full name must be at least 2 characters.'),
  company: requiredText('Company', 160).min(2, 'Company must be at least 2 characters.'),
  email,
  phone,
  country: requiredText('Country', 80),
  product_name: optionalText(160),
  sample_quantity: optionalPositive('Sample quantity', 10, 'Samples are limited to 10 kg.'),
  sample_quantity_unit: z.literal('kg').default('kg'),
  shipping_address: requiredText('Shipping address', 500).min(10, 'Enter a complete shipping address.'),
  message: optionalText(4000),
})

export const loginSchema = z.object({
  email: z.string().trim().email('Valid email is required'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
})

export type ContactMessageInput = z.infer<typeof contactMessageSchema>
export type NewsletterInput = z.infer<typeof newsletterSchema>
export type QuoteRequestInput = z.infer<typeof quoteRequestSchema>
export type SampleRequestInput = z.infer<typeof sampleRequestSchema>
export type LoginInput = z.infer<typeof loginSchema>
