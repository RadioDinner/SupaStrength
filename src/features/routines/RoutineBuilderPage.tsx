/**
 * Routine builder (BUILD_PLAN M4). Assemble rotations (independent tracks) of
 * workouts and see the computed "next gym day" — the head of every rotation. The
 * pointer math is the pure, tested `engine/schedule`.
 */
import { useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight, Plus, X } from 'lucide-react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Banner, Button, Card, ConfirmDialog, Select, SkeletonList } from '../../components/ui'
import { nextGymDay, type EngineRotation } from '../../data/repos/routinesRepo'
import { useWorkouts } from '../workouts/useWorkouts'
import { useActiveSession, useStartNextGymDay } from '../session/useSession'
import {
  useAddRotation,
  useAddRotationWorkout,
  useAdvanceRoutine,
  useRemoveRotation,
  useRemoveRotationWorkout,
  useRoutine,
  useRoutineSchedule,
  useSetActiveRoutine,
  type ScheduleRow,
} from './useRoutines'

export function RoutineBuilderPage() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const { data: routine, isLoading } = useRoutine(id)
  const { data: schedule } = useRoutineSchedule(id)
  const { data: workouts } = useWorkouts()
  const { data: active } = useActiveSession()
  const addRotation = useAddRotation(id)
  const advance = useAdvanceRoutine(id)
  const setActive = useSetActiveRoutine()
  const startDay = useStartNextGymDay()

  async function onStartDay() {
    const sessionId = await startDay.mutateAsync(id)
    navigate(`/session/${sessionId}`)
  }

  const workoutName = useMemo(
    () => new Map((workouts ?? []).map((w) => [w.id, w.name])),
    [workouts],
  )

  const engineRotations: EngineRotation[] = useMemo(
    () =>
      (schedule ?? []).map((s) => ({
        id: s.rotation.id,
        currentIndex: s.rotation.current_index,
        workoutIds: s.workouts.map((w) => w.workout_id),
      })),
    [schedule],
  )
  const today = nextGymDay(engineRotations)

  if (isLoading) return <SkeletonList rows={2} />
  if (!routine) return <Banner kind="err">Routine not found.</Banner>

  return (
    <div className="page">
      <Card
        title={
          <>
            {routine.name}
            {routine.is_active ? <span className="badge badge--live">active</span> : null}
          </>
        }
        actions={<Link className="linkbtn" to="/routines"><ChevronLeft size={18} aria-hidden="true" />All</Link>}
      >
        {!routine.is_active ? (
          <Button variant="ghost" onClick={() => setActive.mutate(id)}>
            Make this routine active
          </Button>
        ) : (
          <span className="muted">This is your active routine.</span>
        )}
      </Card>

      <Card title="Next gym day" subtitle="The head of every rotation, combined.">
        {today.length === 0 ? (
          <Banner kind="info">Add rotations and workouts below to schedule a day.</Banner>
        ) : (
          <>
            <ul className="list">
              {today.map((d) => (
                <li key={d.rotationId} className="list__row">
                  <span className="workout-link__name">{workoutName.get(d.workoutId) ?? '…'}</span>
                  <span className="muted mono">#{d.position + 1}</span>
                </li>
              ))}
            </ul>
            <div className="row-actions">
              <Button onClick={() => void onStartDay()} disabled={startDay.isPending || !!active}>
                {active ? 'Session in progress' : <>Start this day <ChevronRight size={18} aria-hidden="true" /></>}
              </Button>
              <Button
                variant="ghost"
                onClick={() => advance.mutate(engineRotations)}
                disabled={advance.isPending}
              >
                Skip
              </Button>
            </div>
          </>
        )}
      </Card>

      {(schedule ?? []).map((s, i) => (
        <RotationCard
          key={s.rotation.id}
          routineId={id}
          row={s}
          index={i}
          workoutName={workoutName}
          workouts={(workouts ?? []).map((w) => ({ id: w.id, name: w.name }))}
        />
      ))}

      <div>
        <div className="row-actions">
          <Button onClick={() => addRotation.mutate(null)} disabled={addRotation.isPending}>
            <Plus size={18} aria-hidden="true" /> Add rotation
          </Button>
        </div>
        <p className="muted" style={{ marginTop: 10 }}>
          One rotation cycles its workouts (e.g. A → B → A). A length-1 rotation
          (e.g. a shoulder finisher) runs every day.
        </p>
      </div>
    </div>
  )
}

function RotationCard({
  routineId,
  row,
  index,
  workoutName,
  workouts,
}: {
  routineId: string
  row: ScheduleRow
  index: number
  workoutName: Map<string, string>
  workouts: { id: string; name: string }[]
}) {
  const addWorkout = useAddRotationWorkout(routineId)
  const removeWorkout = useRemoveRotationWorkout(routineId)
  const removeRotation = useRemoveRotation(routineId)
  const [pick, setPick] = useState('')
  const [confirmRemove, setConfirmRemove] = useState(false)
  const current = row.workouts.length ? row.rotation.current_index % row.workouts.length : 0

  return (
    <>
    <Card
      title={row.rotation.name ?? `Rotation ${index + 1}`}
      actions={
        <Button variant="ghost" onClick={() => setConfirmRemove(true)} aria-label="Remove rotation">
          <X size={18} aria-hidden="true" />
        </Button>
      }
    >
      {row.workouts.length > 0 ? (
        <ul className="list">
          {row.workouts.map((rw, i) => (
            <li key={rw.id} className="list__row">
              <span>
                <span className={i === current ? 'workout-link__name' : 'muted'}>
                  {workoutName.get(rw.workout_id) ?? '…'}
                </span>
                {i === current ? <span className="badge badge--live">next</span> : null}
              </span>
              <Button variant="ghost" onClick={() => removeWorkout.mutate(rw.id)} aria-label="Remove">
                <X size={18} aria-hidden="true" />
              </Button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="muted">Empty — add a workout.</p>
      )}

      <div className="inline-form">
        <Select value={pick} onChange={(e) => setPick(e.target.value)} aria-label="Pick a workout">
          <option value="">Add a workout…</option>
          {workouts.map((w) => (
            <option key={w.id} value={w.id}>
              {w.name}
            </option>
          ))}
        </Select>
        <Button
          disabled={!pick || addWorkout.isPending}
          onClick={() => {
            if (!pick) return
            addWorkout.mutate({ rotationId: row.rotation.id, workoutId: pick })
            setPick('')
          }}
        >
          Add
        </Button>
      </div>
    </Card>
    {confirmRemove ? (
      <ConfirmDialog
        title="Remove this rotation?"
        body="This deletes the rotation and the workouts you added to it."
        confirmLabel="Remove"
        danger
        pending={removeRotation.isPending}
        onCancel={() => setConfirmRemove(false)}
        onConfirm={() => {
          removeRotation.mutate(row.rotation.id)
          setConfirmRemove(false)
        }}
      />
    ) : null}
    </>
  )
}
