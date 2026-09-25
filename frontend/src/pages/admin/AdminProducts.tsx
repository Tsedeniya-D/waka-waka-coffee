import { useState, type ChangeEvent, type FormEvent } from 'react'

import { useAuth } from '../../contexts/AuthContext'
import { useDebounce } from '../../hooks'
import {
  useCategoriesAdmin,
  useProductActions,
  useProductAdmin,
  useProductsAdmin,
  useRegionsAdmin,
  useTaxonomyActions,
} from '../../queries/admin'
import { EmptyState, ErrorState, LoadingState, StatusBadge, useConfirm, useFlash } from '../../components/admin/ui'
import DocumentsPanel from '../../components/admin/DocumentsPanel'
import type { Category, CoffeeRegion, Product, ProductAvailability, ProductImage } from '../../types'

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------
type Flash = ReturnType<typeof useFlash>
type Confirm = ReturnType<typeof useConfirm>['confirm']

const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
const IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp']
const MAX_IMAGE_BYTES = 5 * 1024 * 1024

const AVAILABILITY_OPTIONS: { value: ProductAvailability; label: string }[] = [
  { value: 'available', label: 'Available' },
  { value: 'limited', label: 'Limited' },
  { value: 'sold_out', label: 'Sold out' },
  { value: 'available_on_request', label: 'Available on request' },
]

const inputClass = 'p-3 border rounded w-full'
const labelClass = 'block text-sm font-medium mb-1'
const btnPrimary = 'px-4 py-2 bg-primary-600 text-white rounded disabled:opacity-50'
const btnSecondary = 'px-4 py-2 bg-coffee-100 rounded disabled:opacity-50'
const btnSmall = 'px-3 py-1.5 text-xs border rounded hover:bg-coffee-50 disabled:opacity-50'

function fail(message: string): never {
  throw new Error(message)
}

function textOrNull(value: string): string | null {
  const v = value.trim()
  return v ? v : null
}

function listOrNull(value: string, label: string): string[] | null {
  const items = value
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
  if (items.length > 30) fail(`${label}: at most 30 entries.`)
  if (items.some((s) => s.length > 80)) fail(`${label}: each entry must be at most 80 characters.`)
  return items.length ? items : null
}

function numberOrNull(value: string, label: string, opts: { min?: number; max?: number } = {}): number | null {
  const v = value.trim()
  if (!v) return null
  const n = Number(v)
  if (!Number.isFinite(n)) fail(`${label} must be a number.`)
  if (opts.min !== undefined && n < opts.min) fail(`${label} must be at least ${opts.min}.`)
  if (opts.max !== undefined && n > opts.max) fail(`${label} must be at most ${opts.max}.`)
  return n
}

function checkSlug(value: string): string | undefined {
  const v = value.trim().toLowerCase()
  if (!v) return undefined
  if (v.length < 2 || v.length > 120 || !SLUG_RE.test(v)) {
    fail('Slug may contain lowercase letters, numbers and single hyphens (2–120 characters).')
  }
  return v
}

function productStatus(p: Product): 'archived' | 'published' | 'draft' {
  if (p.is_archived) return 'archived'
  return p.is_active ? 'published' : 'draft'
}

function primaryImage(p: Product): string | null {
  const imgs = p.images ?? []
  return imgs.find((i) => i.is_primary)?.image_url ?? imgs[0]?.image_url ?? p.image_url ?? null
}

