import { z } from 'zod'
import { BATCH_STATUSES, SHIPMENT_STATUSES } from '../config/statuses.js'
import { csvEnum, listQuery, nullableDate, nullableText, optionalText, positiveNumber, requiredText, uuid } from './common.js'

export const batchList = listQuery(['created_at', 'batch_number', 'total_quantity_kg']).extend({
  status: csvEnum(BATCH_STATUSES),
  sales_order_id: uuid.optional(),
})

export const batchCreate = z
  .object({
    sales_order_id: uuid,
    allocations: z
      .array(
        z.object({
          lot_id: uuid,
          warehouse_id: uuid,
          quantity_kg: positiveNumber('Allocated quantity'),
        })
      )
      .min(1, 'Allocate at least one lot.')
      .max(200)
      .refine(
        (a) => new Set(a.map((x) => `${x.lot_id}:${x.warehouse_id}`)).size === a.length,
        'Each lot/warehouse combination can only be allocated once.'
      ),
    notes: optionalText(2000),
  })
  .strict()

export const batchUpdate = z.object({ notes: z.string().trim().max(2000).nullable() }).strict()

export const batchStatusBody = z.object({
  status: z.enum(['preparing', 'ready', 'approved', 'cancelled'], {
    error: 'Batches can be set to preparing, ready, approved or cancelled; shipping updates come from the shipment.',
  }),
  reason: optionalText(1000),
})

export const stockQuery = z.object({
  origin: optionalText(120),
  grade: optionalText(40),
  search: optionalText(100),
})

const shipmentShape = {
  destination_country: nullableText(80),
  destination_port: nullableText(120),
  port_of_loading: nullableText(120),
  carrier: nullableText(120),
  container_number: z.preprocess(
    (v) => (typeof v === 'string' ? (v.trim() === '' ? null : v.trim().toUpperCase()) : v),
    z
      .string()
      .regex(/^[A-Z]{4}\d{7}$/, 'Container number must look like ABCU1234567.')
      .nullable()
      .optional()
  ),
  vessel_name: nullableText(120),
  booking_reference: nullableText(80),
  bill_of_lading_number: nullableText(80),
  tracking_number: nullableText(80),
  shipping_date: nullableDate,
  estimated_arrival: nullableDate,
  notes: nullableText(4000),
}
const datesInOrder = (b) => !b.shipping_date || !b.estimated_arrival || b.estimated_arrival >= b.shipping_date

export const shipmentCreate = z
  .object({ export_batch_id: uuid, status: z.enum(['preparing', 'booked']).default('preparing'), ...shipmentShape })
  .strict()
  .refine(datesInOrder, { message: 'Estimated arrival cannot be before the shipping date.', path: ['estimated_arrival'] })

export const shipmentUpdate = z
  .object({ ...shipmentShape, actual_arrival: nullableDate })
  .partial()
  .strict()
  .refine((b) => Object.keys(b).length > 0, 'Nothing to update.')
  .refine(datesInOrder, { message: 'Estimated arrival cannot be before the shipping date.', path: ['estimated_arrival'] })

export const shipmentList = listQuery(['created_at', 'shipment_number', 'shipping_date', 'estimated_arrival']).extend({
  status: csvEnum(SHIPMENT_STATUSES),
  export_batch_id: uuid.optional(),
})

export const shipmentStatusBody = z.object({
  status: z.enum(SHIPMENT_STATUSES),
  location: optionalText(200),
  note: optionalText(1000),
})

export const shipmentUpdateEvent = z
  .object({
    description: requiredText('Description', 1000),
    location: optionalText(200),
    event_time: z.string().datetime({ offset: true, message: 'event_time must be an ISO date-time.' }).optional(),
  })
  .strict()
