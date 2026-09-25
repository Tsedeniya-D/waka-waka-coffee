import { z } from 'zod'
import { INVENTORY_STATUSES, QUALITY_APPROVALS, QUALITY_RESULTS, SAMPLE_TYPES, TRANSACTION_TYPES } from '../config/statuses.js'
import {
  booleanish,
  csvEnum,
  dateOnly,
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

// --- Quality inspections -------------------------------------------------------
const inspectionShape = {
  lot_id: uuid,
  inspection_date: dateOnly,
  sample_type: z.enum(SAMPLE_TYPES),
  sample_reference: nullableText(120),
  moisture: nullableNumber('Moisture', { min: 0, max: 100 }),
  defect_count: nullableNumber('Defect count', { min: 0, max: 10000, int: true }),
  screen_size: nullableText(40),
  cup_score: nullableNumber('Cup score', { min: 0, max: 100 }),
  aroma: nullableText(200),
  flavor: nullableText(500),
  acidity: nullableText(200),
  body: nullableText(200),
  final_grade: nullableText(40),
  result: z.enum(QUALITY_RESULTS),
  notes: nullableText(4000),
}
export const inspectionCreate = z
  .object({ ...inspectionShape, sample_type: inspectionShape.sample_type.default('offer'), result: inspectionShape.result.default('pending') })
  .strict()
export const inspectionUpdate = partial(inspectionShape)
export const inspectionList = listQuery(['created_at', 'inspection_date', 'cup_score']).extend({
  lot_id: uuid.optional(),
  result: csvEnum(QUALITY_RESULTS),
  approval_status: csvEnum(QUALITY_APPROVALS),
  sample_type: z.enum(SAMPLE_TYPES).optional(),
})
export const decisionBody = z
  .object({
    decision: z.enum(['approved', 'rejected'], { error: 'Decision must be approved or rejected.' }),
    notes: optionalText(2000),
  })
  .strict()

// --- Warehouses ----------------------------------------------------------------
const warehouseShape = {
  code: optionalText(20),
  name: requiredText('Name', 160),
  location: requiredText('Location', 300),
  location_id: nullableUuid,
  capacity_kg: nullableNumber('Capacity', { min: 0 }),
  manager_id: nullableUuid,
  contact_person: nullableText(120),
  phone: nullablePhone,
  email: nullableEmail,
  notes: nullableText(2000),
  temperature_min_c: nullableNumber('Minimum temperature', { min: -30, max: 60 }),
  temperature_max_c: nullableNumber('Maximum temperature', { min: -30, max: 60 }),
  humidity_min_percent: nullableNumber('Minimum humidity', { min: 0, max: 100 }),
  humidity_max_percent: nullableNumber('Maximum humidity', { min: 0, max: 100 }),
  ventilation: nullableText(200),
  lighting: nullableText(200),
  pallet_required: z.boolean(),
  wall_clearance_m: nullableNumber('Wall clearance', { min: 0, max: 50 }),
  ceiling_clearance_m: nullableNumber('Ceiling clearance', { min: 0, max: 50 }),
  packaging_type: nullableText(120),
  quality_check_zone: nullableText(120),
  pass_zone: nullableText(120),
  fail_zone: nullableText(120),
  sampling_frequency: nullableText(120),
  moisture_limit_percent: nullableNumber('Moisture limit', { min: 0, max: 100 }),
  pest_control_method: nullableText(200),
  sanitation_schedule: nullableText(120),
  is_active: z.boolean(),
}
const rangeCheck = (b) =>
  (b.temperature_min_c == null || b.temperature_max_c == null || b.temperature_min_c <= b.temperature_max_c) &&
  (b.humidity_min_percent == null || b.humidity_max_percent == null || b.humidity_min_percent <= b.humidity_max_percent)
export const warehouseCreate = z
  .object({ ...warehouseShape, pallet_required: warehouseShape.pallet_required.default(true), is_active: warehouseShape.is_active.default(true) })
  .strict()
  .refine(rangeCheck, 'Minimum values must not exceed maximum values.')
export const warehouseUpdate = partial(warehouseShape).refine(rangeCheck, 'Minimum values must not exceed maximum values.')
export const warehouseList = listQuery(['created_at', 'name', 'code']).extend({
  status: z.enum(['active', 'inactive']).optional(),
})

// --- Inventory -----------------------------------------------------------------
export const inventoryList = listQuery(['created_at', 'received_date', 'quantity_kg', 'updated_at']).extend({
  warehouse_id: uuid.optional(),
  lot_id: uuid.optional(),
  status: csvEnum(INVENTORY_STATUSES),
  low_stock: booleanish.optional(),
  in_stock: booleanish.optional(),
})
export const receiveBody = z
  .object({
    lot_id: uuid,
    warehouse_id: uuid,
    quantity_kg: positiveNumber('Quantity'),
    bag_count: nullableNumber('Bag count', { min: 0, int: true }),
    weight_per_bag_kg: nullableNumber('Weight per bag', { min: 0 }),
    unit_cost_per_kg: nullableNumber('Unit cost', { min: 0 }),
    shipping_cost: nullableNumber('Shipping cost', { min: 0 }),
    par_level_bags: nullableNumber('Reorder level', { min: 0, int: true }),
    received_date: nullableDate,
    notes: nullableText(2000),
  })
  .strict()
export const adjustBody = z
  .object({
    delta_kg: z.coerce
      .number({ error: 'Adjustment must be a number.' })
      .refine((n) => Number.isFinite(n) && n !== 0, 'Adjustment must be a non-zero number.'),
    reason: requiredText('Reason', 500).min(3, 'Give a reason for the adjustment.'),
  })
  .strict()
export const issueBody = z
  .object({
    quantity_kg: positiveNumber('Quantity'),
    reason: requiredText('Reason', 500).min(3, 'Give a reason for issuing stock.'),
    reference_type: optionalText(40),
    reference_id: uuid.optional(),
  })
  .strict()
export const transferBody = z
  .object({
    to_warehouse_id: uuid,
    quantity_kg: positiveNumber('Quantity'),
    notes: optionalText(500),
  })
  .strict()
export const inventoryDetailsBody = partial({
  bag_count: nullableNumber('Bag count', { min: 0, int: true }),
  weight_per_bag_kg: nullableNumber('Weight per bag', { min: 0 }),
  unit_cost_per_kg: nullableNumber('Unit cost', { min: 0 }),
  shipping_cost: nullableNumber('Shipping cost', { min: 0 }),
  par_level_bags: nullableNumber('Reorder level', { min: 0, int: true }),
  roast_loss_percent: nullableNumber('Roast loss', { min: 0, max: 100 }),
  coffee_type: nullableText(80),
  inventory_type: z.enum(['green', 'roasted']),
  notes: nullableText(2000),
})
export const transactionsList = listQuery(['created_at']).extend({
  lot_id: uuid.optional(),
  warehouse_id: uuid.optional(),
  transaction_type: csvEnum(TRANSACTION_TYPES),
})
