import { z } from 'zod'
import { COLLECTION_STATUSES, CURRENCIES, LOCATION_TYPES, LOT_STATUSES, SUPPLIER_TYPES } from '../config/statuses.js'
import {
  csvEnum,
  dateOnly,
  listQuery,
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

const activeStatus = z.enum(['active', 'inactive']).optional()
const adminArea = {
  region: requiredText('Region', 80),
  zone: requiredText('Zone', 80),
  woreda: requiredText('Woreda', 80),
  kebele: requiredText('Kebele', 80),
}
const partial = (shape) =>
  z
    .object(shape)
    .partial()
    .strict()
    .refine((b) => Object.keys(b).length > 0, 'Nothing to update.')

// --- Suppliers ---------------------------------------------------------------
const supplierShape = {
  name: requiredText('Name', 160).min(2, 'Name must be at least 2 characters.'),
  supplier_type: z.enum(SUPPLIER_TYPES, { error: `Supplier type must be one of: ${SUPPLIER_TYPES.join(', ')}.` }),
  contact_person: nullableText(120),
  phone: nullablePhone,
  email: nullableEmail,
  ...adminArea,
  address: nullableText(500),
  notes: nullableText(2000),
}
export const supplierCreate = z.object(supplierShape).strict()
export const supplierUpdate = partial({ ...supplierShape, is_active: z.boolean() })
export const supplierList = listQuery(['created_at', 'name', 'supplier_code']).extend({
  status: activeStatus,
  supplier_type: z.enum(SUPPLIER_TYPES).optional(),
  region: optionalText(80),
})

// --- Farmers -----------------------------------------------------------------
const farmerShape = {
  name: requiredText('Name', 160).min(2, 'Name must be at least 2 characters.'),
  phone: nullablePhone,
  email: nullableEmail,
  gender: z.enum(['male', 'female', 'other']).nullable().optional(),
  national_id: nullableText(60),
  ...adminArea,
  address: nullableText(500),
  supplier_id: nullableUuid,
  notes: nullableText(2000),
}
export const farmerCreate = z.object(farmerShape).strict()
export const farmerUpdate = partial({ ...farmerShape, is_active: z.boolean() })
export const farmerList = listQuery(['created_at', 'name', 'farmer_code']).extend({
  status: activeStatus,
  region: optionalText(80),
  supplier_id: uuid.optional(),
})

// --- Farms -------------------------------------------------------------------
const farmShape = {
  farmer_id: uuid,
  farm_name: requiredText('Farm name', 160),
  ...adminArea,
  specific_location: nullableText(300),
  area_hectares: nullableNumber('Area', { min: 0, max: 100000 }),
  coffee_variety: nullableText(120),
  altitude_meters: nullableNumber('Altitude', { min: 0, max: 5000 }),
  latitude: nullableNumber('Latitude', { min: -90, max: 90 }),
  longitude: nullableNumber('Longitude', { min: -180, max: 180 }),
  location_id: nullableUuid,
  notes: nullableText(2000),
}
export const farmCreate = z.object(farmShape).strict()
export const farmUpdate = partial({ ...farmShape, is_active: z.boolean() })
export const farmList = listQuery(['created_at', 'farm_name', 'farm_code']).extend({
  status: activeStatus,
  farmer_id: uuid.optional(),
  region: optionalText(80),
})

// --- Locations ---------------------------------------------------------------
const locationShape = {
  name: requiredText('Name', 160),
  location_type: z.enum(LOCATION_TYPES, { error: `Type must be one of: ${LOCATION_TYPES.join(', ')}.` }),
  parent_id: nullableUuid,
  region: nullableText(80),
  zone: nullableText(80),
  woreda: nullableText(80),
  kebele: nullableText(80),
  address: nullableText(500),
  latitude: nullableNumber('Latitude', { min: -90, max: 90 }),
  longitude: nullableNumber('Longitude', { min: -180, max: 180 }),
  altitude_meters: nullableNumber('Altitude', { min: 0, max: 6000 }),
  notes: nullableText(2000),
}
export const locationCreate = z.object(locationShape).strict()
export const locationUpdate = partial({ ...locationShape, is_active: z.boolean() })
export const locationList = listQuery(['created_at', 'name', 'location_type']).extend({
  status: activeStatus,
  location_type: z.enum(LOCATION_TYPES).optional(),
  parent_id: uuid.optional(),
  region: optionalText(80),
})

// --- Collections -------------------------------------------------------------
const collectionShape = {
  collection_date: dateOnly.refine((d) => new Date(`${d}T00:00:00Z`) <= new Date(Date.now() + 86400000), 'Collection date cannot be in the future.'),
  supplier_id: uuid,
  farmer_id: nullableUuid,
  farm_id: nullableUuid,
  location_id: nullableUuid,
  origin: requiredText('Origin', 120),
  ...adminArea,
  coffee_type: z.enum(['Arabica', 'Robusta']),
  variety: nullableText(120),
  processing_method: z.enum(['washed', 'natural', 'honey', 'anaerobic', 'semi_washed']).nullable().optional(),
  grade: nullableText(40),
  quantity_kg: positiveNumber('Quantity').max(10_000_000, 'Quantity is too large.'),
  purchase_price: nullableNumber('Purchase price', { min: 0 }),
  currency: z.enum(CURRENCIES),
  notes: nullableText(2000),
}
// Defaults only on create: a PATCH must never reset omitted fields.
export const collectionCreate = z
  .object({
    ...collectionShape,
    coffee_type: collectionShape.coffee_type.default('Arabica'),
    currency: collectionShape.currency.default('ETB'),
  })
  .strict()
export const collectionUpdate = partial(collectionShape)
export const collectionList = listQuery(['created_at', 'collection_date', 'collection_code', 'quantity_kg']).extend({
  status: csvEnum(COLLECTION_STATUSES),
  supplier_id: uuid.optional(),
  farmer_id: uuid.optional(),
  field_officer_id: uuid.optional(),
})
export const collectionStatusBody = z.object({
  status: z.enum(['submitted', 'verified', 'rejected'], { error: 'Status must be submitted, verified or rejected.' }),
  reason: optionalText(1000),
})

// --- Coffee lots -------------------------------------------------------------
const lotShape = {
  collection_id: uuid,
  quantity_kg: positiveNumber('Quantity').max(10_000_000, 'Quantity is too large.'),
  origin: optionalText(120),
  processing_method: z.enum(['washed', 'natural', 'honey', 'anaerobic', 'semi_washed']).nullable().optional(),
  grade: nullableText(40),
  notes: nullableText(2000),
}
export const lotCreate = z.object(lotShape).strict()
export const lotUpdate = partial({
  quantity_kg: lotShape.quantity_kg,
  origin: lotShape.origin,
  processing_method: lotShape.processing_method,
  grade: lotShape.grade,
  notes: lotShape.notes,
})
export const lotList = listQuery(['created_at', 'lot_code', 'quantity_kg']).extend({
  status: csvEnum(LOT_STATUSES),
  collection_id: uuid.optional(),
  supplier_id: uuid.optional(),
  origin: optionalText(120),
})
