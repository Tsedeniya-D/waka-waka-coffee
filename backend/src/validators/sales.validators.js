import { z } from 'zod'
import {
  CONTACT_STATUSES,
  CURRENCIES,
  CUSTOMER_SOURCES,
  CUSTOMER_STATUSES,
  ORDER_STATUSES,
  QUOTE_STATUSES,
  SAMPLE_STATUSES,
} from '../config/statuses.js'
import {
  booleanish,
  csvEnum,
  email,
  listQuery,
  nullableDate,
  nullableEmail,
  nullableNumber,
  nullablePhone,
  nullableText,
  nullableUuid,
  optionalText,
  positiveNumber,
  requiredText,
  uuid,
} from './common.js'

const partial = (shape) =>
  z
    .object(shape)
    .partial()
    .strict()
    .refine((b) => Object.keys(b).length > 0, 'Nothing to update.')

export const assignBody = z.object({ assigned_to: nullableUuid.refine((v) => v !== undefined, 'assigned_to is required.') }).strict()

// --- Customers -----------------------------------------------------------------
const customerShape = {
  company_name: requiredText('Company name', 200).min(2, 'Company name must be at least 2 characters.'),
  contact_person: nullableText(120),
  email: nullableEmail,
  phone: nullablePhone,
  country: requiredText('Country', 80),
  city: nullableText(120),
  destination_port: nullableText(120),
  address: nullableText(500),
  notes: nullableText(4000),
  status: z.enum(CUSTOMER_STATUSES),
  assigned_to: nullableUuid,
}
export const customerCreate = z.object({ ...customerShape, status: customerShape.status.default('active') }).strict()
export const customerUpdate = partial(customerShape)
export const customerList = listQuery(['created_at', 'company_name', 'customer_code', 'country']).extend({
  status: z.enum(CUSTOMER_STATUSES).optional(),
  source: z.enum(CUSTOMER_SOURCES).optional(),
  country: optionalText(80),
  assigned_to: uuid.optional(),
})

// --- Quote requests & items ------------------------------------------------------
const quoteShape = {
  full_name: requiredText('Contact name', 120),
  company: requiredText('Company', 200),
  email,
  phone: nullablePhone,
  country: requiredText('Country', 80),
  destination_port: nullableText(120),
  product_name: nullableText(160),
  region_name: nullableText(120),
  grade: nullableText(40),
  processing: nullableText(60),
  quantity_kg: nullableNumber('Quantity', { min: 0.01, max: 10_000_000 }),
  packaging: nullableText(80),
  certifications: z.array(z.string().trim().min(1).max(60)).max(20).nullable(),
  target_shipment: nullableText(80),
  message: nullableText(4000),
  admin_notes: nullableText(4000),
  currency: z.enum(CURRENCIES),
  incoterm: nullableText(60),
  payment_terms: nullableText(200),
  valid_until: nullableDate,
  quotation_notes: nullableText(4000),
  customer_id: nullableUuid,
}
export const quoteCreate = z
  .object({ ...quoteShape, currency: quoteShape.currency.default('USD'), link_customer: z.boolean().default(true) })
  .strict()
export const quoteUpdate = partial(quoteShape)
export const quoteList = listQuery(['created_at', 'reference_number', 'company', 'quantity_kg']).extend({
  status: csvEnum(QUOTE_STATUSES),
  assigned_to: uuid.optional(),
  customer_id: uuid.optional(),
})
export const quoteStatusBody = z.object({
  status: z.enum(QUOTE_STATUSES),
  reason: optionalText(1000),
})

const quoteItemShape = {
  product_id: nullableUuid,
  description: requiredText('Description', 300),
  grade: nullableText(40),
  processing_method: nullableText(60),
  quantity_kg: positiveNumber('Quantity').max(10_000_000),
  unit_price: nullableNumber('Unit price', { min: 0 }),
  currency: z.enum(CURRENCIES),
  notes: nullableText(1000),
  sort_order: z.coerce.number().int().min(0).max(1000),
}
export const quoteItemCreate = z
  .object({ ...quoteItemShape, currency: quoteItemShape.currency.default('USD'), sort_order: quoteItemShape.sort_order.default(0) })
  .strict()
