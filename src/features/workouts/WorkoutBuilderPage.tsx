/**
 * Workout builder (BUILD_PLAN M3, reworked to the set-table layout). Every
 * exercise shows an always-editable per-set table — SET | PREVIOUS | LB |
 * REPS — with the last completed session's actuals alongside, the sticky note
 * as a banner, rest dividers between sets, and ADD SET inline. Edits save on
 * the fly (blur / add / remove). The gear panel behind the pencil holds the
 * sticky note, rest, AMRAP and the overload mode (engine vs rep ladder).
 */
import { useMemo, useState, type FormEvent } from 'react'
import { ChevronDown, ChevronLeft, ChevronUp, Minus, Pencil, Plus, X } from 'lucide-react'
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
import { useToast } from '../../hooks/useToast'
import { usePreviousActuals } from '../session/useSession'
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
import type {
  MovementType,
  OverloadMode,
  RepScheme,
  WorkoutEntry,
  WorkoutEntrySet,
} from '../../data/types'

type PreviousBySet = Record<number, { weightLb: number | null; reps: number | null }>

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
  const entryIds = useMemo(() => (entries ?? []).map((e) => e.id), [entries])
  const { data: previous } = usePreviousActuals(entryIds)
  const remove = useRemoveEntry(id)
  const move = useMoveEntry(id)
  const [openEntry, setOpenEntry] = useState<string | null>(null)

  if (isLoading) return <SkeletonList rows={2} />
  if (!workout) return <Banner kind="err">Workout not found.</Banner>

  return (
    <div className="page">
      <Card
        title={workout.name}
        subtitle="Exercises in this workout — edits save as you go"
        actions={<Link className="linkbtn" to="/workouts"><ChevronLeft size={18} aria-hidden="true" />All</Link>}
      >
        {entries && entries.length > 0 ? (
          <div className="exblocks">
            {entries.map((e, i) => (
              <div key={e.id} className="exblock">
                <div className="exblock__head">
                  <span className="exblock__name">{nameById.get(e.exercise_id) ?? '…'}</span>
                  {e.overload_mode === 'rep_ladder' ? (
                    <span className="badge">ladder</span>
                  ) : null}
                  <span className="rowactions">
                    <button
                      type="button"
                      className="reorderbtn"
                      aria-label={`Settings for ${nameById.get(e.exercise_id) ?? 'exercise'} — note, rest, overload`}
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
                    <Button
                      variant="ghost"
                      onClick={() => remove.mutate(e.id)}
                      aria-label={`Remove ${nameById.get(e.exercise_id) ?? 'exercise'}`}
                    >
                      <X size={18} aria-hidden="true" />
                    </Button>
                  </span>
                </div>

                {e.notes ? <div className="stickybanner">{e.notes}</div> : null}

                {openEntry === e.id ? (
                  <EntrySettings workoutId={id} entry={e} onDone={() => setOpenEntry(null)} />
                ) : null}

                <SetTable workoutId={id} entry={e} previous={previous?.[e.id]} />
              </div>
            ))}
          </div>
        ) : (
          <Banner kind="info">No exercises yet — add your first below.</Banner>
        )}
      </Card>

      <AddEntryForm workoutId={id} />
    </div>
  )
}

