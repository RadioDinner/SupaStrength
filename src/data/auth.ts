/**
 * Auth wrapper around `supabase.auth` (BUILD_PLAN M1). Like the DataClient, this
 * is the seam: UI/hooks call this module, never the raw client, so a different
 * auth backend could slot in later. Errors are surfaced as thrown `Error`s.
 */
import type { Session, User, AuthChangeEvent } from '@supabase/supabase-js'
import { getSupabase } from '../lib/supabase'

export type { Session, User }

export interface Credentials {
  email: string
  password: string
}

/**
 * Where Supabase should send the user back after a magic-link / confirmation
 * email. We use the *current* origin so the link returns to wherever the app was
 * launched (localhost in dev, the Vercel domain in prod) instead of the project's
 * default Site URL. This origin must also be in Supabase Auth → URL Configuration
 * → "Redirect URLs"; otherwise Supabase falls back to the Site URL.
 */
function redirectUrl(): string | undefined {
  return typeof window !== 'undefined' ? window.location.origin : undefined
}

export const auth = {
  async signUp({ email, password }: Credentials): Promise<{ user: User | null; session: Session | null }> {
    const { data, error } = await getSupabase().auth.signUp({
      email,
      password,
      options: { emailRedirectTo: redirectUrl() },
    })
    if (error) throw new Error(error.message)
    return { user: data.user, session: data.session }
  },

  async signIn({ email, password }: Credentials): Promise<{ user: User | null; session: Session | null }> {
    const { data, error } = await getSupabase().auth.signInWithPassword({ email, password })
    if (error) throw new Error(error.message)
    return { user: data.user, session: data.session }
  },

  /** Passwordless magic-link sign-in (SPEC §2: email/password and magic-link). */
  async signInWithMagicLink(email: string): Promise<void> {
    const { error } = await getSupabase().auth.signInWithOtp({
      email,
      options: { emailRedirectTo: redirectUrl() },
    })
    if (error) throw new Error(error.message)
  },

  async signOut(): Promise<void> {
    const { error } = await getSupabase().auth.signOut()
    if (error) throw new Error(error.message)
  },

  async getSession(): Promise<Session | null> {
    const { data, error } = await getSupabase().auth.getSession()
    if (error) throw new Error(error.message)
    return data.session
  },

  /**
   * Subscribe to auth changes. Returns an unsubscribe function.
   */
  onAuthStateChange(cb: (event: AuthChangeEvent, session: Session | null) => void): () => void {
    const { data } = getSupabase().auth.onAuthStateChange((event, session) => cb(event, session))
    return () => data.subscription.unsubscribe()
  },
}
