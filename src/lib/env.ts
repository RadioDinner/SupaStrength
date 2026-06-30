import { z } from 'zod'

/**
 * Typed, validated access to the public (VITE_*) environment.
 *
 * Vite inlines `import.meta.env.VITE_*` at BUILD time, so these must be present
 * when the app is built (locally or on Vercel). We validate softly: if they're
 * missing the app still renders a "not configured" shell instead of crashing,
 * which keeps the very first deploy (before env is set) friendly.
 */
const schema = z.object({
  VITE_SUPABASE_URL: z.string().url().optional(),
  VITE_SUPABASE_ANON_KEY: z.string().min(1).optional(),
})

const parsed = schema.safeParse(import.meta.env)
const data = parsed.success ? parsed.data : {}

const url = data.VITE_SUPABASE_URL ?? ''
const anonKey = data.VITE_SUPABASE_ANON_KEY ?? ''

export const env = {
  supabaseUrl: url,
  supabaseAnonKey: anonKey,
  isConfigured: Boolean(url && anonKey),
} as const
