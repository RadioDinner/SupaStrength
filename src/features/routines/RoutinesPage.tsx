/**
 * Routines list (BUILD_PLAN M4). A routine is your training schedule — built from
 * rotations. Exactly one routine can be active at a time.
 */
import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { CalendarDays } from 'lucide-react'
import { Button, Card, EmptyState, SkeletonList, TextInput } from '../../components/ui'
import { useCreateRoutine, useRoutines, useSetActiveRoutine } from './useRoutines'

export function RoutinesPage() {
  const { data: routines, isLoading } = useRoutines()
  const create = useCreateRoutine()
  const setActive = useSetActiveRoutine()
  const [name, setName] = useState('')

  async function onCreate(e: FormEvent) {
    e.preventDefault()
    if (!name.trim()) return
    await create.mutateAsync(name.trim())
    setName('')
  }

  return (
    <div className="page">
      <Card title="Routines" subtitle="Your schedule — rotations of workouts.">
        <form className="inline-form" onSubmit={onCreate}>
          <TextInput
            placeholder="New routine (e.g. StrongLifts 5×5)"
            aria-label="New routine name"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <Button type="submit" disabled={create.isPending}>
            Add
          </Button>
        </form>
      </Card>

      {isLoading ? (
        <SkeletonList rows={2} />
      ) : routines && routines.length === 0 ? (
        <EmptyState
          icon={<CalendarDays size={40} aria-hidden />}
          title="No routines yet"
          hint="A routine is your schedule — rotations of workouts that cycle (A → B → A) plus always-on days. Name one above to start."
        />
      ) : (
        <Card>
          <ul className="list">
            {(routines ?? []).map((r) => (
              <li key={r.id} className="list__row">
                <Link to={`/routines/${r.id}`} className="workout-link">
                  <span className="workout-link__name">
                    {r.name}
                    {r.is_active ? <span className="badge badge--live">active</span> : null}
                  </span>
                  <span className="muted">Tap to build rotations</span>
                </Link>
                {!r.is_active ? (
                  <Button variant="ghost" onClick={() => setActive.mutate(r.id)}>
                    Make active
                  </Button>
                ) : null}
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  )
}
