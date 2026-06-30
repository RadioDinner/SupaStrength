/**
 * "Set a new password" screen (BUILD_PLAN M1). Shown when a Supabase recovery
 * link lands (PASSWORD_RECOVERY event): the user has a live recovery session and
 * just needs to choose a new password.
 */
import { useState, type FormEvent } from 'react'
import { useAuth } from '../../hooks/useAuth'
import { Banner, Button, Field, TextInput } from '../../components/ui'

export function ResetPasswordScreen() {
  const { updatePassword, signOut } = useAuth()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    if (password !== confirm) {
      setError('Passwords do not match.')
      return
    }
    setBusy(true)
    try {
      await updatePassword(password)
      // On success, recoveryMode clears and the app proceeds normally.
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
        <h2 className="card__title">Set a new password</h2>
        <p className="card__sub">You&apos;re signed in from the recovery link — choose a new password.</p>
        <form onSubmit={onSubmit} className="form">
          <Field label="New password" htmlFor="new_password">
            <TextInput
              id="new_password"
              type="password"
              autoComplete="new-password"
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </Field>
          <Field label="Confirm new password" htmlFor="confirm_password">
            <TextInput
              id="confirm_password"
              type="password"
              autoComplete="new-password"
              required
              minLength={6}
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
            />
          </Field>

          {error ? <Banner kind="err">{error}</Banner> : null}

          <Button type="submit" disabled={busy}>
            {busy ? 'Saving…' : 'Save new password'}
          </Button>
          <Button type="button" variant="ghost" disabled={busy} onClick={() => void signOut()}>
            Cancel
          </Button>
        </form>
      </section>
    </main>
  )
}
