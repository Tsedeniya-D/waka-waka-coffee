/**
 * TanStack Query hooks.
 *
 * - Public website submissions and the published catalog go through the
 *   Express API (`/public/*`), which validates, rate-limits and generates the
 *   reference numbers server-side.
 * - Public read-only content tables (services, FAQs, ...) are read directly
 *   with the anon key; RLS only exposes active rows.
 * - Internal management hooks live in ./admin and are re-exported here.
 */
import { useMutation, useQuery } from '@tanstack/react-query'
import { supabase, isSupabaseConfigured } from '../lib/supabase'
import { publicApi } from '../api'
import type {
  BlogCategory,
  BlogPost,
  Category,
  Certificate,
  CoffeeRegion,
  ExportCountry,
  FAQ,
  GalleryItem,
  Service,
  Testimonial,
} from '../types'

export * from './admin'

// -----------------------------------------------------------------------------
// Published catalog (API)
// -----------------------------------------------------------------------------
export const useProducts = (options?: { featured?: boolean }) =>
  useQuery({
    queryKey: ['public-products', options?.featured ?? false],
    queryFn: () => publicApi.products(options?.featured),
    staleTime: 5 * 60_000,
  })

export const useProductBySlug = (slug: string) =>
  useQuery({
    queryKey: ['public-product', slug],
    queryFn: () => publicApi.product(slug),
    enabled: Boolean(slug),
    retry: false,
  })

// -----------------------------------------------------------------------------
// Public content tables (anon read, active rows only)
// -----------------------------------------------------------------------------
function useContentQuery<T>(key: string, table: string, build?: (q: any) => any) {
  return useQuery({
    queryKey: ['content', key],
    enabled: isSupabaseConfigured,
    staleTime: 10 * 60_000,
    queryFn: async () => {
      let q = supabase.from(table).select('*')
      if (build) q = build(q)
      const { data, error } = await q.order('created_at', { ascending: true })
      if (error) throw error
      return (data ?? []) as T[]
    },
  })
}

export const useCategories = () => useContentQuery<Category>('categories', 'categories')
export const useCoffeeRegions = () => useContentQuery<CoffeeRegion>('coffee_regions', 'coffee_regions')
export const useServices = () => useContentQuery<Service>('services', 'services')
export const useGallery = (category?: string) =>
  useContentQuery<GalleryItem>(`gallery:${category ?? 'all'}`, 'gallery', (q) => (category ? q.eq('category', category) : q))
export const useCertificates = () => useContentQuery<Certificate>('certificates', 'certificates')
export const useBlogPosts = () => useContentQuery<BlogPost>('blog_posts', 'blog_posts')
export const useBlogCategories = () => useContentQuery<BlogCategory>('blog_categories', 'blog_categories')
export const useTestimonials = () => useContentQuery<Testimonial>('testimonials', 'testimonials')
export const useFAQs = () => useContentQuery<FAQ>('faqs', 'faqs')
export const useExportCountries = () => useContentQuery<ExportCountry>('export_countries', 'export_countries')

export const useBlogPostBySlug = (slug: string) =>
  useQuery({
    queryKey: ['content', 'blog_post', slug],
    enabled: isSupabaseConfigured && Boolean(slug),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('blog_posts')
        .select('*, category:blog_categories(*)')
        .eq('slug', slug)
        .maybeSingle()
      if (error) throw error
      return data as BlogPost | null
    },
  })

// -----------------------------------------------------------------------------
// Public website forms (API; reference numbers are generated server-side)
// -----------------------------------------------------------------------------
export const useCreateContactMessage = () =>
  useMutation({ mutationFn: (input: Record<string, unknown>) => publicApi.submitContact(input) })

export const useCreateNewsletterSubscription = () =>
  useMutation({ mutationFn: (input: { email: string; source?: string }) => publicApi.subscribe(input.email, input.source) })

export const useCreateQuoteRequest = () =>
  useMutation({ mutationFn: (input: Record<string, unknown>) => publicApi.submitQuote(input) })

export const useCreateSampleRequest = () =>
  useMutation({ mutationFn: (input: Record<string, unknown>) => publicApi.submitSample(input) })
