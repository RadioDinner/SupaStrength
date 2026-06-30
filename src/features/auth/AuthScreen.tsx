/**
 * Sign-in / sign-up screen (BUILD_PLAN M1). Supabase email+password with a
 * magic-link fallback (SPEC §2).
 */
import { useState, type FormEvent } from 'react'
import { useAuth } from '../../hooks/useAuth'
import { Banner, Button, Field, TextInput } from '../../components/ui'

type Mode = 'signIn' | 'signUp'

export function AuthScreen() {
  const { signIn, signUp, signInWithMagicLink, sendPasswordRecovery } = useAuth()
  const [mode, setMode] = useState<Mode>('signIn')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setNotice(null)
    setBusy(true)
    try {
      if (mode === 'signIn') {
        await signIn({ email, password })
      } else {
        const { needsEmailConfirmation } = await signUp({ email, password })
        if (needsEmailConfirmation) {
          setNotice('Account created. Check your email to confirm, then sign in.')
          setMode('signIn')
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  async function onMagicLink() {
    setError(null)
    setNotice(null)
    if (!email) {
      setError('Enter your email first.')
      return
    }
    setBusy(true)
    try {
      await signInWithMagicLink(email)
      setNotice('Magic link sent — check your email.')
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  async function onForgotPassword() {
    setError(null)
    setNotice(null)
    if (!email) {
      setError('Enter your email first.')
      return
    }
    setBusy(true)
    try {
      await sendPasswordRecovery(email)
      setNotice('Password-reset link sent — check your email.')
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="shell shell--center">
      <header className="brand">
        <span className="brand__mark" aria-hidden="true">
          🏋️
        </span>
        <h1>SupaStrength</h1>
      </header>

      <section className="card">
        <h2 className="card__title">{mode === 'signIn' ? 'Sign in' : 'Create account'}</h2>
        <p className="card__sub">Personalized strength training, on your phone.</p>

        <form onSubmit={onSubmit} className="form">
          <Field label="Email" htmlFor="email">
            <TextInput
              id="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </Field>
          <Field label="Password" htmlFor="password">
            <TextInput
              id="password"
              type="password"
              autoComplete={mode === 'signIn' ? 'current-password' : 'new-password'}
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </Field>

          {error ? <Banner kind="err">{error}</Banner> : null}
          {notice ? <Banner kind="ok">{notice}</Banner> : null}

          <Button type="submit" disabled={busy}>
            {busy ? 'Working…' : mode === 'signIn' ? 'Sign in' : 'Sign up'}
          </Button>
          <Button type="button" variant="ghost" disabled={busy} onClick={onMagicLink}>
            Email me a magic link
          </Button>
          {mode === 'signIn' ? (
            <button type="button" className="linkbtn linkbtn--center" disabled={busy} onClick={onForgotPassword}>
              Forgot password?
            </button>
          ) : null}
        </form>
      </section>

      <p className="footnote">
        {mode === 'signIn' ? "Don't have an account?" : 'Already have an account?'}{' '}
        <button
          type="button"
          className="linkbtn"
          onClick={() => {
            setMode(mode === 'signIn' ? 'signUp' : 'signIn')
            setError(null)
            setNotice(null)
          }}
        >
          {mode === 'signIn' ? 'Create one' : 'Sign in'}
        </button>
      </p>
    </main>
  )
}
