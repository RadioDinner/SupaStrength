/**
 * Auth context (BUILD_PLAN M1). Wraps the `auth` seam in a React context that the
 * app shell consumes for the auth gate. Handles the "Supabase not configured"
 * case gracefully so the very first deploy still renders.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { auth, type Credentials, type Session, type User } from '../data/auth'
import { env } from '../lib/env'

export type AuthStatus = 'loading' | 'unconfigured' | 'signedOut' | 'signedIn'

interface AuthContextValue {
  status: AuthStatus
  user: User | null
  session: Session | null
  signIn: (c: Credentials) => Promise<void>
  signUp: (c: Credentials) => Promise<{ needsEmailConfirmation: boolean }>
  signInWithMagicLink: (email: string) => Promise<void>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>(env.isConfigured ? 'loading' : 'unconfigured')
  const [session, setSession] = useState<Session | null>(null)

  useEffect(() => {
    if (!env.isConfigured) return
    let active = true

    auth
      .getSession()
      .then((s) => {
        if (!active) return
        setSession(s)
        setStatus(s ? 'signedIn' : 'signedOut')
      })
      .catch(() => {
        if (active) setStatus('signedOut')
      })

    const unsubscribe = auth.onAuthStateChange((_event, s) => {
      setSession(s)
      setStatus(s ? 'signedIn' : 'signedOut')
    })
    return () => {
      active = false
      unsubscribe()
    }
  }, [])

  const signIn = useCallback(async (c: Credentials) => {
    await auth.signIn(c)
  }, [])

  const signUp = useCallback(async (c: Credentials) => {
    const { session: s } = await auth.signUp(c)
    // When email confirmation is ON, signUp returns no session until confirmed.
    return { needsEmailConfirmation: s === null }
  }, [])

  const signInWithMagicLink = useCallback(async (email: string) => {
    await auth.signInWithMagicLink(email)
  }, [])

  const signOut = useCallback(async () => {
    await auth.signOut()
  }, [])

  const value = useMemo<AuthContextValue>(
    () => ({
      status,
      user: session?.user ?? null,
      session,
      signIn,
      signUp,
      signInWithMagicLink,
      signOut,
    }),
    [status, session, signIn, signUp, signInWithMagicLink, signOut],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

// Provider + hook are intentionally co-located (the conventional auth pattern);
// the hook export is safe for fast-refresh here.
// eslint-disable-next-line react-refresh/only-export-components
export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within an <AuthProvider>')
  return ctx
}
