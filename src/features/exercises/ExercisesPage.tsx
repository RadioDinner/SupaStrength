/**
 * Exercise browser (BUILD_PLAN M2): name search (trigram/ILIKE) + movement-type
 * filter over the global library + the user's custom exercises, an expandable
 * detail (muscles + instructions), and a custom-exercise creator.
 */
import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { Search } from 'lucide-react'
import { Banner, Button, Card, EmptyState, Field, Select, SkeletonList, TextInput } from '../../components/ui'
import {
  useCreateCustomExercise,
  useExerciseMuscles,
  useExercises,
  useMuscleGroups,
} from './useExercises'
import type { Exercise, LoadingStyle, MovementType, MuscleGroup, MuscleRole } from '../../data/types'

const MOVEMENTS: { value: MovementType; label: string }[] = [
  { value: 'barbell', label: 'Barbell' },
  { value: 'dumbbell', label: 'Dumbbell' },
  { value: 'machine', label: 'Machine' },
  { value: 'cable', label: 'Cable' },
  { value: 'bodyweight', label: 'Bodyweight' },
  { value: 'weighted_bodyweight', label: 'Weighted bodyweight' },
  { value: 'assisted', label: 'Assisted' },
  { value: 'timed_cardio', label: 'Cardio / timed' },
]

const MOVEMENT_DEFAULTS: Record<MovementType, { loadingStyle: LoadingStyle; isLoaded: boolean }> = {
  barbell: { loadingStyle: 'barbell', isLoaded: true },
  dumbbell: { loadingStyle: 'dumbbell', isLoaded: true },
  machine: { loadingStyle: 'stack', isLoaded: true },
  cable: { loadingStyle: 'stack', isLoaded: true },
  bodyweight: { loadingStyle: 'bodyweight', isLoaded: false },
  weighted_bodyweight: { loadingStyle: 'plate_loaded', isLoaded: true },
  assisted: { loadingStyle: 'stack', isLoaded: false },
  timed_cardio: { loadingStyle: 'timed', isLoaded: false },
}

const movementLabel = (m: MovementType) => MOVEMENTS.find((x) => x.value === m)?.label ?? m

function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value)
  useEffect(() => {
    const id = setTimeout(() => setV(value), ms)
    return () => clearTimeout(id)
  }, [value, ms])
  return v
}

