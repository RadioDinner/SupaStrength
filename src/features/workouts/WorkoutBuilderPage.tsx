/**
 * Workout builder (BUILD_PLAN M3). Edit a workout's ordered exercise list — each
 * an exercise + its prescription (sets, rep scheme, rest, AMRAP). No weight: that
 * is born in the session. Validation blocks invalid rep-scheme combos before save
 * (straight needs a rep target; double needs low ≤ high).
 */
import { useMemo, useState, type FormEvent } from 'react'
import { ChevronDown, ChevronLeft, ChevronUp, X } from 'lucide-react'
import { Link, useParams } from 'react-router-dom'
import { Banner, Button, Card, Field, Select, Spinner, TextInput } from '../../components/ui'
import { useExercises } from '../exercises/useExercises'
import { useDebounced } from '../../hooks/useDebounced'
import {
  useAddEntry,
  useExercisesByIds,
  useMoveEntry,
  useRemoveEntry,
  useWorkout,
  useWorkoutEntries,
} from './useWorkouts'
import type { RepScheme, WorkoutEntry } from '../../data/types'

export function WorkoutBuilderPage() {
  const { id = '' } = useParams()
  const { data: workout, isLoading } = useWorkout(id)
  const { data: entries } = useWorkoutEntries(id)
  const exerciseIds = useMemo(() => (entries ?? []).map((e) => e.exercise_id), [entries])
  const { data: exercises } = useExercisesByIds(exerciseIds)
  const nameById = useMemo(
    () => new Map((exercises ?? []).map((e) => [e.id, e.name])),
    [exercises],
  )
  const remove = useRemoveEntry(id)
  const move = useMoveEntry(id)

  if (isLoading) return <Spinner label="Loading workout…" />
  if (!workout) return <Banner kind="err">Workout not found.</Banner>

  return (
    <div className="page">
      <Card title={workout.name} subtitle="Exercises in this workout" actions={<Link className="linkbtn" to="/workouts"><ChevronLeft size={18} aria-hidden="true" />All</Link>}>
        {entries && entries.length > 0 ? (
          <ul className="list">
            {entries.map((e, i) => (
              <li key={e.id} className="list__row">
                <span>
                  <span className="workout-link__name">{nameById.get(e.exercise_id) ?? '…'}</span>
                  <br />
                  <span className="muted">{prescriptionText(e)}</span>
                </span>
                <span className="rowactions">
                  <button
                    type="button"
                    className="reorderbtn"
                    aria-label={`Move ${nameById.get(e.exercise_id) ?? 'exercise'} up`}
                    disabled={i === 0 || move.isPending}
                    onClick={() =>
                      move.mutate({
                        a: { id: e.id, position: e.position },
                        b: { id: entries[i - 1]!.id, position: entries[i - 1]!.position },
                      })
                    }
                  >
                    <ChevronUp size={18} aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    className="reorderbtn"
                    aria-label={`Move ${nameById.get(e.exercise_id) ?? 'exercise'} down`}
                    disabled={i === entries.length - 1 || move.isPending}
                    onClick={() =>
                      move.mutate({
                        a: { id: e.id, position: e.position },
                        b: { id: entries[i + 1]!.id, position: entries[i + 1]!.position },
                      })
                    }
                  >
                    <ChevronDown size={18} aria-hidden="true" />
                  </button>
                  <Button variant="ghost" onClick={() => remove.mutate(e.id)} aria-label="Remove">
                    <X size={18} aria-hidden="true" />
                  </Button>
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <Banner kind="info">No exercises yet — add your first below.</Banner>
        )}
      </Card>

      <AddEntryForm workoutId={id} />
    </div>
  )
}

function prescriptionText(e: WorkoutEntry): string {
  let reps: string
  if (e.rep_scheme === 'double') reps = `${e.rep_range_low ?? '?'}–${e.rep_range_high ?? '?'}`
  else if (e.rep_scheme === 'rpe') reps = `RPE ${e.target_rpe ?? '?'}`
  else reps = `${e.rep_target ?? '?'}`
  const rest = e.rest_seconds ? ` · rest ${e.rest_seconds}s` : ''
  const amrap = e.last_set_amrap ? ' · last set AMRAP' : ''
  return `${e.sets} × ${reps}${rest}${amrap}`
}

function AddEntryForm({ workoutId }: { workoutId: string }) {
  const add = useAddEntry(workoutId)
  const [exerciseId, setExerciseId] = useState<string | null>(null)
  const [exerciseName, setExerciseName] = useState('')
  const [sets, setSets] = useState('3')
  const [scheme, setScheme] = useState<RepScheme>('straight')
  const [repTarget, setRepTarget] = useState('5')
  const [low, setLow] = useState('8')
  const [high, setHigh] = useState('12')
  const [rest, setRest] = useState('180')
  const [amrap, setAmrap] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function reset() {
    setExerciseId(null)
    setExerciseName('')
    setError(null)
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    if (!exerciseId) return setError('Pick an exercise.')
    const setCount = Number(sets)
    if (!setCount || setCount < 1) return setError('Sets must be at least 1.')
    if (scheme === 'straight' && (!repTarget || Number(repTarget) < 1))
      return setError('Straight sets need a rep target.')
    if (scheme === 'double') {
      if (!low || !high) return setError('Double progression needs a low and high rep range.')
      if (Number(high) < Number(low)) return setError('Rep range high must be ≥ low.')
    }
    try {
      await add.mutateAsync({
        exerciseId,
        sets: setCount,
        repScheme: scheme,
        repTarget: scheme === 'straight' ? Number(repTarget) : null,
        repRangeLow: scheme === 'double' ? Number(low) : null,
        repRangeHigh: scheme === 'double' ? Number(high) : null,
        restSeconds: rest ? Number(rest) : null,
        lastSetAmrap: amrap,
      })
      reset()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  return (
    <Card title="Add exercise">
      <form className="form" onSubmit={onSubmit}>
        {exerciseId ? (
          <div className="picked">
            <span className="workout-link__name">{exerciseName}</span>
            <Button variant="ghost" type="button" onClick={reset}>
              Change
            </Button>
          </div>
        ) : (
          <ExercisePicker
            onPick={(pickId, picked) => {
              setExerciseId(pickId)
              setExerciseName(picked)
            }}
          />
        )}

        <div className="grid2">
          <Field label="Sets" htmlFor="sets">
            <TextInput id="sets" type="number" min="1" value={sets} onChange={(e) => setSets(e.target.value)} />
          </Field>
          <Field label="Rep scheme" htmlFor="scheme">
            <Select id="scheme" value={scheme} onChange={(e) => setScheme(e.target.value as RepScheme)}>
              <option value="straight">Straight (sets × reps)</option>
              <option value="double">Double progression (rep range)</option>
            </Select>
          </Field>
        </div>

        {scheme === 'straight' ? (
          <Field label="Reps per set" htmlFor="reps">
            <TextInput id="reps" type="number" min="1" value={repTarget} onChange={(e) => setRepTarget(e.target.value)} />
          </Field>
        ) : (
          <div className="grid2">
            <Field label="Rep range low" htmlFor="low">
              <TextInput id="low" type="number" min="1" value={low} onChange={(e) => setLow(e.target.value)} />
            </Field>
            <Field label="Rep range high" htmlFor="high">
              <TextInput id="high" type="number" min="1" value={high} onChange={(e) => setHigh(e.target.value)} />
            </Field>
          </div>
        )}

        <div className="grid2">
          <Field label="Rest (seconds)" htmlFor="rest">
            <TextInput id="rest" type="number" min="0" value={rest} onChange={(e) => setRest(e.target.value)} />
          </Field>
          <label className="toggle toggle--field">
            <input type="checkbox" checked={amrap} onChange={(e) => setAmrap(e.target.checked)} />
            <span>Last set AMRAP</span>
          </label>
        </div>

        {error ? <Banner kind="err">{error}</Banner> : null}

        <Button type="submit" disabled={add.isPending}>
          {add.isPending ? 'Adding…' : 'Add to workout'}
        </Button>
      </form>
    </Card>
  )
}

function ExercisePicker({ onPick }: { onPick: (id: string, name: string) => void }) {
  const [search, setSearch] = useState('')
  const debounced = useDebounced(search, 250)
  const { data: results } = useExercises({ search: debounced, limit: 8 })

  return (
    <Field label="Exercise" htmlFor="ex_search">
      <TextInput
        id="ex_search"
        placeholder="Search exercises…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />
      {debounced.trim() ? (
        <ul className="picker">
          {(results ?? []).map((ex) => (
            <li key={ex.id}>
              <button type="button" className="picker__item" onClick={() => onPick(ex.id, ex.name)}>
                {ex.name}
              </button>
            </li>
          ))}
          {results && results.length === 0 ? <li className="muted">No matches.</li> : null}
        </ul>
      ) : null}
    </Field>
  )
}