// -----------------------------------------------------------------------------
// Page
// -----------------------------------------------------------------------------
const AdminProducts = () => {
  const { can } = useAuth()
  const canCreate = can('products', 'create')
  const canUpdate = can('products', 'update')
  const canDelete = can('products', 'delete')

  const flash = useFlash()
  const { confirm, dialog } = useConfirm()
  const actions = useProductActions()

  const [search, setSearch] = useState('')
  const [status, setStatus] = useState<'all' | 'published' | 'draft' | 'archived'>('all')
  const debouncedSearch = useDebounce(search, { delay: 350 })

  const productsQuery = useProductsAdmin({
    search: debouncedSearch.trim() || undefined,
    status,
    sort: 'sort_order',
    limit: 200,
  })
  const products = productsQuery.data?.data ?? []

  const categoriesQuery = useCategoriesAdmin({ sort: 'name', limit: 500 })
  const regionsQuery = useRegionsAdmin({ sort: 'name', limit: 500 })
  const categories = categoriesQuery.data?.data ?? []
  const regions = regionsQuery.data?.data ?? []

  // null = closed, 'new' = create form, otherwise product id being edited
  const [editing, setEditing] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)

  const run = async (id: string, fn: () => Promise<unknown>, message: string) => {
    setBusyId(id)
    try {
      await fn()
      flash.success(message)
    } catch (err) {
      flash.error(err)
    } finally {
      setBusyId(null)
    }
  }

  const togglePublish = (p: Product) =>
    run(
      p.id,
      () => actions.publish.mutateAsync({ id: p.id, is_active: !p.is_active }),
      p.is_active ? `"${p.name}" is now a draft and hidden from the website.` : `"${p.name}" is published on the website.`
    )

  const toggleFeatured = (p: Product) =>
    run(
      p.id,
      () => actions.feature.mutateAsync({ id: p.id, is_featured: !p.is_featured }),
      p.is_featured ? `"${p.name}" is no longer featured.` : `"${p.name}" is featured.`
    )

  const toggleArchive = async (p: Product) => {
    if (!p.is_archived) {
      const ok = await confirm({
        title: 'Archive product',
        message: `Archive "${p.name}"? Archiving also unpublishes it and removes it from the featured list. You can restore it later.`,
        confirmLabel: 'Archive',
        danger: true,
      })
      if (!ok) return
    }
    await run(
      p.id,
      () => actions.archive.mutateAsync({ id: p.id, is_archived: !p.is_archived }),
      p.is_archived ? `"${p.name}" was restored as a draft.` : `"${p.name}" was archived.`
    )
  }

  const removeProduct = async (p: Product) => {
    const ok = await confirm({
      title: 'Delete product',
      message: `Permanently delete "${p.name}" and its images? This cannot be undone. Consider archiving instead.`,
      confirmLabel: 'Delete',
      danger: true,
    })
    if (!ok) return
    await run(
      p.id,
      async () => {
        await actions.remove.mutateAsync(p.id)
        if (editing === p.id) setEditing(null)
      },
      `"${p.name}" was deleted.`
    )
  }

  return (
    <div className="p-6 space-y-6">
      {dialog}

      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Products</h2>
          <p className="text-sm text-coffee-600">
            Only published products are served to the website through the public products API.
          </p>
        </div>
        {canCreate && (
          <button
            onClick={() => setEditing((s) => (s === 'new' ? null : 'new'))}
            className="px-4 py-2 bg-primary-600 text-white rounded-lg"
          >
            {editing === 'new' ? 'Close' : 'Add Product'}
          </button>
        )}
      </div>

      {flash.banner}

      {editing && (
        <ProductEditor
          key={editing}
          productId={editing === 'new' ? null : editing}
          categories={categories}
          regions={regions}
          canUpdate={canUpdate}
          flash={flash}
          confirm={confirm}
          onCreated={(id) => setEditing(id)}
          onClose={() => setEditing(null)}
        />
      )}

      {/* Filters */}
      <div className="bg-white p-4 rounded-xl shadow grid gap-3 md:grid-cols-3">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search name, slug, origin, grade…"
          className="p-3 border rounded md:col-span-2"
        />
        <select value={status} onChange={(e) => setStatus(e.target.value as typeof status)} className="p-3 border rounded">
          <option value="all">All (not archived)</option>
          <option value="published">Published</option>
          <option value="draft">Draft</option>
          <option value="archived">Archived</option>
        </select>
      </div>

      {/* Product list */}
      {productsQuery.isLoading ? (
        <div className="bg-white rounded-xl shadow">
          <LoadingState label="Loading products…" />
        </div>
      ) : productsQuery.isError ? (
        <div className="bg-white rounded-xl shadow">
          <ErrorState error={productsQuery.error} onRetry={() => productsQuery.refetch()} />
        </div>
      ) : products.length === 0 ? (
        <div className="p-6 bg-white rounded-xl shadow">
          {search || status !== 'all' ? 'No products match these filters.' : 'No products yet. Add one to get started.'}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {products.map((p) => {
            const img = primaryImage(p)
            const busy = busyId === p.id
            return (
              <div key={p.id} className="p-4 bg-white rounded-xl shadow flex gap-4">
                <div className="h-24 w-24 shrink-0 overflow-hidden rounded bg-coffee-50">
                  {img ? (
                    <img src={img} alt={p.name} className="h-full w-full object-cover" />
                  ) : (
                    <div className="flex h-full items-center justify-center text-xs text-coffee-600">No image</div>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-semibold">{p.name}</h3>
                    <StatusBadge status={productStatus(p)} />
                    {p.is_featured && <StatusBadge status="featured" label="Featured" />}
                  </div>
                  <p className="text-xs text-coffee-600">
                    /{p.slug}
                    {p.category?.name ? ` · ${p.category.name}` : ''}
                    {p.region?.name ? ` · ${p.region.name}` : ''}
                    {p.grade ? ` · ${p.grade}` : ''}
                  </p>
                  <p className="mt-1 text-sm text-coffee-600 line-clamp-2">{p.short_description || p.description}</p>

                  {(canUpdate || canDelete) && (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {canUpdate && (
                        <>
                          <button type="button" onClick={() => setEditing(p.id)} className={btnSmall}>
                            Edit
                          </button>
                          {!p.is_archived && (
                            <button type="button" disabled={busy} onClick={() => togglePublish(p)} className={btnSmall}>
                              {p.is_active ? 'Unpublish' : 'Publish'}
                            </button>
                          )}
                          {!p.is_archived && (
                            <button type="button" disabled={busy} onClick={() => toggleFeatured(p)} className={btnSmall}>
                              {p.is_featured ? 'Unfeature' : 'Feature'}
                            </button>
                          )}
                          <button type="button" disabled={busy} onClick={() => toggleArchive(p)} className={btnSmall}>
                            {p.is_archived ? 'Restore' : 'Archive'}
                          </button>
                        </>
                      )}
                      {canDelete && (
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => removeProduct(p)}
                          className="px-3 py-1.5 text-xs border border-red-200 text-red-600 rounded hover:bg-red-50 disabled:opacity-50"
                        >
                          Delete
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
      {productsQuery.data && productsQuery.data.meta.total > products.length && (
        <p className="text-xs text-coffee-600">
          Showing {products.length} of {productsQuery.data.meta.total} products. Narrow the search to find others.
        </p>
      )}

      {/* Taxonomies */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <TaxonomySection kind="category" query={categoriesQuery} canCreate={canCreate} canUpdate={canUpdate} canDelete={canDelete} flash={flash} confirm={confirm} />
        <TaxonomySection kind="region" query={regionsQuery} canCreate={canCreate} canUpdate={canUpdate} canDelete={canDelete} flash={flash} confirm={confirm} />
      </div>
    </div>
  )
}

export default AdminProducts

// -----------------------------------------------------------------------------
// Product create / edit
// -----------------------------------------------------------------------------
type ProductForm = {
  name: string
  slug: string
  short_description: string
  description: string
  category_id: string
  region_id: string
  origin: string
  grade: string
  variety: string
  processing: string
  altitude: string
  flavor_notes: string
  certifications: string
  harvest_season: string
  screen_size: string
  moisture: string
  cup_score: string
  packaging: string
  availability: ProductAvailability
  min_order_kg: string
  sort_order: string
}

function toForm(p?: Product | null): ProductForm {
  const s = (v: string | number | null | undefined) => (v === null || v === undefined ? '' : String(v))
  return {
    name: s(p?.name),
    slug: s(p?.slug),
    short_description: s(p?.short_description),
    description: s(p?.description),
    category_id: s(p?.category_id),
    region_id: s(p?.region_id),
    origin: s(p?.origin),
    grade: s(p?.grade),
    variety: s(p?.variety),
    processing: s(p?.processing),
    altitude: s(p?.altitude),
    flavor_notes: (p?.flavor_notes ?? []).join(', '),
    certifications: (p?.certifications ?? []).join(', '),
    harvest_season: s(p?.harvest_season),
    screen_size: s(p?.screen_size),
    moisture: s(p?.moisture),
    cup_score: s(p?.cup_score),
    packaging: s(p?.packaging),
    availability: p?.availability ?? 'available',
    min_order_kg: s(p?.min_order_kg),
    sort_order: s(p?.sort_order ?? 0),
  }
}

function buildPayload(f: ProductForm): Record<string, unknown> {
  const name = f.name.trim()
  if (!name) fail('Name is required.')
  if (name.length > 160) fail('Name must be at most 160 characters.')
  if (f.short_description.trim().length > 500) fail('Short description must be at most 500 characters.')
  const sort = f.sort_order.trim() === '' ? 0 : Number(f.sort_order)
  if (!Number.isInteger(sort) || sort < 0 || sort > 10000) fail('Sort order must be a whole number between 0 and 10000.')

  const body: Record<string, unknown> = {
    name,
    short_description: textOrNull(f.short_description),
    description: textOrNull(f.description),
    category_id: f.category_id || null,
    region_id: f.region_id || null,
    origin: textOrNull(f.origin),
    grade: textOrNull(f.grade),
    variety: textOrNull(f.variety),
    processing: textOrNull(f.processing),
    altitude: textOrNull(f.altitude),
    flavor_notes: listOrNull(f.flavor_notes, 'Flavor notes'),
    certifications: listOrNull(f.certifications, 'Certifications'),
    harvest_season: textOrNull(f.harvest_season),
    screen_size: textOrNull(f.screen_size),
    moisture: numberOrNull(f.moisture, 'Moisture', { min: 0, max: 100 }),
    cup_score: numberOrNull(f.cup_score, 'Cup score', { min: 0, max: 100 }),
    packaging: textOrNull(f.packaging),
    availability: f.availability,
    min_order_kg: numberOrNull(f.min_order_kg, 'Minimum order', { min: 0 }),
    sort_order: sort,
  }
  const slug = checkSlug(f.slug)
  if (slug) body.slug = slug
  return body
}

function ProductEditor({
  productId,
  categories,
  regions,
  canUpdate,
  flash,
  confirm,
  onCreated,
  onClose,
}: {
  productId: string | null
  categories: Category[]
  regions: CoffeeRegion[]
  canUpdate: boolean
  flash: Flash
  confirm: Confirm
  onCreated: (id: string) => void
  onClose: () => void
}) {
  const detail = useProductAdmin(productId)

  if (productId && detail.isLoading) {
    return (
      <div className="bg-white rounded-xl shadow">
        <LoadingState label="Loading product…" />
      </div>
    )
  }
  if (productId && detail.isError) {
    return (
      <div className="bg-white rounded-xl shadow">
        <ErrorState error={detail.error} onRetry={() => detail.refetch()} />
      </div>
    )
  }

  const product = productId ? detail.data ?? null : null

  return (
    <div className="space-y-6">
      <ProductFormCard
        key={product?.id ?? 'new'}
        product={product}
        categories={categories}
        regions={regions}
        flash={flash}
        onCreated={onCreated}
        onClose={onClose}
      />
      {product && (
        <>
          <ImagesCard product={product} canUpdate={canUpdate} flash={flash} confirm={confirm} />
          <div className="bg-white p-6 rounded-xl shadow">
            <p className="text-sm text-coffee-600 mb-3">
              Specification sheets for this product. Documents marked public can be downloaded from the website.
            </p>
            <DocumentsPanel
              relatedType="product"
              relatedId={product.id}
              defaultType="product_specification"
              title="Product specification documents"
            />
          </div>
        </>
      )}
    </div>
  )
}

function ProductFormCard({
  product,
  categories,
  regions,
  flash,
  onCreated,
  onClose,
}: {
  product: Product | null
  categories: Category[]
  regions: CoffeeRegion[]
  flash: Flash
  onCreated: (id: string) => void
  onClose: () => void
}) {
  const actions = useProductActions()
  const [form, setForm] = useState<ProductForm>(() => toForm(product))
  const set = (k: keyof ProductForm) => (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }))
  const submitting = actions.create.isPending || actions.update.isPending

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    let body: Record<string, unknown>
    try {
      body = buildPayload(form)
    } catch (err) {
      return flash.error(err)
    }
    try {
      if (product) {
        await actions.update.mutateAsync({ id: product.id, body })
        flash.success(`"${body.name as string}" was saved.`)
      } else {
        const created = await actions.create.mutateAsync(body)
        flash.success(`"${created.name}" was created as a draft (/${created.slug}). Add images and documents below, then publish it.`)
        onCreated(created.id)
      }
    } catch (err) {
      flash.error(err, 'Failed to save product.')
    }
  }

  const text = (k: keyof ProductForm, label: string, placeholder = '') => (
    <div>
      <label className={labelClass}>{label}</label>
      <input value={form[k]} onChange={set(k)} placeholder={placeholder} className={inputClass} />
    </div>
  )

  return (
    <form onSubmit={submit} className="bg-white p-6 rounded-xl shadow">
      <h3 className="font-semibold mb-4">{product ? `Edit ${product.name}` : 'New product'}</h3>
      {product && (
        <p className="text-sm text-coffee-600 mb-4">
          Status: {product.is_archived ? 'Archived' : product.is_active ? 'Published' : 'Draft'}
          {product.is_featured ? ' · Featured' : ''}. Use the buttons in the product list to publish, feature or archive.
        </p>
      )}
      <div className="grid gap-4 md:grid-cols-2">
        {text('name', 'Name *', 'Product name')}
        {text('slug', 'Slug', 'Generated from the name if empty')}
        <div className="md:col-span-2">
          <label className={labelClass}>Short description</label>
          <input value={form.short_description} onChange={set('short_description')} maxLength={500} className={inputClass} />
        </div>
        <div className="md:col-span-2">
          <label className={labelClass}>Description</label>
          <textarea value={form.description} onChange={set('description')} rows={4} className={inputClass} />
        </div>
        <div>
          <label className={labelClass}>Category</label>
          <select value={form.category_id} onChange={set('category_id')} className={inputClass}>
            <option value="">No category</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
                {c.is_active ? '' : ' (inactive)'}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={labelClass}>Coffee region</label>
          <select value={form.region_id} onChange={set('region_id')} className={inputClass}>
            <option value="">No region</option>
            {regions.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
                {r.is_active ? '' : ' (inactive)'}
              </option>
            ))}
          </select>
        </div>
        {text('origin', 'Origin', 'e.g. Yirgacheffe, Ethiopia')}
        {text('grade', 'Grade', 'e.g. G1')}
        {text('variety', 'Variety', 'e.g. Heirloom')}
        {text('processing', 'Processing', 'e.g. Washed')}
        {text('altitude', 'Altitude', 'e.g. 1,900–2,200 m')}
        {text('harvest_season', 'Harvest season', 'e.g. Oct–Jan')}
        {text('flavor_notes', 'Flavor notes', 'Comma separated: jasmine, bergamot, lemon')}
        {text('certifications', 'Certifications', 'Comma separated: Organic, Fair Trade')}
        {text('screen_size', 'Screen size', 'e.g. 14+')}
        {text('packaging', 'Packaging', 'e.g. 60 kg jute bags with GrainPro')}
        <div>
          <label className={labelClass}>Moisture (%)</label>
          <input type="number" step="0.1" min={0} max={100} value={form.moisture} onChange={set('moisture')} className={inputClass} />
        </div>
        <div>
          <label className={labelClass}>Cup score</label>
          <input type="number" step="0.25" min={0} max={100} value={form.cup_score} onChange={set('cup_score')} className={inputClass} />
        </div>
        <div>
          <label className={labelClass}>Availability</label>
          <select value={form.availability} onChange={set('availability')} className={inputClass}>
            {AVAILABILITY_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={labelClass}>Minimum order (kg)</label>
          <input type="number" min={0} step="any" value={form.min_order_kg} onChange={set('min_order_kg')} className={inputClass} />
        </div>
        <div>
          <label className={labelClass}>Sort order</label>
          <input type="number" min={0} max={10000} step={1} value={form.sort_order} onChange={set('sort_order')} className={inputClass} />
        </div>
      </div>
      <div className="flex gap-3 mt-6">
        <button type="submit" disabled={submitting} className={btnPrimary}>
          {submitting ? 'Saving…' : product ? 'Save Product' : 'Create Product'}
        </button>
        <button type="button" onClick={onClose} className={btnSecondary}>
          {product ? 'Close' : 'Cancel'}
        </button>
      </div>
    </form>
  )
}

// -----------------------------------------------------------------------------
// Images
// -----------------------------------------------------------------------------
function ImagesCard({ product, canUpdate, flash, confirm }: { product: Product; canUpdate: boolean; flash: Flash; confirm: Confirm }) {
  const actions = useProductActions()
  const [file, setFile] = useState<File | null>(null)
  const [altText, setAltText] = useState('')
  const [makePrimary, setMakePrimary] = useState(false)
  const [inputKey, setInputKey] = useState(0)
  const [busyImage, setBusyImage] = useState<string | null>(null)
  const images = product.images ?? []

  const handleFile = (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0] ?? null
    if (f && !IMAGE_TYPES.includes(f.type)) {
      flash.error(new Error('Images must be PNG, JPG or WebP.'))
      setFile(null)
      setInputKey((k) => k + 1)
      return
    }
    if (f && f.size > MAX_IMAGE_BYTES) {
      flash.error(new Error('Images must be 5 MB or smaller.'))
      setFile(null)
      setInputKey((k) => k + 1)
      return
    }
    setFile(f)
  }

  const upload = async (e: FormEvent) => {
    e.preventDefault()
    if (!file) return flash.error(new Error('Choose an image to upload.'))
    if (altText.trim().length > 200) return flash.error(new Error('Alt text must be at most 200 characters.'))
    try {
      await actions.addImage.mutateAsync({
        id: product.id,
        file,
        alt_text: altText.trim() || undefined,
        is_primary: makePrimary,
      })
      setFile(null)
      setAltText('')
      setMakePrimary(false)
      setInputKey((k) => k + 1)
      flash.success('Image uploaded.')
    } catch (err) {
      flash.error(err, 'Image upload failed.')
    }
  }

  const setPrimary = async (img: ProductImage) => {
    setBusyImage(img.id)
    try {
      await actions.updateImage.mutateAsync({ id: product.id, imageId: img.id, body: { is_primary: true } })
      flash.success('Primary image updated.')
    } catch (err) {
      flash.error(err)
    } finally {
      setBusyImage(null)
    }
  }

  const saveAlt = async (img: ProductImage, value: string) => {
    if (value.trim().length > 200) return flash.error(new Error('Alt text must be at most 200 characters.'))
    setBusyImage(img.id)
    try {
      await actions.updateImage.mutateAsync({ id: product.id, imageId: img.id, body: { alt_text: value.trim() || null } })
      flash.success('Alt text saved.')
    } catch (err) {
      flash.error(err)
    } finally {
      setBusyImage(null)
    }
  }

  const removeImage = async (img: ProductImage) => {
    const ok = await confirm({
      title: 'Delete image',
      message: img.is_primary
        ? 'Delete the primary image? The next image becomes the cover.'
        : 'Delete this image? This cannot be undone.',
      confirmLabel: 'Delete',
      danger: true,
    })
    if (!ok) return
    setBusyImage(img.id)
    try {
      await actions.removeImage.mutateAsync({ id: product.id, imageId: img.id })
      flash.success('Image deleted.')
    } catch (err) {
      flash.error(err)
    } finally {
      setBusyImage(null)
    }
  }

  return (
    <div className="bg-white p-6 rounded-xl shadow">
      <h3 className="font-semibold mb-4">Images</h3>

      {images.length === 0 ? (
        <p className="text-sm text-coffee-600 mb-4">No images yet. The first image you upload becomes the cover image.</p>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          {images.map((img) => (
            <ImageTile
              key={`${img.id}-${img.alt_text ?? ''}`}
              image={img}
              busy={busyImage === img.id}
              canUpdate={canUpdate}
              onPrimary={() => setPrimary(img)}
              onSaveAlt={(v) => saveAlt(img, v)}
              onDelete={() => removeImage(img)}
            />
          ))}
        </div>
      )}

      {canUpdate && (
        <form onSubmit={upload} className="grid gap-3 md:grid-cols-4 md:items-end">
          <div className="md:col-span-2">
            <label className={labelClass}>Upload image (PNG, JPG or WebP, max 5 MB)</label>
            <input key={inputKey} type="file" accept="image/png,image/jpeg,image/webp" onChange={handleFile} />
          </div>
          <div>
            <label className={labelClass}>Alt text</label>
            <input value={altText} onChange={(e) => setAltText(e.target.value)} maxLength={200} className={inputClass} />
          </div>
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={makePrimary} onChange={(e) => setMakePrimary(e.target.checked)} />
              Primary
            </label>
            <button type="submit" disabled={!file || actions.addImage.isPending} className={btnPrimary}>
              {actions.addImage.isPending ? 'Uploading…' : 'Upload'}
            </button>
          </div>
        </form>
      )}
    </div>
  )
}

function ImageTile({
  image,
  busy,
  canUpdate,
  onPrimary,
  onSaveAlt,
  onDelete,
}: {
  image: ProductImage
  busy: boolean
  canUpdate: boolean
  onPrimary: () => void
  onSaveAlt: (value: string) => void
  onDelete: () => void
}) {
  const [alt, setAlt] = useState(image.alt_text ?? '')
  const altChanged = alt.trim() !== (image.alt_text ?? '')
  return (
    <div className="border rounded p-2 space-y-2">
      <div className="relative aspect-square overflow-hidden rounded bg-coffee-50">
        <img src={image.image_url} alt={image.alt_text ?? ''} className="h-full w-full object-cover" />
        {image.is_primary && (
          <span className="absolute left-1 top-1 rounded bg-primary-600 px-2 py-0.5 text-xs text-white">Primary</span>
        )}
      </div>
      {canUpdate ? (
        <>
          <input
            value={alt}
            onChange={(e) => setAlt(e.target.value)}
            placeholder="Alt text"
            maxLength={200}
            className="p-2 border rounded w-full text-xs"
          />
          <div className="flex flex-wrap gap-1">
            {altChanged && (
              <button type="button" disabled={busy} onClick={() => onSaveAlt(alt)} className={btnSmall}>
                Save alt
              </button>
            )}
            {!image.is_primary && (
              <button type="button" disabled={busy} onClick={onPrimary} className={btnSmall}>
                Set primary
              </button>
            )}
            <button
              type="button"
              disabled={busy}
              onClick={onDelete}
              className="px-3 py-1.5 text-xs border border-red-200 text-red-600 rounded hover:bg-red-50 disabled:opacity-50"
            >
              Delete
            </button>
          </div>
        </>
      ) : (
        image.alt_text && <p className="text-xs text-coffee-600">{image.alt_text}</p>
      )}
    </div>
  )
}

// -----------------------------------------------------------------------------
// Categories & coffee regions
// -----------------------------------------------------------------------------
type TaxonomyRow = Category | CoffeeRegion
type TaxonomyForm = { name: string; slug: string; description: string; is_active: boolean; altitude: string; flavor_notes: string }

const emptyTaxonomy: TaxonomyForm = { name: '', slug: '', description: '', is_active: true, altitude: '', flavor_notes: '' }

function TaxonomySection({
  kind,
  query,
  canCreate,
  canUpdate,
  canDelete,
  flash,
  confirm,
}: {
  kind: 'category' | 'region'
  query: ReturnType<typeof useCategoriesAdmin> | ReturnType<typeof useRegionsAdmin>
  canCreate: boolean
  canUpdate: boolean
  canDelete: boolean
  flash: Flash
  confirm: Confirm
}) {
  const actions = useTaxonomyActions()
  const isRegion = kind === 'region'
  const title = isRegion ? 'Coffee regions (origins)' : 'Categories'
  const noun = isRegion ? 'region' : 'category'
  const rows: TaxonomyRow[] = query.data?.data ?? []

  const [editing, setEditing] = useState<TaxonomyRow | 'new' | null>(null)
  const [form, setForm] = useState<TaxonomyForm>(emptyTaxonomy)
  const [busyId, setBusyId] = useState<string | null>(null)

  const saving = isRegion
    ? actions.createRegion.isPending || actions.updateRegion.isPending
    : actions.createCategory.isPending || actions.updateCategory.isPending

  const open = (row: TaxonomyRow | 'new') => {
    setEditing(row)
    if (row === 'new') setForm(emptyTaxonomy)
    else
      setForm({
        name: row.name,
        slug: row.slug,
        description: row.description ?? '',
        is_active: row.is_active,
        altitude: 'altitude' in row ? row.altitude ?? '' : '',
        flavor_notes: 'flavor_notes' in row ? (row.flavor_notes ?? []).join(', ') : '',
      })
  }

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    let body: Record<string, unknown>
    try {
      const name = form.name.trim()
      if (!name) fail('Name is required.')
      if (name.length > 120) fail('Name must be at most 120 characters.')
      body = { name, description: textOrNull(form.description), is_active: form.is_active }
      const slug = checkSlug(form.slug)
      if (slug) body.slug = slug
      if (isRegion) {
        body.altitude = textOrNull(form.altitude)
        body.flavor_notes = listOrNull(form.flavor_notes, 'Flavor notes')
      }
    } catch (err) {
      return flash.error(err)
    }
    try {
      if (editing && editing !== 'new') {
        if (isRegion) await actions.updateRegion.mutateAsync({ id: editing.id, body })
        else await actions.updateCategory.mutateAsync({ id: editing.id, body })
        flash.success(`${isRegion ? 'Region' : 'Category'} "${body.name as string}" saved.`)
      } else {
        if (isRegion) await actions.createRegion.mutateAsync(body)
        else await actions.createCategory.mutateAsync(body)
        flash.success(`${isRegion ? 'Region' : 'Category'} "${body.name as string}" created.`)
      }
      setEditing(null)
    } catch (err) {
      flash.error(err)
    }
  }

  const remove = async (row: TaxonomyRow) => {
    const ok = await confirm({
      title: `Delete ${noun}`,
      message: `Delete the ${noun} "${row.name}"? Products using it may need to be updated. To hide it instead, mark it inactive.`,
      confirmLabel: 'Delete',
      danger: true,
    })
    if (!ok) return
    setBusyId(row.id)
    try {
      if (isRegion) await actions.removeRegion.mutateAsync(row.id)
      else await actions.removeCategory.mutateAsync(row.id)
      if (editing !== 'new' && editing?.id === row.id) setEditing(null)
      flash.success(`${isRegion ? 'Region' : 'Category'} "${row.name}" deleted.`)
    } catch (err) {
      flash.error(err)
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="bg-white p-6 rounded-xl shadow">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold">{title}</h3>
        {canCreate && (
          <button type="button" onClick={() => (editing === 'new' ? setEditing(null) : open('new'))} className={btnSmall}>
            {editing === 'new' ? 'Close' : `Add ${noun}`}
          </button>
        )}
      </div>

      {editing && (
        <form onSubmit={submit} className="grid gap-3 mb-4 border rounded p-4">
          <p className="text-sm font-medium">{editing === 'new' ? `New ${noun}` : `Edit ${editing.name}`}</p>
          <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Name *" className={inputClass} />
          <input value={form.slug} onChange={(e) => setForm({ ...form, slug: e.target.value })} placeholder="Slug (optional)" className={inputClass} />
          <textarea
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            placeholder="Description"
            rows={2}
            className={inputClass}
          />
          {isRegion && (
            <>
              <input value={form.altitude} onChange={(e) => setForm({ ...form, altitude: e.target.value })} placeholder="Altitude (e.g. 1,800–2,200 m)" className={inputClass} />
              <input
                value={form.flavor_notes}
                onChange={(e) => setForm({ ...form, flavor_notes: e.target.value })}
                placeholder="Flavor notes (comma separated)"
                className={inputClass}
              />
            </>
          )}
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={form.is_active} onChange={(e) => setForm({ ...form, is_active: e.target.checked })} />
            Active
          </label>
          <div className="flex gap-3">
            <button type="submit" disabled={saving} className={btnPrimary}>
              {saving ? 'Saving…' : editing === 'new' ? 'Create' : 'Save'}
            </button>
            <button type="button" onClick={() => setEditing(null)} className={btnSecondary}>
              Cancel
            </button>
          </div>
        </form>
      )}

      {query.isLoading ? (
        <LoadingState label={`Loading ${title.toLowerCase()}…`} />
      ) : query.isError ? (
        <ErrorState error={query.error} onRetry={() => query.refetch()} />
      ) : rows.length === 0 ? (
        <EmptyState title={`No ${isRegion ? 'regions' : 'categories'} yet.`} />
      ) : (
        <ul className="divide-y">
          {rows.map((row) => (
            <li key={row.id} className="py-3 flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-medium text-sm">
                  {row.name} <span className="text-xs text-coffee-600">/{row.slug}</span>
                  {!row.is_active && <span className="ml-2 text-xs text-coffee-600">(inactive)</span>}
                </p>
                {row.description && <p className="text-xs text-coffee-600 line-clamp-2">{row.description}</p>}
                {'altitude' in row && (row.altitude || row.flavor_notes?.length) ? (
                  <p className="text-xs text-coffee-600">
                    {[row.altitude, row.flavor_notes?.join(', ')].filter(Boolean).join(' · ')}
                  </p>
                ) : null}
              </div>
              <div className="flex gap-2 shrink-0">
                {canUpdate && (
                  <button type="button" onClick={() => open(row)} className={btnSmall}>
                    Edit
                  </button>
                )}
                {canDelete && (
                  <button
                    type="button"
                    disabled={busyId === row.id}
                    onClick={() => remove(row)}
                    className="px-3 py-1.5 text-xs border border-red-200 text-red-600 rounded hover:bg-red-50 disabled:opacity-50"
                  >
                    Delete
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