export function ExercisesPage() {
  const [search, setSearch] = useState('')
  const [movement, setMovement] = useState<MovementType | ''>('')
  const [creating, setCreating] = useState(false)
  const debounced = useDebounced(search, 250)

  const { data: groups } = useMuscleGroups()
  const { data: exercises, isLoading } = useExercises({
    search: debounced,
    movementType: movement || null,
  })

  return (
    <div className="page">
      <Card
        title="Exercises"
        subtitle={exercises ? `${exercises.length} shown` : undefined}
        actions={
          <Button variant={creating ? 'ghost' : 'primary'} onClick={() => setCreating((c) => !c)}>
            {creating ? 'Close' : 'New'}
          </Button>
        }
      >
        <div className="form">
          <TextInput
            placeholder="Search exercises…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label="Search exercises"
          />
          <Select
            value={movement}
            onChange={(e) => setMovement(e.target.value as MovementType | '')}
            aria-label="Filter by movement type"
          >
            <option value="">All movement types</option>
            {MOVEMENTS.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </Select>
        </div>
      </Card>

      {creating ? (
        <CustomExerciseForm groups={groups ?? []} onDone={() => setCreating(false)} />
      ) : null}

      {isLoading ? (
        <SkeletonList rows={4} />
      ) : exercises && exercises.length === 0 ? (
        <EmptyState
          icon={<Search size={40} aria-hidden="true" />}
          title={search || movement ? 'No matches' : 'No exercises yet'}
          hint={
            search || movement
              ? 'Try a different search or movement filter — or add a custom exercise with “New”.'
              : 'Your exercise library is still loading. Pull to refresh, or add your own with “New”.'
          }
        />
      ) : (
        <Card>
          <ul className="list">
            {(exercises ?? []).map((ex) => (
              <ExerciseRow key={ex.id} exercise={ex} groups={groups ?? []} />
            ))}
          </ul>
        </Card>
      )}
    </div>
  )
}

function ExerciseRow({ exercise, groups }: { exercise: Exercise; groups: MuscleGroup[] }) {
  const [open, setOpen] = useState(false)
  return (
    <li className="exrow">
      <button
        type="button"
        className="exrow__head"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        <span className="exrow__name">{exercise.name}</span>
        <span className="exrow__tags">
          <span className="tagchip">{movementLabel(exercise.movement_type)}</span>
          {exercise.lift_key ? <span className="tagchip tagchip--key">{exercise.lift_key}</span> : null}
          {exercise.is_custom ? <span className="badge">custom</span> : null}
        </span>
      </button>
      {open ? <ExerciseDetail exercise={exercise} groups={groups} /> : null}
    </li>
  )
}

function ExerciseDetail({ exercise, groups }: { exercise: Exercise; groups: MuscleGroup[] }) {
  const { data: muscles, isLoading } = useExerciseMuscles(exercise.id)
  const nameById = useMemo(() => new Map(groups.map((g) => [g.id, g.display_name])), [groups])

  return (
    <div className="exrow__detail">
      {isLoading ? (
        <span className="muted">Loading…</span>
      ) : (
        <div className="chips">
          {(muscles ?? [])
            .slice()
            .sort((a, b) => (a.role === b.role ? 0 : a.role === 'primary' ? -1 : 1))
            .map((m) => (
              <span
                key={m.muscle_group_id}
                className={`chip ${m.role === 'primary' ? 'chip--primary' : ''}`}
              >
                {nameById.get(m.muscle_group_id) ?? '?'}
              </span>
            ))}
        </div>
      )}
      {exercise.instructions ? (
        <p className="exrow__instructions muted">{exercise.instructions}</p>
      ) : null}
    </div>
  )
}

function CustomExerciseForm({ groups, onDone }: { groups: MuscleGroup[]; onDone: () => void }) {
  const create = useCreateCustomExercise()
  const [name, setName] = useState('')
  const [movement, setMovement] = useState<MovementType>('barbell')
  const [primary, setPrimary] = useState<number | ''>('')
  const [secondary, setSecondary] = useState<Set<number>>(new Set())
  const [error, setError] = useState<string | null>(null)

  function toggleSecondary(id: number) {
    setSecondary((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    if (!name.trim()) return setError('Name is required.')
    if (primary === '') return setError('Pick a primary muscle.')

    const defaults = MOVEMENT_DEFAULTS[movement]
    const muscles: { muscleGroupId: number; role: MuscleRole }[] = [
      { muscleGroupId: primary, role: 'primary' },
      ...[...secondary]
        .filter((id) => id !== primary)
        .map((id) => ({ muscleGroupId: id, role: 'secondary' as MuscleRole })),
    ]
    try {
      await create.mutateAsync({
        name,
        movementType: movement,
        loadingStyle: defaults.loadingStyle,
        isLoaded: defaults.isLoaded,
        muscles,
      })
      onDone()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  return (
    <Card title="New custom exercise">
      <form className="form" onSubmit={onSubmit}>
        <Field label="Name" htmlFor="ex_name">
          <TextInput id="ex_name" value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="Movement type" htmlFor="ex_movement">
          <Select
            id="ex_movement"
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
        <Field label="Primary muscle" htmlFor="ex_primary">
          <Select
            id="ex_primary"
            value={primary}
            onChange={(e) => setPrimary(e.target.value ? Number(e.target.value) : '')}
          >
            <option value="">Select…</option>
            {groups.map((g) => (
              <option key={g.id} value={g.id}>
                {g.display_name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Secondary muscles" hint="Counted at 0.5× for volume">
          <div className="chips">
            {groups.map((g) => (
              <button
                key={g.id}
                type="button"
                className={`chip chip--toggle ${secondary.has(g.id) ? 'chip--on' : ''}`}
                onClick={() => toggleSecondary(g.id)}
                disabled={g.id === primary}
              >
                {g.display_name}
              </button>
            ))}
          </div>
        </Field>

        {error ? <Banner kind="err">{error}</Banner> : null}

        <Button type="submit" disabled={create.isPending}>
          {create.isPending ? 'Creating…' : 'Create exercise'}
        </Button>
      </form>
    </Card>
  )
}