export const quoteItemUpdate = partial(quoteItemShape)
export const itemParams = z.object({ id: uuid, itemId: uuid })

// --- Sample requests -------------------------------------------------------------
const sampleShape = {
  full_name: requiredText('Contact name', 120),
  company: nullableText(200),
  email,
  phone: nullablePhone,
  country: requiredText('Country', 80),
  product_name: nullableText(160),
  sample_quantity: nullableNumber('Sample quantity', { min: 0.01, max: 10 }),
  sample_quantity_unit: z.enum(['kg']),
  shipping_address: requiredText('Shipping address', 500).min(10, 'Enter a complete shipping address.'),
  message: nullableText(4000),
  courier: nullableText(80),
  tracking_number: nullableText(80),
  admin_notes: nullableText(4000),
  customer_id: nullableUuid,
}
export const sampleCreate = z
  .object({ ...sampleShape, sample_quantity_unit: sampleShape.sample_quantity_unit.default('kg'), link_customer: z.boolean().default(true) })
  .strict()
export const sampleUpdate = partial(sampleShape)
export const sampleList = listQuery(['created_at', 'reference_number', 'company']).extend({
  status: csvEnum(SAMPLE_STATUSES),
  assigned_to: uuid.optional(),
  customer_id: uuid.optional(),
})
export const sampleStatusBody = z.object({
  status: z.enum(SAMPLE_STATUSES),
  reason: optionalText(1000),
  courier: optionalText(80),
  tracking_number: optionalText(80),
})

// --- Contact messages & newsletter ---------------------------------------------
export const contactList = listQuery(['created_at', 'name', 'email']).extend({
  status: csvEnum([...CONTACT_STATUSES, 'unread']),
})
export const contactUpdate = partial({
  status: z.enum(CONTACT_STATUSES),
  admin_notes: nullableText(4000),
  assigned_to: nullableUuid,
})
export const newsletterList = listQuery(['subscribed_at', 'email']).extend({
  active: booleanish.optional(),
})
export const newsletterUpdate = z.object({ is_active: z.boolean() }).strict()

// --- Sales orders & items ---------------------------------------------------------
const orderShape = {
  customer_id: uuid,
  product_name: requiredText('Product', 200),
  origin: nullableText(120),
  grade: nullableText(40),
  processing_method: nullableText(60),
  quantity_kg: positiveNumber('Quantity').max(10_000_000),
  unit_price: nullableNumber('Unit price', { min: 0 }),
  currency: z.enum(CURRENCIES),
  incoterm: nullableText(60),
  payment_terms: nullableText(200),
  destination_country: nullableText(80),
  destination_port: nullableText(120),
  requested_ship_date: nullableDate,
  customer_notes: nullableText(4000),
  sales_person_id: nullableUuid,
}
export const orderCreate = z.object({ ...orderShape, currency: orderShape.currency.default('USD') }).strict()
export const orderUpdate = partial(orderShape)
export const orderList = listQuery(['created_at', 'order_number', 'quantity_kg', 'requested_ship_date']).extend({
  status: csvEnum(ORDER_STATUSES),
  customer_id: uuid.optional(),
  sales_person_id: uuid.optional(),
  quote_request_id: uuid.optional(),
})
export const orderStatusBody = z.object({
  status: z.enum(ORDER_STATUSES),
  reason: optionalText(1000),
})
const orderItemShape = {
  product_id: nullableUuid,
  description: requiredText('Description', 300),
  quantity_kg: positiveNumber('Quantity').max(10_000_000),
  grade: nullableText(40),
  processing_method: nullableText(60),
  unit_price: nullableNumber('Unit price', { min: 0 }),
}
export const orderItemCreate = z.object(orderItemShape).strict()
export const orderItemUpdate = partial(orderItemShape)
