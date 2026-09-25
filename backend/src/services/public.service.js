import { env } from '../config/env.js'
import { createAnonClient } from '../lib/supabase.js'
import { rpc } from '../lib/query.js'
import { signedUrl } from '../lib/storage.js'
import { unwrap } from '../utils/dbError.js'
import { AppError } from '../utils/AppError.js'

/**
 * Public website submissions. They run with the anonymous key and go through
 * SECURITY DEFINER functions that generate reference numbers, link/create the
 * customer and throttle abuse; anon has no direct table access.
 */
export async function submitQuoteRequest(body) {
  return rpc(
    createAnonClient(),
    'submit_quote_request',
    {
      p_full_name: body.full_name,
      p_company: body.company,
      p_email: body.email,
      p_phone: body.phone ?? null,
      p_country: body.country ?? null,
      p_destination_port: body.destination_port ?? null,
      p_product_name: body.product_name ?? null,
      p_region_name: body.region_name ?? null,
      p_grade: body.grade ?? null,
      p_processing: body.processing ?? null,
      p_quantity_kg: body.quantity_kg ?? null,
      p_packaging: body.packaging ?? null,
      p_certifications: body.certifications?.length ? body.certifications : null,
      p_target_shipment: body.target_shipment ?? null,
      p_message: body.message ?? null,
    },
    'Submitting quote request'
  )
}

export async function submitSampleRequest(body) {
  return rpc(
    createAnonClient(),
    'submit_sample_request',
    {
      p_full_name: body.full_name,
      p_company: body.company ?? null,
      p_email: body.email,
      p_country: body.country ?? null,
      p_product_name: body.product_name ?? null,
      p_sample_quantity: body.sample_quantity ?? null,
      p_sample_quantity_unit: body.sample_quantity_unit ?? 'kg',
      p_shipping_address: body.shipping_address,
      p_message: body.message ?? null,
      p_phone: body.phone ?? null,
    },
    'Submitting sample request'
  )
}

export async function submitContactMessage(body) {
  return rpc(
    createAnonClient(),
    'submit_contact_message',
    {
      p_name: body.name,
      p_email: body.email,
      p_message: body.message,
      p_phone: body.phone ?? null,
      p_company: body.company ?? null,
      p_country: body.country ?? null,
      p_subject: body.subject ?? null,
    },
    'Sending message'
  )
}

export async function subscribeNewsletter(body) {
  return rpc(
    createAnonClient(),
    'subscribe_newsletter',
    { p_email: body.email, p_source: body.source ?? 'website' },
    'Subscribing'
  )
}

const PUBLIC_PRODUCT_COLUMNS =
  'id, name, slug, description, short_description, origin, grade, variety, processing, altitude, flavor_notes, ' +
  'image_url, is_featured, harvest_season, screen_size, moisture, cup_score, packaging, availability, certifications, ' +
  'min_order_kg, sort_order, category:categories(id, name, slug), region:coffee_regions(id, name, slug), ' +
  'images:product_images(id, image_url, alt_text, is_primary, display_order)'

/** Published catalog (RLS: active and not archived). */
export async function listProducts({ featured } = {}) {
  let q = createAnonClient().from('products').select(PUBLIC_PRODUCT_COLUMNS)
  if (featured) q = q.eq('is_featured', true)
  return unwrap(await q.order('sort_order').order('name'), 'Loading products')
}

export async function getProduct(slug) {
  const row = unwrap(
    await createAnonClient().from('products').select(PUBLIC_PRODUCT_COLUMNS).eq('slug', slug).maybeSingle(),
    'Loading product'
  )
  if (!row) throw AppError.notFound('Product not found.')
  return row
}

/** Download link for a document marked public (e.g. a product specification). */
export async function publicDocumentUrl(id) {
  const db = createAnonClient()
  const doc = unwrap(
    await db.from('documents').select('id, title, file_path, file_url, file_name, is_public').eq('id', id).maybeSingle(),
    'Loading document'
  )
  if (!doc || !doc.is_public) throw AppError.notFound('Document not found.')
  if (doc.file_url && !doc.file_path) return { url: doc.file_url }
  return {
    url: await signedUrl(db, env.DOCUMENTS_BUCKET, doc.file_path, { downloadName: doc.file_name ?? undefined }),
  }
}
