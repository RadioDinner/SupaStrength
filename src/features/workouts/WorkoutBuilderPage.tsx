/**
 * Workout builder (BUILD_PLAN M3). Edit a workout's ordered exercise list — each
 * an exercise + its prescription (sets, rep scheme, rest, AMRAP, optional
 * starting weight — the seed until progression state exists). The picker can
 * create a custom exercise inline when the library has no match. Validation
 * blocks invalid rep-scheme combos before save (straight needs a rep target;
 * double needs low ≤ high).
 */
import { useMemo, useState, type FormEvent } from 'react'
import { ChevronDown, ChevronLeft, ChevronUp, Pencil, Plus, X } from 'lucide-react'
import { Link, useParams } from 'react-router-dom'
import {
  Banner,
  Button,
  Card,
  Field,
  Select,
  SkeletonList,
  TextArea,
  TextInput,
} from '../../components/ui'
import { useCreateCustomExercise, useExercises, useMuscleGroups } from '../exercises/useExercises'
import { MOVEMENTS, MOVEMENT_DEFAULTS } from '../exercises/exerciseMeta'
import { useDebounced } from '../../hooks/useDebounced'
import {
  useAddEntry,
  useEntrySets,
  useExercisesByIds,
  useMoveEntry,
  useRemoveEntry,
  useSaveEntrySets,
  useUpdateEntry,
  useWorkout,
  useWorkoutEntries,
} from './useWorkouts'
import type { MovementType, OverloadMode, RepScheme, WorkoutEntry, WorkoutEntrySet } from '../../data/types'

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
  const [openEntry, setOpenEntry] = useState<string | null>(null)

  if (isLoading) return <SkeletonList rows={2} />
  if (!workout) return <Banner kind="err">Workout not found.</Banner>

  return (
    <div className="page">
      <Card title={workout.name} subtitle="Exercises in this workout" actions={<Link className="linkbtn" to="/workouts"><ChevronLeft size={18} aria-hidden="true" />All</Link>}>
        {entries && entries.length > 0 ? (
          <ul className="list">
            {entries.map((e, i) => (
              <li key={e.id} className="list__row list__row--stack">
                <div className="list__rowmain">
                  <span>
                    <span className="workout-link__name">{nameById.get(e.exercise_id) ?? '…'}</span>
                    <br />
                    <span className="mono">
                      {e.overload_mode === 'rep_ladder' ? `${e.sets} sets` : prescriptionMain(e)}
                    </span>
                    {e.overload_mode === 'rep_ladder' ? (
                      <span className="muted"> · rep ladder</span>
                    ) : e.starting_weight != null ? (
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
                      aria-label={`Edit ${nameById.get(e.exercise_id) ?? 'exercise'} sets, overload and notes`}
                      aria-expanded={openEntry === e.id}
                      onClick={() => setOpenEntry((cur) => (cur === e.id ? null : e.id))}
                    >
                      <Pencil size={18} aria-hidden="true" />
                    </button>
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
                </div>
                {openEntry === e.id ? (
                  <EntryEditor workoutId={id} entry={e} onDone={() => setOpenEntry(null)} />
                ) : null}
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

/**
 * Drop-down editor for one entry: the sticky note (shows every workout), the
 * overload mode, and — for the rep ladder — per-set weight × rep targets plus
 * the ladder knobs (rep cap, weight increment, reps after increment). The
 * ladder advances these targets after every completed session, and whatever
 * it (or you) set is what the next session prescribes.
 */
function EntryEditor({
  workoutId,
  entry,
  onDone,
}: {
  workoutId: string
  entry: WorkoutEntry
  onDone: () => void
}) {
  const { data: savedSets } = useEntrySets(entry.id)
  const updateEntry = useUpdateEntry(workoutId)
  const saveSets = useSaveEntrySets(workoutId, entry.id)
  const [note, setNote] = useState(entry.notes ?? '')
  const [mode, setMode] = useState<OverloadMode>(entry.overload_mode)
  const [repCap, setRepCap] = useState(entry.rep_cap != null ? String(entry.rep_cap) : '10')
  const [increment, setIncrement] = useState(
    entry.increment_lb != null ? String(entry.increment_lb) : '5',
  )
  const [repsAfter, setRepsAfter] = useState(
    entry.reps_after_increment != null ? String(entry.reps_after_increment) : '',
  )
  const [rows, setRows] = useState<{ reps: string; weight: string }[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const pending = updateEntry.isPending || saveSets.isPending

  // Draft rows: saved per-set targets once loaded, else scaffold from the
  // entry's uniform prescription. Local edits take over from first keystroke.
  const current =
    rows ??
    (savedSets
      ? savedSets.length > 0
        ? savedSets.map((s: WorkoutEntrySet) => ({
            reps: String(s.target_reps),
            weight: s.target_weight != null ? String(s.target_weight) : '',
          }))
        : Array.from({ length: Math.max(1, entry.sets) }, () => ({
            reps: String(entry.rep_target ?? entry.rep_range_low ?? 8),
            weight: entry.starting_weight != null ? String(entry.starting_weight) : '',
          }))
      : null)

  function setRow(i: number, patch: Partial<{ reps: string; weight: string }>) {
    if (!current) return
    setRows(current.map((r, j) => (j === i ? { ...r, ...patch } : r)))
  }

  async function onSave() {
    setError(null)
    const patch: Partial<WorkoutEntry> = { notes: note.trim() || null, overload_mode: mode }
    try {
      if (mode === 'rep_ladder') {
        if (!current || current.length === 0) return setError('Add at least one set.')
        const parsed = current.map((r) => ({
          targetReps: Number(r.reps),
          targetWeight: r.weight.trim() ? Number(r.weight) : null,
        }))
        if (parsed.some((p) => !Number.isInteger(p.targetReps) || p.targetReps < 1))
          return setError('Every set needs a rep target of at least 1.')
        if (parsed.some((p) => p.targetWeight != null && !(p.targetWeight > 0)))
          return setError('Weights must be positive (or blank for bodyweight).')
        const cap = Number(repCap)
        const inc = Number(increment)
        const after = Number(repsAfter)
        if (!Number.isInteger(cap) || cap < 1) return setError('Rep cap must be at least 1.')
        if (!(inc > 0)) return setError('Weight increment must be positive.')
        if (!Number.isInteger(after) || after < 1)
          return setError('Reps after increment must be at least 1 (e.g. 7).')
        patch.rep_cap = cap
        patch.increment_lb = inc
        patch.reps_after_increment = after
        patch.sets = parsed.length
        await saveSets.mutateAsync(parsed)
      }
      await updateEntry.mutateAsync({ entryId: entry.id, patch })
      onDone()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  return (
    <div className="entryeditor">
      <Field
        label="Sticky note"
        htmlFor={`note_${entry.id}`}
        hint="Shows on this exercise every workout."
      >
        <TextArea
          id={`note_${entry.id}`}
          placeholder="e.g. Remember to shovel!"
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
      </Field>

      <Field label="Overload" htmlFor={`mode_${entry.id}`}>
        <Select
          id={`mode_${entry.id}`}
          value={mode}
          onChange={(e) => setMode(e.target.value as OverloadMode)}
        >
          <option value="engine">Auto (routine engine)</option>
          <option value="rep_ladder">Rep ladder — per-set targets, unique to this workout</option>
        </Select>
      </Field>

      {mode === 'rep_ladder' ? (
        !current ? (
          <SkeletonList rows={1} />
        ) : (
          <>
            <div>
              <p className="field__label">Sets — weight × target reps</p>
              {current.map((r, i) => (
                <div key={i} className="setedit">
                  <span className="setedit__n mono">Set {i + 1}</span>
                  <TextInput
                    type="number"
                    min="0"
                    step="any"
                    placeholder="lb"
                    aria-label={`Set ${i + 1} weight in pounds`}
                    value={r.weight}
                    onChange={(e) => setRow(i, { weight: e.target.value })}
                  />
                  <TextInput
                    type="number"
                    min="1"
                    placeholder="reps"
                    aria-label={`Set ${i + 1} target reps`}
                    value={r.reps}
                    onChange={(e) => setRow(i, { reps: e.target.value })}
                  />
                  <Button
                    variant="ghost"
                    type="button"
                    aria-label={`Remove set ${i + 1}`}
                    disabled={current.length <= 1}
                    onClick={() => setRows(current.filter((_, j) => j !== i))}
                  >
                    <X size={16} aria-hidden="true" />
                  </Button>
                </div>
              ))}
              <Button
                variant="ghost"
                type="button"
                onClick={() =>
                  setRows([...current, { ...(current[current.length - 1] ?? { reps: '8', weight: '' }) }])
                }
              >
                <Plus size={16} aria-hidden="true" /> Add set
              </Button>
            </div>

            <div className="grid2">
              <Field
                label="Rep cap"
                htmlFor={`cap_${entry.id}`}
                hint="Weight steps up once every set hits this."
              >
                <TextInput
                  id={`cap_${entry.id}`}
                  type="number"
                  min="1"
                  value={repCap}
                  onChange={(e) => setRepCap(e.target.value)}
                />
              </Field>
              <Field label="Weight increment (lb)" htmlFor={`inc_${entry.id}`}>
                <TextInput
                  id={`inc_${entry.id}`}
                  type="number"
                  min="0"
                  step="any"
                  value={increment}
                  onChange={(e) => setIncrement(e.target.value)}
                />
              </Field>
            </div>
            <Field
              label="Reps after increment"
              htmlFor={`after_${entry.id}`}
              hint="Every set resets to this when the weight steps up."
            >
              <TextInput
                id={`after_${entry.id}`}
                type="number"
                min="1"
                placeholder="e.g. 7"
                value={repsAfter}
                onChange={(e) => setRepsAfter(e.target.value)}
              />
            </Field>
            <p className="muted">
              Each set that hits its target gains a rep next time; a failed set holds. This
              ladder is unique to this workout — the routine engine leaves it alone.
            </p>
          </>
        )
      ) : (
        <p className="muted">
          Weight and reps are prescribed by the routine engine (or the starting weight for the
          first session). Switch to a rep ladder for per-set targets unique to this workout.
        </p>
      )}

      {error ? <Banner kind="err">{error}</Banner> : null}

      <div className="row-actions">
        <Button type="button" onClick={() => void onSave()} disabled={pending}>
          {pending ? 'Saving…' : 'Save'}
        </Button>
        <Button variant="ghost" type="button" onClick={onDone} disabled={pending}>
          Cancel
        </Button>
      </div>
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
