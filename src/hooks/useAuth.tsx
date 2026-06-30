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
  /** True after a recovery link lands — the app should prompt for a new password. */
  recoveryMode: boolean
  signIn: (c: Credentials) => Promise<void>
  signUp: (c: Credentials) => Promise<{ needsEmailConfirmation: boolean }>
  signInWithMagicLink: (email: string) => Promise<void>
  sendPasswordRecovery: (email: string) => Promise<void>
  updatePassword: (newPassword: string) => Promise<void>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>(env.isConfigured ? 'loading' : 'unconfigured')
  const [session, setSession] = useState<Session | null>(null)
  const [recoveryMode, setRecoveryMode] = useState(false)

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

    const unsubscribe = auth.onAuthStateChange((event, s) => {
      // A recovery link lands as a PASSWORD_RECOVERY event with a live session —
      // route into the "set a new password" screen instead of straight into the app.
      if (event === 'PASSWORD_RECOVERY') setRecoveryMode(true)
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

  const sendPasswordRecovery = useCallback(async (email: string) => {
    await auth.sendPasswordRecovery(email)
  }, [])

  const updatePassword = useCallback(async (newPassword: string) => {
    await auth.updatePassword(newPassword)
    setRecoveryMode(false)
  }, [])

  const signOut = useCallback(async () => {
    await auth.signOut()
    setRecoveryMode(false)
  }, [])

  const value = useMemo<AuthContextValue>(
    () => ({
      status,
      user: session?.user ?? null,
      session,
      recoveryMode,
      signIn,
      signUp,
      signInWithMagicLink,
      sendPasswordRecovery,
      updatePassword,
      signOut,
    }),
    [
      status,
      session,
      recoveryMode,
      signIn,
      signUp,
      signInWithMagicLink,
      sendPasswordRecovery,
      updatePassword,
      signOut,
    ],
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
