import { env } from '../config/env.js'
import { createResourceService } from '../lib/resource.js'
import { compact, getById, insertOne, runList, updateOne } from '../lib/query.js'
import { objectPath, publicUrl, removeObject, uploadObject } from '../lib/storage.js'
import { unwrap } from '../utils/dbError.js'
import { AppError } from '../utils/AppError.js'

export function slugify(text) {
  return (text ?? '')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 120)
}

/** Pick a free slug: name, name-2, name-3 ... */
async function uniqueSlug(db, table, base, excludeId) {
  const root = slugify(base) || 'item'
  const rows = unwrap(await db.from(table).select('id, slug').ilike('slug', `${root}%`), 'Checking slug')
  const taken = new Set(rows.filter((r) => r.id !== excludeId).map((r) => r.slug))
  if (!taken.has(root)) return root
  for (let i = 2; i < 1000; i++) if (!taken.has(`${root}-${i}`)) return `${root}-${i}`
  throw AppError.conflict('Could not generate a unique slug; choose one manually.')
}

// -----------------------------------------------------------------------------
// Products
// -----------------------------------------------------------------------------
const PRODUCT_SELECT =
  '*, category:categories(id, name, slug), region:coffee_regions(id, name, slug), ' +
  'images:product_images(id, image_url, alt_text, is_primary, display_order, storage_path)'

export function listProducts(db, q) {
  let query = db.from('products').select(PRODUCT_SELECT, { count: 'exact' })
  if (q.status === 'published') query = query.eq('is_active', true).eq('is_archived', false)
  else if (q.status === 'draft') query = query.eq('is_active', false).eq('is_archived', false)
  else if (q.status === 'archived') query = query.eq('is_archived', true)
  else if (!q.status) query = query.eq('is_archived', false)
  return runList(
    query,
    {
      ...q,
      sort: q.sort ?? 'sort_order',
      eq: { is_featured: q.featured, category_id: q.category_id, region_id: q.region_id },
      searchColumns: ['name', 'slug', 'origin', 'grade', 'short_description'],
    },
    'Loading products'
  )
}

export async function getProduct(db, id) {
  const product = await getById(db, 'products', id, PRODUCT_SELECT, 'Product')
  product.images?.sort((a, b) => Number(b.is_primary) - Number(a.is_primary) || (a.display_order ?? 0) - (b.display_order ?? 0))
  return product
}

export async function createProduct(db, body) {
  const values = { ...body, slug: body.slug ? body.slug : await uniqueSlug(db, 'products', body.name) }
  if (body.slug) {
    const clash = unwrap(await db.from('products').select('id').eq('slug', body.slug).maybeSingle(), 'Checking slug')
    if (clash) throw AppError.conflict(`The slug "${body.slug}" is already used by another product.`)
  }
  const row = await insertOne(db, 'products', compact(values), 'id', 'product')
  return getProduct(db, row.id)
}

export async function updateProduct(db, id, body) {
  if (body.slug) {
    const clash = unwrap(await db.from('products').select('id').eq('slug', body.slug).neq('id', id).maybeSingle(), 'Checking slug')
    if (clash) throw AppError.conflict(`The slug "${body.slug}" is already used by another product.`)
  }
  await updateOne(db, 'products', id, compact(body), 'id', 'Product')
  return getProduct(db, id)
}

/** Archiving also unpublishes, so archived products never reach the website. */
export async function setArchived(db, id, isArchived) {
  const values = isArchived ? { is_archived: true, is_active: false, is_featured: false } : { is_archived: false }
  await updateOne(db, 'products', id, values, 'id', 'Product')
  return getProduct(db, id)
}

export async function setPublished(db, id, isActive) {
  const product = await getById(db, 'products', id, 'id, is_archived', 'Product')
  if (isActive && product.is_archived) throw AppError.conflict('Restore the product from the archive before publishing it.')
  await updateOne(db, 'products', id, { is_active: isActive }, 'id', 'Product')
  return getProduct(db, id)
}

