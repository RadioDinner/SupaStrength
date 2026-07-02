/**
 * Workout builder (BUILD_PLAN M3). Edit a workout's ordered exercise list — each
 * an exercise + its prescription (sets, rep scheme, rest, AMRAP, optional
 * starting weight — the seed until progression state exists). The picker can
 * create a custom exercise inline when the library has no match. Validation
 * blocks invalid rep-scheme combos before save (straight needs a rep target;
 * double needs low ≤ high).
 */
import { useMemo, useState, type FormEvent } from 'react'
import { ChevronDown, ChevronLeft, ChevronUp, Plus, X } from 'lucide-react'
import { Link, useParams } from 'react-router-dom'
import { Banner, Button, Card, Field, Select, SkeletonList, TextInput } from '../../components/ui'
import { useCreateCustomExercise, useExercises, useMuscleGroups } from '../exercises/useExercises'
import { MOVEMENTS, MOVEMENT_DEFAULTS } from '../exercises/exerciseMeta'
import { useDebounced } from '../../hooks/useDebounced'
import {
  useAddEntry,
  useExercisesByIds,
  useMoveEntry,
  useRemoveEntry,
  useWorkout,
  useWorkoutEntries,
} from './useWorkouts'
import type { MovementType, RepScheme, WorkoutEntry } from '../../data/types'

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

  if (isLoading) return <SkeletonList rows={2} />
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
                  <span className="mono">{prescriptionMain(e)}</span>
                  {e.starting_weight != null ? (
                    <span className="muted"> · starts at <span className="mono">{e.starting_weight}</span> lb</span>
                  ) : null}
                  {e.rest_seconds ? (
                    <span className="muted"> · rest <span className="mono">{e.rest_seconds}</span>s</span>
                  ) : null}
                  {e.last_set_amrap ? <span className="muted"> · last set AMRAP</span> : null}
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

/** Numeric prescription core ("sets × reps") — the hero figures. Rest/AMRAP
 * qualifiers are rendered as muted text alongside this in the row. */
function prescriptionMain(e: WorkoutEntry): string {
  let reps: string
  if (e.rep_scheme === 'double') reps = `${e.rep_range_low ?? '?'}–${e.rep_range_high ?? '?'}`
  else if (e.rep_scheme === 'rpe') reps = `RPE ${e.target_rpe ?? '?'}`
  else reps = `${e.rep_target ?? '?'}`
  return `${e.sets} × ${reps}`
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
  const [startWeight, setStartWeight] = useState('')
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
    const startingWeight = startWeight.trim() ? Number(startWeight) : null
    if (startingWeight != null && (!Number.isFinite(startingWeight) || startingWeight <= 0))
      return setError('Starting weight must be a positive number (or leave it blank).')
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
        startingWeight,
      })
      setStartWeight('')
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
          <Field label="Starting weight (lb, optional)" htmlFor="start_weight">
            <TextInput
              id="start_weight"
              type="number"
              min="0"
              step="any"
              placeholder="e.g. 135"
              value={startWeight}
              onChange={(e) => setStartWeight(e.target.value)}
            />
          </Field>
        </div>

        <label className="toggle toggle--field">
          <input type="checkbox" checked={amrap} onChange={(e) => setAmrap(e.target.checked)} />
          <span>Last set AMRAP</span>
        </label>

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
  const [creating, setCreating] = useState(false)

  if (creating) {
    return (
      <InlineExerciseCreate
        initialName={search.trim()}
        onCreated={(id, name) => {
          setCreating(false)
          setSearch('')
          onPick(id, name)
        }}
        onCancel={() => setCreating(false)}
      />
    )
  }

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
          <li>
            <button type="button" className="picker__item" onClick={() => setCreating(true)}>
              <Plus size={16} aria-hidden="true" /> New exercise{debounced.trim() ? ` “${debounced.trim()}”` : ''}
            </button>
          </li>
        </ul>
      ) : null}
    </Field>
  )
}

/**
 * Compact custom-exercise creator for the picker: name + movement type +
 * primary muscle (the radar needs one), loading style derived from the
 * movement. Lives inside the AddEntryForm <form>, so it renders buttons only —
 * no nested form element; Enter on the name input creates.
 */
function InlineExerciseCreate({
  initialName,
  onCreated,
  onCancel,
}: {
  initialName: string
  onCreated: (id: string, name: string) => void
  onCancel: () => void
}) {
  const create = useCreateCustomExercise()
  const { data: groups } = useMuscleGroups()
  const [name, setName] = useState(initialName)
  const [movement, setMovement] = useState<MovementType>('barbell')
  const [primary, setPrimary] = useState<number | ''>('')
  const [error, setError] = useState<string | null>(null)

  async function onCreate() {
    setError(null)
    if (!name.trim()) return setError('Name is required.')
    if (primary === '') return setError('Pick a primary muscle.')
    const defaults = MOVEMENT_DEFAULTS[movement]
    try {
      const exercise = await create.mutateAsync({
        name,
        movementType: movement,
        loadingStyle: defaults.loadingStyle,
        isLoaded: defaults.isLoaded,
        muscles: [{ muscleGroupId: primary, role: 'primary' }],
      })
      onCreated(exercise.id, exercise.name)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  return (
    <div className="form">
      <Field label="New exercise name" htmlFor="new_ex_name">
        <TextInput
          id="new_ex_name"
          value={name}
          autoFocus
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              void onCreate()
            }
          }}
        />
      </Field>
      <div className="grid2">
        <Field label="Movement type" htmlFor="new_ex_movement">
          <Select
            id="new_ex_movement"
            value={movement}
            onChange={(e) => setMovement(e.target.value as MovementType)}
          >
            {MOVEMENTS.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Primary muscle" htmlFor="new_ex_primary">
          <Select
            id="new_ex_primary"
            value={primary}
            onChange={(e) => setPrimary(e.target.value ? Number(e.target.value) : '')}
          >
            <option value="">Select…</option>
            {(groups ?? []).map((g) => (
              <option key={g.id} value={g.id}>
                {g.display_name}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      {error ? <Banner kind="err">{error}</Banner> : null}
      <div className="row-actions">
        <Button type="button" onClick={() => void onCreate()} disabled={create.isPending}>
          {create.isPending ? 'Creating…' : 'Create & use'}
        </Button>
        <Button variant="ghost" type="button" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  )
}