function restLabel(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

/**
 * The always-editable per-set table: SET | PREVIOUS | LB | REPS | remove.
 * Edits persist on blur (and immediately on add/remove) to
 * `workout_entry_sets` — the same rows the session snapshot plans from and
 * the rep ladder advances. Rows scaffold from the entry's uniform
 * prescription the first time and only persist once actually edited.
 */
function SetTable({
  workoutId,
  entry,
  previous,
}: {
  workoutId: string
  entry: WorkoutEntry
  previous?: PreviousBySet
}) {
  const { data: savedSets } = useEntrySets(entry.id)
  const saveSets = useSaveEntrySets(workoutId, entry.id)
  const updateEntry = useUpdateEntry(workoutId)
  const { toast } = useToast()
  const [rows, setRows] = useState<{ weight: string; reps: string }[] | null>(null)
  const [dirty, setDirty] = useState(false)
  const [invalid, setInvalid] = useState(false)

  const current =
    rows ??
    (savedSets
      ? savedSets.length > 0
        ? savedSets.map((s: WorkoutEntrySet) => ({
            weight: s.target_weight != null ? String(s.target_weight) : '',
            reps: String(s.target_reps),
          }))
        : Array.from({ length: Math.max(1, entry.sets) }, () => ({
            weight: entry.starting_weight != null ? String(entry.starting_weight) : '',
            reps: String(entry.rep_target ?? entry.rep_range_low ?? 8),
          }))
      : null)

  function parse(next: { weight: string; reps: string }[]) {
    const parsed = next.map((r) => ({
      targetReps: Number(r.reps),
      targetWeight: r.weight.trim() ? Number(r.weight) : null,
    }))
    const ok = parsed.every(
      (p) =>
        Number.isInteger(p.targetReps) &&
        p.targetReps >= 1 &&
        (p.targetWeight == null || p.targetWeight > 0),
    )
    return { parsed, ok }
  }

  function persist(next: { weight: string; reps: string }[]) {
    const { parsed, ok } = parse(next)
    setInvalid(!ok)
    if (!ok) return
    saveSets.mutate(parsed, {
      onError: () => toast("Those sets didn't save — check your connection.", 'err'),
    })
    if (parsed.length !== entry.sets) {
      updateEntry.mutate({ entryId: entry.id, patch: { sets: parsed.length } })
    }
    setDirty(false)
  }

  function setRow(i: number, patch: Partial<{ weight: string; reps: string }>) {
    if (!current) return
    setRows(current.map((r, j) => (j === i ? { ...r, ...patch } : r)))
    setDirty(true)
  }

  if (!current) return <SkeletonList rows={1} />

  return (
    <div className="settable" onBlur={() => dirty && persist(current)}>
      <div className="settable__row settable__head" aria-hidden="true">
        <span>Set</span>
        <span>Previous</span>
        <span>lb</span>
        <span>Reps</span>
        <span />
      </div>
      {current.map((r, i) => {
        const prev = previous?.[i + 1]
        return (
          <div key={i}>
            {i > 0 && entry.rest_seconds ? (
              <div className="restdivider" aria-label={`Rest ${restLabel(entry.rest_seconds)}`}>
                <span className="restdivider__line" />
                <span className="restdivider__time mono">{restLabel(entry.rest_seconds)}</span>
                <span className="restdivider__line" />
              </div>
            ) : null}
            <div className="settable__row">
              <span className="settable__n mono">{i + 1}</span>
              <span className="settable__prev mono">
                {prev && (prev.weightLb != null || prev.reps != null)
                  ? `${prev.weightLb ?? '—'} lb × ${prev.reps ?? '—'}`
                  : '—'}
              </span>
              <TextInput
                type="number"
                min="0"
                step="any"
                inputMode="decimal"
                aria-label={`Set ${i + 1} weight in pounds`}
                value={r.weight}
                onChange={(e) => setRow(i, { weight: e.target.value })}
              />
              <TextInput
                type="number"
                min="1"
                inputMode="numeric"
                aria-label={`Set ${i + 1} target reps`}
                value={r.reps}
                onChange={(e) => setRow(i, { reps: e.target.value })}
              />
              <button
                type="button"
                className="reorderbtn"
                aria-label={`Remove set ${i + 1}`}
                disabled={current.length <= 1}
                onClick={() => {
                  const next = current.filter((_, j) => j !== i)
                  setRows(next)
                  persist(next)
                }}
              >
                <Minus size={16} aria-hidden="true" />
              </button>
            </div>
          </div>
        )
      })}
      {invalid ? (
        <p className="settable__err">Reps must be at least 1; weights positive or blank.</p>
      ) : null}
      <div className="settable__foot">
        <Button
          variant="ghost"
          type="button"
          onClick={() => {
            const next = [...current, { ...(current[current.length - 1] ?? { weight: '', reps: '8' }) }]
            setRows(next)
            persist(next)
          }}
        >
          <Plus size={16} aria-hidden="true" /> Add set
        </Button>
      </div>
    </div>
  )
}

/**
 * Gear panel for one entry: sticky note (shows every workout), rest, last-set
 * AMRAP, and the overload mode — engine (routine-driven) or rep ladder with
 * its cap / increment / post-increment floor.
 */
function EntrySettings({
  workoutId,
  entry,
  onDone,
}: {
  workoutId: string
  entry: WorkoutEntry
  onDone: () => void
}) {
  const updateEntry = useUpdateEntry(workoutId)
  const [note, setNote] = useState(entry.notes ?? '')
  const [rest, setRest] = useState(entry.rest_seconds != null ? String(entry.rest_seconds) : '')
  const [amrap, setAmrap] = useState(entry.last_set_amrap)
  const [mode, setMode] = useState<OverloadMode>(entry.overload_mode)
  const [repCap, setRepCap] = useState(entry.rep_cap != null ? String(entry.rep_cap) : '10')
  const [increment, setIncrement] = useState(
    entry.increment_lb != null ? String(entry.increment_lb) : '5',
  )
  const [repsAfter, setRepsAfter] = useState(
    entry.reps_after_increment != null ? String(entry.reps_after_increment) : '',
  )
  const [error, setError] = useState<string | null>(null)

  async function onSave() {
    setError(null)
    const patch: Partial<WorkoutEntry> = {
      notes: note.trim() || null,
      overload_mode: mode,
      last_set_amrap: amrap,
      rest_seconds: rest.trim() ? Number(rest) : null,
    }
    if (patch.rest_seconds != null && !(patch.rest_seconds >= 0))
      return setError('Rest must be zero or more seconds.')
    if (mode === 'rep_ladder') {
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
    }
    try {
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

      <div className="grid2">
        <Field label="Rest (seconds)" htmlFor={`rest_${entry.id}`}>
          <TextInput
            id={`rest_${entry.id}`}
            type="number"
            min="0"
            value={rest}
            onChange={(e) => setRest(e.target.value)}
          />
        </Field>
        <label className="toggle toggle--field">
          <input type="checkbox" checked={amrap} onChange={(e) => setAmrap(e.target.checked)} />
          <span>Last set AMRAP</span>
        </label>
      </div>

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
        <>
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
            Each set that hits its target gains a rep next time; a failed set holds. When every
            set conquers the cap, the weight steps and reps reset. Unique to this workout.
          </p>
        </>
      ) : (
        <p className="muted">
          Weight and reps come from the routine engine (or your typed set targets below — typed
          targets stay fixed until you change them).
        </p>
      )}

      {error ? <Banner kind="err">{error}</Banner> : null}

      <div className="row-actions">
        <Button type="button" onClick={() => void onSave()} disabled={updateEntry.isPending}>
          {updateEntry.isPending ? 'Saving…' : 'Save'}
        </Button>
        <Button variant="ghost" type="button" onClick={onDone} disabled={updateEntry.isPending}>
          Cancel
        </Button>
      </div>
    </div>
  )
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
