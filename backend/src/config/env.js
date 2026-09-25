import 'dotenv/config'
import { z } from 'zod'

/**
 * Validated runtime configuration. The process refuses to start with a clear
 * message when something required is missing, instead of failing later on the
 * first request.
 */
const emptyToUndefined = (v) => (typeof v === 'string' && v.trim() === '' ? undefined : v)

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  CORS_ORIGINS: z
    .string()
    .default('http://localhost:3000,http://localhost:5173')
    .transform((s) =>
      s
        .split(',')
        .map((o) => o.trim())
        .filter(Boolean)
    ),
  TRUST_PROXY: z.preprocess(emptyToUndefined, z.coerce.number().int().min(0).default(0)),

  SUPABASE_URL: z
    .string()
    .url('SUPABASE_URL must be a valid URL')
    .transform((u) => u.replace(/\/+$/, '')),
  SUPABASE_PUBLISHABLE_KEY: z.string().min(20, 'SUPABASE_PUBLISHABLE_KEY is required'),
  SUPABASE_SECRET_KEY: z.preprocess(emptyToUndefined, z.string().min(20).optional()),

  // Storage buckets (created by the 20260925000200_security_rls migration)
  DOCUMENTS_BUCKET: z.preprocess(emptyToUndefined, z.string().default('documents')),
  PRODUCT_IMAGES_BUCKET: z.preprocess(emptyToUndefined, z.string().default('product-images')),
  MAX_UPLOAD_MB: z.preprocess(emptyToUndefined, z.coerce.number().positive().max(25).default(20)),

  // Where password-reset emails send people (must be on an allowed origin).
  PASSWORD_RESET_REDIRECT: z.preprocess(emptyToUndefined, z.string().url().optional()),
})

function load() {
  const raw = {
    ...process.env,
    // Accept the legacy names too so an existing .env keeps working.
    SUPABASE_PUBLISHABLE_KEY:
      emptyToUndefined(process.env.SUPABASE_PUBLISHABLE_KEY) ?? process.env.SUPABASE_ANON_KEY,
    SUPABASE_SECRET_KEY:
      emptyToUndefined(process.env.SUPABASE_SECRET_KEY) ?? process.env.SUPABASE_SERVICE_ROLE_KEY,
  }

  const parsed = schema.safeParse(raw)
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`).join('\n')
    throw new Error(`Invalid backend configuration (check backend/.env):\n${issues}`)
  }
  return Object.freeze(parsed.data)
}

export const env = load()
export const isProduction = env.NODE_ENV === 'production'
export const isTest = env.NODE_ENV === 'test'
