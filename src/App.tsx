import { useEffect, useState } from 'react'
import { env } from './lib/env'
import { pingRepo } from './data/repos/pingRepo'

type Status =
  | { kind: 'checking' }
  | { kind: 'unconfigured' }
  | { kind: 'ok'; muscleGroups: number }
  | { kind: 'error'; message: string }

export default function App() {
  const [status, setStatus] = useState<Status>(
    env.isConfigured ? { kind: 'checking' } : { kind: 'unconfigured' },
  )

  useEffect(() => {
    if (!env.isConfigured) return
    let active = true
    pingRepo
      .check()
      .then((r) => {
        if (active) setStatus({ kind: 'ok', muscleGroups: r.muscleGroups })
      })
      .catch((e: unknown) => {
        if (active)
          setStatus({ kind: 'error', message: e instanceof Error ? e.message : String(e) })
      })
    return () => {
      active = false
    }
  }, [])

  return (
    <main className="shell">
      <header className="brand">
        <span className="brand__mark" aria-hidden="true">🏋️</span>
        <h1>SupaStrength</h1>
      </header>

      <section className="card">
        <h2 className="card__title">Phase 0 — scaffold live</h2>
        <p className="card__sub">Vite + React + TypeScript · Supabase · deployed on Vercel</p>
        <StatusBadge status={status} />
      </section>

      <p className="footnote">
        Next up: M1 — auth, profile, and equipment setup.
      </p>
    </main>
  )
}

function StatusBadge({ status }: { status: Status }) {
  switch (status.kind) {
    case 'checking':
      return <div className="status status--wait">Checking Supabase connection…</div>
    case 'unconfigured':
      return (
        <div className="status status--warn">
          Supabase not configured. Set <code>VITE_SUPABASE_URL</code> and{' '}
          <code>VITE_SUPABASE_ANON_KEY</code> (locally in <code>.env.local</code> or in Vercel),
          then rebuild.
        </div>
      )
    case 'ok':
      return (
        <div className="status status--ok">
          Connected ✓ — schema live, {status.muscleGroups} muscle groups seeded.
        </div>
      )
    case 'error':
      return (
        <div className="status status--err">
          Connected to Supabase, but the query failed: {status.message}
          <br />
          <small>(Did you run the migration in the SQL Editor?)</small>
        </div>
      )
  }
}
