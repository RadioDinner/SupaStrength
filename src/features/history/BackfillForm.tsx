/**
 * Log a past session by hand (History → Log past session): pick a workout,
 * set the date / start time / duration, fill out each exercise's sets — the
 * same set-row editing as the builder, prefilled from the workout's current
 * targets — and save. The session lands in history as completed; progression
 * and rotations are deliberately untouched (this repairs the record, it
 * doesn't move today's training state).
 */
import { useEffect, useState } from 'react'
import { format } from 'date-fns'
import { Minus, Plus } from 'lucide-react'
import { Banner, Button, Card, Field, Select, SkeletonList, TextInput } from '../../components/ui'
import { useToast } from '../../hooks/useToast'
import { useEntrySets, useExercisesByIds, useWorkoutEntries, useWorkouts } from '../workouts/useWorkouts'
import { useBackfillSession } from '../session/useSession'
import type { WorkoutEntry, WorkoutEntrySet } from '../../data/types'

interface FillRow {
  weight: string
  reps: string
  done: boolean
}

export function BackfillForm({ onDone }: { onDone: () => void }) {
  const { data: workouts } = useWorkouts()
  const backfill = useBackfillSession()
  const { toast } = useToast()
  const [workoutId, setWorkoutId] = useState('')
  const [date, setDate] = useState(() => format(new Date(), 'yyyy-MM-dd'))
  const [startTime, setStartTime] = useState(() => format(new Date(), 'HH:mm'))
  const [duration, setDuration] = useState('60')
  const [fills, setFills] = useState<Record<string, FillRow[]>>({})
  const [error, setError] = useState<string | null>(null)

  const { data: entries } = useWorkoutEntries(workoutId)
  const { data: exercises } = useExercisesByIds((entries ?? []).map((e) => e.exercise_id))
  const nameById = new Map((exercises ?? []).map((e) => [e.id, e.name]))

  async function onSave() {
    setError(null)
    if (!workoutId || !entries || entries.length === 0)
      return setError('Pick a workout with at least one exercise.')
    const started = new Date(`${date}T${startTime}`)
    if (Number.isNaN(started.getTime())) return setError('Set a valid date and start time.')
    const mins = Number(duration)
    if (!(mins > 0)) return setError('Duration must be at least 1 minute.')
    if (started.getTime() + mins * 60_000 > Date.now() + 60_000)
      return setError('That session would end in the future — check the date and time.')

    const payload = entries
      .map((e) => ({
        entry: e,
        sets: (fills[e.id] ?? []).map((r) => ({
          weightLb: r.weight.trim() ? Number(r.weight) : null,
          reps: r.reps.trim() ? Number(r.reps) : null,
          done: r.done,
        })),
      }))
      .filter((x) => x.sets.length > 0)
    for (const x of payload) {
      if (
        x.sets.some(
          (s) =>
            (s.weightLb != null && !(s.weightLb > 0)) ||
            (s.reps != null && (!Number.isInteger(s.reps) || s.reps < 0)),
        )
      )
        return setError('Weights must be positive and reps whole numbers (or blank).')
    }
    if (!payload.some((x) => x.sets.some((s) => s.done)))
      return setError('Mark at least one set as done.')

    try {
      await backfill.mutateAsync({
        performedOn: date,
        startedAt: started.toISOString(),
        completedAt: new Date(started.getTime() + mins * 60_000).toISOString(),
        entries: payload,
      })
      toast('Session added to history.', 'ok')
      onDone()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  return (
    <Card title="Log past session" subtitle="Fill in a workout you did — it lands in history as completed.">
      <div className="form">
        <Field label="Workout" htmlFor="bf_workout">
          <Select
            id="bf_workout"
            value={workoutId}
            onChange={(e) => {
              setWorkoutId(e.target.value)
              setFills({})
            }}
          >
            <option value="">Pick a workout…</option>
            {(workouts ?? []).map((w) => (
              <option key={w.id} value={w.id}>
                {w.name}
              </option>
            ))}
          </Select>
        </Field>

        <div className="grid2">
          <Field label="Date" htmlFor="bf_date">
            <TextInput id="bf_date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
          <Field label="Start time" htmlFor="bf_time">
            <TextInput id="bf_time" type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
          </Field>
        </div>
        <Field label="Duration (minutes)" htmlFor="bf_dur">
          <TextInput id="bf_dur" type="number" min="1" value={duration} onChange={(e) => setDuration(e.target.value)} />
        </Field>

        {workoutId && !entries ? <SkeletonList rows={2} /> : null}
        {workoutId && entries && entries.length === 0 ? (
          <Banner kind="info">That workout has no exercises yet.</Banner>
        ) : null}

        {(entries ?? []).map((e) => (
          <BackfillEntry
            key={e.id}
            entry={e}
            name={nameById.get(e.exercise_id) ?? '…'}
            rows={fills[e.id]}
            onRows={(rows) => setFills((f) => ({ ...f, [e.id]: rows }))}
          />
        ))}

        {error ? <Banner kind="err">{error}</Banner> : null}

        <div className="row-actions">
          <Button type="button" onClick={() => void onSave()} disabled={backfill.isPending || !workoutId}>
            {backfill.isPending ? 'Saving…' : 'Save to history'}
          </Button>
          <Button variant="ghost" type="button" onClick={onDone} disabled={backfill.isPending}>
            Cancel
          </Button>
        </div>
      </div>
    </Card>
  )
}

/** One exercise's fill-in rows, seeded from the workout's current targets. */
function BackfillEntry({
  entry,
  name,
  rows,
  onRows,
}: {
  entry: WorkoutEntry
  name: string
  rows: FillRow[] | undefined
  onRows: (rows: FillRow[]) => void
}) {
  const { data: targets } = useEntrySets(entry.id)

  // Seed once the targets arrive: saved per-set targets, else the entry's
  // uniform prescription. All sets start marked done — backfilling usually
  // means "I did the workout"; un-check the ones you skipped.
  useEffect(() => {
    if (rows || !targets) return
    const seeded: FillRow[] =
      targets.length > 0
        ? targets.map((t: WorkoutEntrySet) => ({
            weight: t.target_weight != null ? String(t.target_weight) : '',
            reps: String(t.target_reps),
            done: true,
          }))
        : Array.from({ length: Math.max(1, entry.sets) }, () => ({
            weight: entry.starting_weight != null ? String(entry.starting_weight) : '',
            reps: String(entry.rep_target ?? entry.rep_range_low ?? 8),
            done: true,
          }))
    onRows(seeded)
  }, [rows, targets, entry, onRows])

  if (!rows) return <SkeletonList rows={1} />

  function setRow(i: number, patch: Partial<FillRow>) {
    onRows(rows!.map((r, j) => (j === i ? { ...r, ...patch } : r)))
  }

  return (
    <div className="exblock">
      <div className="exblock__head">
        <span className="exblock__name">{name}</span>
      </div>
      <div className="settable">
        <div className="settable__row settable__row--fill settable__head" aria-hidden="true">
          <span>Set</span>
          <span>lb</span>
          <span>Reps</span>
          <span>Done</span>
          <span />
        </div>
        {rows.map((r, i) => (
          <div key={i} className="settable__row settable__row--fill">
            <span className="settable__n mono">{i + 1}</span>
            <TextInput
              type="number"
              min="0"
              step="any"
              inputMode="decimal"
              aria-label={`${name} set ${i + 1} weight in pounds`}
              value={r.weight}
              onChange={(e) => setRow(i, { weight: e.target.value })}
            />
            <TextInput
              type="number"
              min="0"
              inputMode="numeric"
              aria-label={`${name} set ${i + 1} reps`}
              value={r.reps}
              onChange={(e) => setRow(i, { reps: e.target.value })}
            />
            <input
              type="checkbox"
              className="settable__done"
              aria-label={`${name} set ${i + 1} done`}
              checked={r.done}
              onChange={(e) => setRow(i, { done: e.target.checked })}
            />
            <button
              type="button"
              className="reorderbtn"
              aria-label={`Remove ${name} set ${i + 1}`}
              disabled={rows.length <= 1}
              onClick={() => onRows(rows.filter((_, j) => j !== i))}
            >
              <Minus size={16} aria-hidden="true" />
            </button>
          </div>
        ))}
        <div className="settable__foot">
          <button
            type="button"
            className="linkbtn"
            onClick={() => onRows([...rows, { ...(rows[rows.length - 1] ?? { weight: '', reps: '8', done: true }) }])}
          >
            <Plus size={14} aria-hidden="true" /> Add set
          </button>
        </div>
      </div>
    </div>
  )
}
