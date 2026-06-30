import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { env } from './env'

/**
 * The ONE Supabase client.
 *
 * Import boundary (BUILD_PLAN 0.6): only the data layer (`src/data/**`) may
 * import this module. UI/features must go through the repo layer so we can swap
 * in a local-first store in Phase 2 without touching feature code.
 */
let client: SupabaseClient | null = null

export function getSupabase(): SupabaseClient {
  if (!env.isConfigured) {
    throw new Error(
      'Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.',
    )
  }
  if (!client) {
    client = createClient(env.supabaseUrl, env.supabaseAnonKey)
  }
  return client
}