export async function setFeatured(db, id, isFeatured) {
  await updateOne(db, 'products', id, { is_featured: isFeatured }, 'id', 'Product')
  return getProduct(db, id)
}

export async function deleteProduct(db, id) {
  const product = await getProduct(db, id)
  const rows = unwrap(await db.from('products').delete().eq('id', id).select('id'), 'Deleting product')
  if (!rows.length) throw AppError.notFound('Product not found.')
  for (const img of product.images ?? []) {
    if (img.storage_path) await removeObject(db, env.PRODUCT_IMAGES_BUCKET, img.storage_path).catch(() => {})
  }
}

// --- images -------------------------------------------------------------------
async function clearPrimary(db, productId, exceptId) {
  let q = db.from('product_images').update({ is_primary: false }).eq('product_id', productId)
  if (exceptId) q = q.neq('id', exceptId)
  unwrap(await q, 'Updating images')
}

async function syncCoverImage(db, productId) {
  const images = unwrap(
    await db.from('product_images').select('image_url, is_primary, display_order').eq('product_id', productId),
    'Loading images'
  )
  const cover = images.find((i) => i.is_primary) ?? images.sort((a, b) => (a.display_order ?? 0) - (b.display_order ?? 0))[0]
  unwrap(await db.from('products').update({ image_url: cover?.image_url ?? null }).eq('id', productId), 'Updating cover image')
}

export async function addImage(db, productId, file, { alt_text, is_primary }) {
  await getById(db, 'products', productId, 'id', 'Product')
  const existing = unwrap(await db.from('product_images').select('id').eq('product_id', productId), 'Loading images')
  const primary = is_primary || existing.length === 0
  const path = objectPath(`products/${productId}`, file.originalname)
  await uploadObject(db, env.PRODUCT_IMAGES_BUCKET, path, file)
  try {
    if (primary) await clearPrimary(db, productId)
    await insertOne(
      db,
      'product_images',
      {
        product_id: productId,
        image_url: publicUrl(db, env.PRODUCT_IMAGES_BUCKET, path),
        storage_path: path,
        alt_text: alt_text ?? null,
        is_primary: primary,
        display_order: existing.length,
      },
      'id',
      'product image'
    )
  } catch (err) {
    await removeObject(db, env.PRODUCT_IMAGES_BUCKET, path).catch(() => {})
    throw err
  }
  await syncCoverImage(db, productId)
  return getProduct(db, productId)
}

export async function updateImage(db, productId, imageId, body) {
  if (body.is_primary) await clearPrimary(db, productId, imageId)
  const rows = unwrap(
    await db.from('product_images').update(compact(body)).eq('id', imageId).eq('product_id', productId).select('id'),
    'Updating image'
  )
  if (!rows.length) throw AppError.notFound('Image not found.')
  await syncCoverImage(db, productId)
  return getProduct(db, productId)
}

export async function deleteImage(db, productId, imageId) {
  const image = unwrap(
    await db.from('product_images').select('id, storage_path').eq('id', imageId).eq('product_id', productId).maybeSingle(),
    'Loading image'
  )
  if (!image) throw AppError.notFound('Image not found.')
  unwrap(await db.from('product_images').delete().eq('id', imageId), 'Deleting image')
  if (image.storage_path) await removeObject(db, env.PRODUCT_IMAGES_BUCKET, image.storage_path).catch(() => {})
  await syncCoverImage(db, productId)
  return getProduct(db, productId)
}

// -----------------------------------------------------------------------------
// Categories & coffee regions (origins)
// -----------------------------------------------------------------------------
function taxonomy(table, label) {
  return createResourceService({
    table,
    label,
    searchColumns: ['name', 'slug'],
    filters: (q) => ({ is_active: q.status ? q.status === 'active' : undefined }),
    beforeCreate: async (db, body) => ({ ...body, slug: body.slug ?? (await uniqueSlug(db, table, body.name)) }),
  })
}

export const categories = taxonomy('categories', 'Category')
export const regions = taxonomy('coffee_regions', 'Coffee region')
