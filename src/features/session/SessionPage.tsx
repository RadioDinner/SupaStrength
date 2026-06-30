/**
 * In-gym live session (BUILD_PLAN M5c). For each exercise: one working weight
 * (with the inline plate calculator), a rest timer, and per-set rep logging with
 * a done toggle. Completing the session advances the routine and makes it
 * immutable. Weight auto-progression is M5d.
 */
import { useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Banner, Button, Card, Spinner, TextInput } from '../../components/ui'
import { useAuth } from '../../hooks/useAuth'
import { useExercisesByIds } from '../workouts/useWorkouts'
import { PlateCalculator } from './PlateCalculator'
import { RestTimer } from './RestTimer'
import {
  useCompleteSession,
  useSession,
  useSessionEntries,
  useSessionEquipment,
  useSetLogs,
  useUpdateSetLog,
} from './useSession'
import type { Barbell, EquipmentPreferences, Exercise, PlateInventory, SessionEntry, SetLog } from '../../data/types'

export function SessionPage() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const { user } = useAuth()
  const { data: session, isLoading } = useSession(id)
  const { data: entries } = useSessionEntries(id)
  const exerciseIds = useMemo(() => (entries ?? []).map((e) => e.exercise_id), [entries])
  const { data: exercises } = useExercisesByIds(exerciseIds)
  const entryIds = useMemo(() => (entries ?? []).map((e) => e.id), [entries])
  const { data: setLogs } = useSetLogs(id, entryIds)
  const { data: equipment } = useSessionEquipment(session?.location_id ?? null, user!.id)
  const complete = useCompleteSession()

  const exById = useMemo(
    () => new Map((exercises ?? []).map((e) => [e.id, e])),
    [exercises],
  )
  const logsByEntry = useMemo(() => {
    const m = new Map<string, SetLog[]>()
    for (const l of setLogs ?? []) {
      const arr = m.get(l.session_entry_id) ?? []
      arr.push(l)
      m.set(l.session_entry_id, arr)
    }
    return m
  }, [setLogs])

  if (isLoading) return <Spinner label="Loading session…" />
  if (!session) return <Banner kind="err">Session not found.</Banner>
  if (session.status !== 'in_progress') {
    return (
      <div className="page">
        <Banner kind="ok">This session is {session.status}.</Banner>
        <Button onClick={() => navigate('/')}>Back home</Button>
      </div>
    )
  }

  async function onComplete() {
    if (!session) return
    await complete.mutateAsync(session)
    navigate('/')
  }

  return (
    <div className="page">
      <Card title="Today's session" subtitle={`Started ${session.started_at?.slice(11, 16) ?? ''}`}>
        <Button onClick={() => void onComplete()} disabled={complete.isPending}>
          {complete.isPending ? 'Finishing…' : 'Complete workout'}
        </Button>
      </Card>

      {(entries ?? []).map((entry) => (
        <EntryCard
          key={entry.id}
          entry={entry}
          exercise={exById.get(entry.exercise_id) ?? null}
          sets={logsByEntry.get(entry.id) ?? []}
          bar={equipment?.bar ?? null}
          plates={equipment?.plates ?? []}
          prefs={equipment?.prefs ?? null}
        />
      ))}
    </div>
  )
}

function plannedText(e: SessionEntry): string {
  if (e.planned_rep_scheme === 'double') return `${e.planned_sets} × ${e.planned_rep_low}–${e.planned_rep_high}`
  return `${e.planned_sets} × ${e.planned_rep_target ?? '?'}`
}

const PLATE_LOADED = new Set(['barbell', 'plate_loaded'])

function EntryCard({
  entry,
  exercise,
  sets,
  bar,
  plates,
  prefs,
}: {
  entry: SessionEntry
  exercise: Exercise | null
  sets: SetLog[]
  bar: Barbell | null
  plates: PlateInventory[]
  prefs: EquipmentPreferences | null
}) {
  const update = useUpdateSetLog()
  const [weight, setWeight] = useState('')
  const usesPlates = exercise ? PLATE_LOADED.has(exercise.loading_style) : true

  return (
    <Card title={exercise?.name ?? '…'} subtitle={plannedText(entry)}>
      <div className="form">
        <div className="weightrow">
          <label className="field__label" htmlFor={`w_${entry.id}`}>
            Working weight (lb)
          </label>
          <TextInput
            id={`w_${entry.id}`}
            type="number"
            inputMode="decimal"
            step="2.5"
            value={weight}
            onChange={(e) => setWeight(e.target.value)}
            placeholder="e.g. 185"
          />
        </div>

        {usesPlates && weight ? (
          <PlateCalculator targetLb={Number(weight)} bar={bar} plates={plates} prefs={prefs} />
        ) : null}

        <ul className="setlist">
          {sets.map((s) => (
            <SetRow
              key={s.id}
              set={s}
              weight={weight ? Number(weight) : null}
              onSave={(patch) => update.mutate({ id: s.id, patch })}
            />
          ))}
        </ul>

        {entry.planned_rest_seconds ? <RestTimer seconds={entry.planned_rest_seconds} /> : null}
      </div>
    </Card>
  )
}

function SetRow({
  set,
  weight,
  onSave,
}: {
  set: SetLog
  weight: number | null
  onSave: (patch: Partial<SetLog>) => void
}) {
  const [reps, setReps] = useState((set.actual_reps ?? set.planned_reps ?? '').toString())
  const [amrap, setAmrap] = useState((set.amrap_reps ?? '').toString())
  const [done, setDone] = useState(set.is_completed)

  function toggleDone() {
    const next = !done
    setDone(next)
    onSave({
      is_completed: next,
      completed_at: next ? new Date().toISOString() : null,
      actual_reps: reps ? Number(reps) : null,
      actual_weight: weight,
      amrap_reps: set.is_amrap && amrap ? Number(amrap) : null,
    })
  }

  return (
    <li className={`setrow ${done ? 'setrow--done' : ''}`}>
      <span className="setrow__idx mono">{set.set_index}</span>
      <div className="setrow__field">
        <TextInput
          type="number"
          inputMode="numeric"
          aria-label={`Reps for set ${set.set_index}`}
          value={reps}
          onChange={(e) => setReps(e.target.value)}
          onBlur={() => onSave({ actual_reps: reps ? Number(reps) : null })}
        />
        <span className="muted">reps{set.planned_reps ? ` /${set.planned_reps}` : ''}</span>
      </div>
      {set.is_amrap ? (
        <div className="setrow__field">
          <TextInput
            type="number"
            inputMode="numeric"
            aria-label={`AMRAP reps for set ${set.set_index}`}
            value={amrap}
            onChange={(e) => setAmrap(e.target.value)}
            onBlur={() => onSave({ amrap_reps: amrap ? Number(amrap) : null })}
            placeholder="AMRAP"
          />
          <span className="muted">AMRAP</span>
        </div>
      ) : null}
      <Button variant={done ? 'primary' : 'ghost'} onClick={toggleDone}>
        {done ? '✓' : 'Done'}
      </Button>
    </li>
  )
}
