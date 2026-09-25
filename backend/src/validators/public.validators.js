import { z } from 'zod'
import { email, optionalText, requiredText } from './common.js'

const phone = z.preprocess(
  (v) => (typeof v === 'string' ? (v.trim() === '' ? undefined : v.trim()) : v),
  z.string().max(40).regex(/^[+()\d\s.-]{5,40}$/, 'Enter a valid phone number.').optional()
)

export const quoteRequestBody = z.object({
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
  quantity_kg: z.preprocess(
    (v) => (v === '' || v === null ? undefined : v),
    z.coerce.number({ error: 'Quantity must be a number.' }).positive('Quantity must be greater than 0.').max(10_000_000).optional()
  ),
  packaging: optionalText(80),
  certifications: z.array(z.string().trim().min(1).max(60)).max(20).optional(),
  target_shipment: optionalText(80),
  message: optionalText(4000),
})

export const sampleRequestBody = z.object({
  full_name: requiredText('Full name', 120).min(2, 'Full name must be at least 2 characters.'),
  company: requiredText('Company', 160).min(2, 'Company must be at least 2 characters.'),
  email,
  phone,
  country: requiredText('Country', 80),
  product_name: optionalText(160),
  sample_quantity: z.preprocess(
    (v) => (v === '' || v === null ? undefined : v),
    z.coerce.number({ error: 'Sample quantity must be a number.' }).positive().max(10, 'Samples are limited to 10 kg.').optional()
  ),
  sample_quantity_unit: z.enum(['kg']).default('kg'),
  shipping_address: requiredText('Shipping address', 500).min(10, 'Enter a complete shipping address.'),
  message: optionalText(4000),
})

export const contactMessageBody = z
  .object({
    name: optionalText(160),
    first_name: optionalText(80),
    last_name: optionalText(80),
    email,
    phone,
    company: optionalText(160),
    country: optionalText(80),
    subject: optionalText(200),
    message: requiredText('Message', 5000).min(10, 'Message must be at least 10 characters.'),
  })
  .transform((b) => ({ ...b, name: b.name ?? [b.first_name, b.last_name].filter(Boolean).join(' ').trim() }))
  .refine((b) => b.name.length >= 2, { message: 'Your name is required.', path: ['name'] })

export const newsletterBody = z.object({
  email,
  source: optionalText(40),
})

export const slugParams = z.object({ slug: z.string().trim().min(1).max(160).regex(/^[a-z0-9-]+$/i, 'Invalid product.') })
