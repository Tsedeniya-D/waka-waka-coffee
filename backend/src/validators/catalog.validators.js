import { z } from 'zod'
import { PRODUCT_AVAILABILITY } from '../config/statuses.js'
import { booleanish, listQuery, nullableNumber, nullableText, nullableUuid, optionalText, requiredText, uuid } from './common.js'

const slug = z
  .string()
  .trim()
  .toLowerCase()
  .min(2)
  .max(120)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Slug may contain lowercase letters, numbers and single hyphens.')

const textList = z.array(z.string().trim().min(1).max(80)).max(30).nullable()

const productShape = {
  name: requiredText('Name', 160),
  slug,
  description: nullableText(8000),
  short_description: nullableText(500),
  category_id: nullableUuid,
  region_id: nullableUuid,
  origin: nullableText(120),
  grade: nullableText(40),
  variety: nullableText(120),
  processing: nullableText(60),
  altitude: nullableText(60),
  flavor_notes: textList,
  certifications: textList,
  harvest_season: nullableText(80),
  screen_size: nullableText(40),
  moisture: nullableNumber('Moisture', { min: 0, max: 100 }),
  cup_score: nullableNumber('Cup score', { min: 0, max: 100 }),
  packaging: nullableText(120),
  availability: z.enum(PRODUCT_AVAILABILITY),
  min_order_kg: nullableNumber('Minimum order', { min: 0 }),
  sort_order: z.coerce.number().int().min(0).max(10000),
  is_active: z.boolean(),
  is_featured: z.boolean(),
}

export const productCreate = z
  .object({
    ...productShape,
    slug: slug.optional(),
    availability: productShape.availability.default('available'),
    sort_order: productShape.sort_order.default(0),
    is_active: productShape.is_active.default(false),
    is_featured: productShape.is_featured.default(false),
  })
  .strict()

export const productUpdate = z
  .object(productShape)
  .partial()
  .strict()
  .refine((b) => Object.keys(b).length > 0, 'Nothing to update.')

export const productList = listQuery(['created_at', 'name', 'sort_order']).extend({
  status: z.enum(['published', 'draft', 'archived', 'all']).optional(),
  featured: booleanish.optional(),
  category_id: uuid.optional(),
  region_id: uuid.optional(),
})

export const publishBody = z.object({ is_active: z.boolean() }).strict()
export const featureBody = z.object({ is_featured: z.boolean() }).strict()
export const archiveBody = z.object({ is_archived: z.boolean() }).strict()

export const imageParams = z.object({ id: uuid, imageId: uuid })
export const imageUpload = z.object({
  alt_text: optionalText(200),
  is_primary: booleanish.default(false),
})
export const imageUpdate = z
  .object({
    alt_text: nullableText(200),
    is_primary: z.boolean(),
    display_order: z.coerce.number().int().min(0).max(1000),
  })
  .partial()
  .strict()
  .refine((b) => Object.keys(b).length > 0, 'Nothing to update.')

const taxonomyShape = {
  name: requiredText('Name', 120),
  slug,
  description: nullableText(2000),
  image_url: z.preprocess((v) => (v === '' ? null : v), z.string().url().nullable().optional()),
  is_active: z.boolean(),
}
export const categoryCreate = z
  .object({ ...taxonomyShape, slug: slug.optional(), is_active: taxonomyShape.is_active.default(true) })
  .strict()
export const categoryUpdate = z.object(taxonomyShape).partial().strict()
export const regionCreate = z
  .object({
    ...taxonomyShape,
    slug: slug.optional(),
    is_active: taxonomyShape.is_active.default(true),
    altitude: nullableText(60),
    flavor_notes: textList.optional(),
    processing_methods: textList.optional(),
  })
  .strict()
export const regionUpdate = z
  .object({ ...taxonomyShape, altitude: nullableText(60), flavor_notes: textList, processing_methods: textList })
  .partial()
  .strict()
export const taxonomyList = listQuery(['created_at', 'name']).extend({ status: z.enum(['active', 'inactive']).optional() })
