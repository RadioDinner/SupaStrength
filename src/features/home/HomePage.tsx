/**
 * Dashboard / home (BUILD_PLAN M1). Confirms the schema is live and points at the
 * next milestones. The real dashboard (radar, reminders) lands in M6/M8.
 */
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { Banner, Card, Spinner } from '../../components/ui'
import { useAuth } from '../../hooks/useAuth'
import { useProfile } from '../settings/useProfile'
import { pingRepo } from '../../data/repos/pingRepo'
import { DueNudges } from '../progress/ProgressPage'

export function HomePage() {
  const { user } = useAuth()
  const { data: profile } = useProfile(user!.id)
  const ping = useQuery({ queryKey: ['ping'], queryFn: () => pingRepo.check() })

  const name = profile?.display_name?.trim()

  return (
    <div className="page">
      <DueNudges />

      <Card title={name ? `Welcome back, ${name}` : 'Welcome'} subtitle="Phase 1 — online MVP">
        {ping.isLoading ? (
          <Spinner label="Checking the database…" />
        ) : ping.isError ? (
          <Banner kind="err">
            Connected, but the query failed: {(ping.error as Error).message}
          </Banner>
        ) : (
          <Banner kind="ok">Connected ✓ — schema live, {ping.data?.muscleGroups} muscle groups.</Banner>
        )}
      </Card>

      <Card title="Your setup">
        <ul className="checklist">
          <li className="done">Account &amp; auth</li>
          <li className="done">Home gym seeded (bar, plates, dumbbells)</li>
          <li className="done">Exercise library (873 exercises)</li>
          <li>
            <Link to="/workouts" className="linkbtn">
              Build a workout
            </Link>{' '}
            → schedule → log a session
          </li>
        </ul>
      </Card>

      <Card title="Review">
        <Link to="/history" className="workout-link">
          <span className="workout-link__name">Workout history →</span>
          <span className="muted">Every completed session and the sets you logged</span>
        </Link>
      </Card>
    </div>
  )
}
