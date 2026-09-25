import { z } from 'zod'
import { DOCUMENT_RELATED_TYPES, DOCUMENT_TYPES } from '../config/statuses.js'
import { booleanish, listQuery, nullableText, optionalText, requiredText, uuid } from './common.js'

export const documentList = listQuery(['created_at', 'title', 'document_type']).extend({
  related_type: z.enum(DOCUMENT_RELATED_TYPES).optional(),
  related_id: uuid.optional(),
  document_type: z.enum(DOCUMENT_TYPES).optional(),
  is_public: booleanish.optional(),
})

/** Multipart form fields arrive as strings. */
export const documentCreate = z
  .object({
    title: requiredText('Title', 200),
    document_type: z.enum(DOCUMENT_TYPES, { error: `Document type must be one of: ${DOCUMENT_TYPES.join(', ')}.` }),
    related_type: z.enum(DOCUMENT_RELATED_TYPES).default('general'),
    related_id: z.preprocess((v) => (v === '' ? undefined : v), uuid.optional()),
    is_public: booleanish.default(false),
    notes: optionalText(2000),
    file_url: z.preprocess(
      (v) => (typeof v === 'string' && v.trim() === '' ? undefined : v),
      z
        .string()
        .url('Enter a valid link.')
        .refine((u) => /^https:\/\//i.test(u), 'Links must use https.')
        .optional()
    ),
  })
  .refine((b) => b.related_type === 'general' || b.related_id, {
    message: 'Choose the record this document belongs to.',
    path: ['related_id'],
  })

export const documentUpdate = z
  .object({
    title: requiredText('Title', 200),
    document_type: z.enum(DOCUMENT_TYPES),
    is_public: z.boolean(),
    notes: nullableText(2000),
  })
  .partial()
  .strict()
  .refine((b) => Object.keys(b).length > 0, 'Nothing to update.')
