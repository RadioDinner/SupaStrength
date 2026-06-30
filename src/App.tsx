/**
 * Root gate (BUILD_PLAN M1). Routes on auth status:
 *   unconfigured → setup instructions · loading → spinner ·
 *   signedOut → AuthScreen · signedIn → BootstrapGate → AppShell.
 */
import { useAuth } from './hooks/useAuth'
import { AuthScreen } from './features/auth/AuthScreen'
import { ResetPasswordScreen } from './features/auth/ResetPasswordScreen'
import { BootstrapGate } from './routes/BootstrapGate'
import { Banner, Brand, Spinner } from './components/ui'

export default function App() {
  const { status, recoveryMode } = useAuth()

  // A recovery link lands as a signed-in session — intercept it to set a new
  // password before entering the app.
  if (recoveryMode) return <ResetPasswordScreen />

  switch (status) {
    case 'unconfigured':
      return <UnconfiguredScreen />
    case 'loading':
      return (
        <main className="shell shell--center">
          <Spinner label="Starting…" />
        </main>
      )
    case 'signedOut':
      return <AuthScreen />
    case 'signedIn':
      return <BootstrapGate />
  }
}

function UnconfiguredScreen() {
  return (
    <main className="shell shell--center">
      <Brand />
      <section className="card">
        <h2 className="card__title">Almost there</h2>
        <Banner kind="warn">
          Supabase isn&apos;t configured. Set <code>VITE_SUPABASE_URL</code> and{' '}
          <code>VITE_SUPABASE_ANON_KEY</code> (in <code>.env.local</code> or Vercel), then rebuild.
        </Banner>
      </section>
    </main>
  )
}
