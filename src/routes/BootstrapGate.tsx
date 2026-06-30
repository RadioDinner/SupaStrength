/**
 * Runs the idempotent first-login bootstrap (profile + prefs + home gym) before
 * the app shell renders, so the rest of the app can assume the singletons exist.
 */
import { useQuery } from '@tanstack/react-query'
import { ensureUserSetup } from '../data/repos/bootstrap'
import { useAuth } from '../hooks/useAuth'
import { Banner, Spinner } from '../components/ui'
import { AppShell } from './AppShell'

export function BootstrapGate() {
  const { user } = useAuth()
  const userId = user!.id
  const setup = useQuery({
    queryKey: ['bootstrap', userId],
    queryFn: () => ensureUserSetup(userId),
    staleTime: Infinity,
    retry: 1,
  })

  if (setup.isLoading) {
    return (
      <main className="shell shell--center">
        <Spinner label="Setting up your gym…" />
      </main>
    )
  }

  if (setup.isError) {
    return (
      <main className="shell shell--center">
        <Banner kind="err">
          Couldn&apos;t finish setup: {(setup.error as Error).message}
          <br />
          <small>Make sure the migration has been run in Supabase, then reload.</small>
        </Banner>
      </main>
    )
  }

  return <AppShell />
}
