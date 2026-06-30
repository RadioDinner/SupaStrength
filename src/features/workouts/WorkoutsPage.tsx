/**
 * Workouts list (BUILD_PLAN M3): your workout templates ("Workout A", "Shoulder
 * Blowup", …). Create one, then open it to build its exercise list.
 */
import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { Banner, Button, Card, Spinner, TextInput } from '../../components/ui'
import { useArchiveWorkout, useCreateWorkout, useWorkouts } from './useWorkouts'

export function WorkoutsPage() {
  const { data: workouts, isLoading } = useWorkouts()
  const create = useCreateWorkout()
  const archive = useArchiveWorkout()
  const [name, setName] = useState('')

  async function onCreate(e: FormEvent) {
    e.preventDefault()
    if (!name.trim()) return
    await create.mutateAsync(name.trim())
    setName('')
  }

  return (
    <div className="page">
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
        <Spinner label="Loading workouts…" />
      ) : workouts && workouts.length === 0 ? (
        <Banner kind="info">No workouts yet. Create one above to start building.</Banner>
      ) : (
        (workouts ?? []).map((w) => (
          <Card key={w.id}>
            <div className="list__row">
              <Link to={`/workouts/${w.id}`} className="workout-link">
                <span className="workout-link__name">{w.name}</span>
                <span className="muted">Tap to edit exercises →</span>
              </Link>
              <Button variant="ghost" onClick={() => archive.mutate(w.id)} aria-label={`Archive ${w.name}`}>
                Archive
              </Button>
            </div>
          </Card>
        ))
      )}
    </div>
  )
}
