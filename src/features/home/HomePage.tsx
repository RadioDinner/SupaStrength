/**
 * Dashboard / home. Surfaces the lifter's real state: an in-progress session to
 * resume, days since the last session, the active routine's next day, and any
 * due check-in nudges. Deeper analytics live on the Stats tab.
 */
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { ArrowRight, CalendarPlus, Play } from 'lucide-react'
import { Card, Skeleton } from '../../components/ui'
import { useAuth } from '../../hooks/useAuth'
import { useProfile } from '../settings/useProfile'
import { useRoutines } from '../routines/useRoutines'
import { sessionsRepo } from '../../data/repos/sessionsRepo'
import { DueNudges } from '../progress/ProgressPage'

/** Whole days between a session's `performed_on` (a date) and today. */
function daysAgo(performedOn: string): number {
  const day = new Date(`${performedOn}T00:00:00`)
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  return Math.max(0, Math.round((today.getTime() - day.getTime()) / 86_400_000))
}

export function HomePage() {
  const { user } = useAuth()
  const { data: profile } = useProfile(user!.id)
  const { data: routines } = useRoutines()
  const active = useQuery({ queryKey: ['session', 'active'], queryFn: () => sessionsRepo.getActive() })
  const recent = useQuery({ queryKey: ['sessions', 'recent', 1], queryFn: () => sessionsRepo.recent(1) })

  const name = profile?.display_name?.trim()
  const activeRoutine = routines?.find((r) => r.is_active)
  const last = recent.data?.[0]
  const since = last ? daysAgo(last.performed_on) : null

  return (
    <div className="page">
      <DueNudges />

      <h1 className="home__title">{name ? `Welcome back, ${name}` : 'Welcome'}</h1>

      {active.data ? (
        <Link to={`/session/${active.data.id}`} className="btn btn--primary home__resume">
          <Play size={18} aria-hidden="true" />
          Resume your session
        </Link>
      ) : null}

      <section className="card herostat">
        <p className="herostat__label">{since === null ? 'Training' : 'Last trained'}</p>
        {recent.isLoading ? (
          <Skeleton w={120} h={40} radius={8} />
        ) : since === null ? (
          <p className="herostat__value">
            Ready<span className="herostat__unit">log your first session</span>
          </p>
        ) : since === 0 ? (
          <p className="herostat__value">Today</p>
        ) : (
          <p className="herostat__value">
            {since}
            <span className="herostat__unit">{since === 1 ? 'day ago' : 'days ago'}</span>
          </p>
        )}
      </section>

      <Card
        title={activeRoutine ? activeRoutine.name : 'No active routine'}
        subtitle={activeRoutine ? 'Your active schedule' : 'Pick a routine to get prescribed weights'}
      >
        {activeRoutine ? (
          <Link to={`/routines/${activeRoutine.id}`} className="navrow">
            <span className="workout-link__name">Start the next day</span>
            <ArrowRight size={18} aria-hidden="true" className="navrow__icon" />
          </Link>
        ) : (
          <Link to="/routines" className="navrow">
            <span className="workout-link__name">Set up a routine</span>
            <CalendarPlus size={18} aria-hidden="true" className="navrow__icon" />
          </Link>
        )}
      </Card>

      <Card title="Review">
        <Link to="/history" className="navrow">
          <span>
            <span className="workout-link__name">Workout history</span>
            <span className="muted">Every completed session and the sets you logged</span>
          </span>
          <ArrowRight size={18} aria-hidden="true" className="navrow__icon" />
        </Link>
      </Card>
    </div>
  )
}
