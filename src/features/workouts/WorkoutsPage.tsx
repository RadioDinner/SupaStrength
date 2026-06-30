/**
 * Workouts list (BUILD_PLAN M3): your workout templates ("Workout A", "Shoulder
 * Blowup", …). Create one, then open it to build its exercise list.
 */
import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Button, Card, EmptyState, SkeletonList, TextInput } from '../../components/ui'
import { useArchiveWorkout, useCreateWorkout, useWorkouts } from './useWorkouts'
import { useActiveSession, useStartFromWorkout } from '../session/useSession'

export function WorkoutsPage() {
  const navigate = useNavigate()
  const { data: workouts, isLoading } = useWorkouts()
  const { data: active } = useActiveSession()
  const create = useCreateWorkout()
  const archive = useArchiveWorkout()
  const start = useStartFromWorkout()
  const [name, setName] = useState('')

  async function onStart(workoutId: string) {
    const sessionId = await start.mutateAsync(workoutId)
    navigate(`/session/${sessionId}`)
  }

  async function onCreate(e: FormEvent) {
    e.preventDefault()
    if (!name.trim()) return
    await create.mutateAsync(name.trim())
    setName('')
  }

  return (
    <div className="page">
      {active ? (
        <Card>
          <div className="list__row">
            <span className="workout-link__name">A session is in progress</span>
            <Button onClick={() => navigate(`/session/${active.id}`)}>Resume</Button>
          </div>
        </Card>
      ) : null}

      <Card title="Workouts" subtitle="Reusable templates — the days you train.">
        <form className="inline-form" onSubmit={onCreate}>
          <TextInput
            placeholder="New workout (e.g. Workout A)"
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
      ) : workouts && workouts.length === 0 ? (
        <EmptyState
          icon="📋"
          title="No workouts yet"
          hint="A workout is a training day — like Workout A or a shoulder finisher. Name one above, then add exercises to it."
        />
      ) : (
        (workouts ?? []).map((w) => (
          <Card key={w.id}>
            <div className="list__row">
              <Link to={`/workouts/${w.id}`} className="workout-link">
                <span className="workout-link__name">{w.name}</span>
                <span className="muted">Tap to edit exercises →</span>
              </Link>
              <div className="row-actions">
                <Button onClick={() => void onStart(w.id)} disabled={start.isPending || !!active}>
                  Start
                </Button>
                <Button variant="ghost" onClick={() => archive.mutate(w.id)} aria-label={`Archive ${w.name}`}>
                  Archive
                </Button>
              </div>
            </div>
          </Card>
        ))
      )}
    </div>
  )
}
