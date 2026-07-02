/**
 * In-gym live session (BUILD_PLAN M5c) — redesigned per the impeccable critique.
 *
 * One exercise at a time: a current-exercise HERO (big tabular weight + ± stepper,
 * prominent plate load, one-tap set logging with a rep stepper, rest timer), a
 * compact "up next" strip for the rest, a session progress header, and a guarded
 * bottom "Complete" that confirms with an end-of-session summary. "The set is the
 * hero; numbers read at arm's length."
 */
import { useId, useMemo, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useNavigate, useParams } from 'react-router-dom'
import { Check, ChevronLeft, ChevronRight, Pin, Video } from 'lucide-react'
import { Banner, Button, Card, SkeletonList, TextArea } from '../../components/ui'
import { useDialog } from '../../hooks/useDialog'
import { useAuth } from '../../hooks/useAuth'
import { useToast } from '../../hooks/useToast'
import { useExercisesByIds, useWorkoutEntriesByIds } from '../workouts/useWorkouts'
import { solvePlates, type PlateStock } from '../../engine/plates'
import { generateWarmups } from '../../engine/warmups'
import { RestTimer } from './RestTimer'
import { VideoSheet } from './VideoSheet'
import { summarizeSession, type ExerciseSummary, type SessionSummary } from './summary'
import {
  useCompleteSession,
  useSession,
  useSessionEntries,
  useSessionEquipment,
  useSetLogs,
  useUpdateSessionEntryNotes,
  useUpdateSetLog,
} from './useSession'
import type {
  Barbell,
  EquipmentPreferences,
  Exercise,
  PlateInventory,
  SessionEntry,
  SetLog,
} from '../../data/types'

const PLATE_LOADED = new Set(['barbell', 'plate_loaded'])

function schemeText(e: SessionEntry): string {
  if (e.planned_rep_scheme === 'double') return `${e.planned_sets} × ${e.planned_rep_low}–${e.planned_rep_high}`
  // Per-set targets (rep ladder) have no single entry-level rep figure.
  if (e.planned_rep_target == null) return `${e.planned_sets} sets`
  return `${e.planned_sets} × ${e.planned_rep_target}`
}

export function SessionPage() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const { user } = useAuth()
  const { toast } = useToast()
  const { data: session, isLoading } = useSession(id)
  const { data: entries } = useSessionEntries(id)
  const exerciseIds = useMemo(() => (entries ?? []).map((e) => e.exercise_id), [entries])
  const { data: exercises } = useExercisesByIds(exerciseIds)
  const entryIds = useMemo(() => (entries ?? []).map((e) => e.id), [entries])
  const { data: setLogs } = useSetLogs(id, entryIds)
  const { data: equipment } = useSessionEquipment(session?.location_id ?? null, user!.id)
  const update = useUpdateSetLog()
  const updateNotes = useUpdateSessionEntryNotes()
  const complete = useCompleteSession()
  // Sticky per-exercise notes live on the template entry (workout_entries.notes).
  const workoutEntryIds = useMemo(
    () => (entries ?? []).map((e) => e.workout_entry_id).filter((x): x is string => !!x),
    [entries],
  )
  const { data: workoutEntries } = useWorkoutEntriesByIds(workoutEntryIds)
  const weById = useMemo(
    () => new Map((workoutEntries ?? []).map((w) => [w.id, w])),
    [workoutEntries],
  )

  const exById = useMemo(() => new Map((exercises ?? []).map((e) => [e.id, e])), [exercises])
  const logsByEntry = useMemo(() => {
    const m = new Map<string, SetLog[]>()
    for (const l of setLogs ?? []) {
      const a = m.get(l.session_entry_id) ?? []
      a.push(l)
      m.set(l.session_entry_id, a)
    }
    return m
  }, [setLogs])

  // Local edit overlays (persist across exercise navigation; fall back to data).
  const [weights, setWeights] = useState<Record<string, string>>({})
  const [entryNotes, setEntryNotes] = useState<Record<string, string>>({})
  const [reps, setReps] = useState<Record<string, string>>({})
  const [doneSet, setDoneSet] = useState<Record<string, boolean>>({})
  const [loggedWeights, setLoggedWeights] = useState<Record<string, number>>({})
  const [restSignal, setRestSignal] = useState(0)
  const [activeIndex, setActiveIndex] = useState(0)
  const [confirming, setConfirming] = useState(false)
  const [summary, setSummary] = useState<SessionSummary | null>(null)
  const [videoSet, setVideoSet] = useState<SetLog | null>(null)

  const ordered = useMemo(() => entries ?? [], [entries])
  const weightOf = (e: SessionEntry) =>
    weights[e.id] ?? (e.planned_weight != null ? String(e.planned_weight) : '')
  const repsOf = (s: SetLog) => reps[s.id] ?? String(s.actual_reps ?? s.planned_reps ?? '')
  const isDone = (s: SetLog) => doneSet[s.id] ?? s.is_completed

  const totals = useMemo(() => {
    let total = 0
    let done = 0
    for (const e of ordered) {
      const ls = logsByEntry.get(e.id) ?? []
      total += ls.length
      done += ls.filter((s) => doneSet[s.id] ?? s.is_completed).length
    }
    return { total, done }
  }, [ordered, logsByEntry, doneSet])

  if (isLoading) return <SkeletonList rows={3} />
  if (!session) return <Banner kind="err">Session not found.</Banner>
  // The payoff renders ahead of the status guard: once completion succeeds the
  // session is no longer in_progress, and the celebration must still show.
  if (summary) {
    return (
      <PayoffSheet
        summary={summary}
        nameOf={(exerciseId) => exById.get(exerciseId)?.name ?? 'Exercise'}
        onDone={() => navigate('/')}
      />
    )
  }
  if (session.status !== 'in_progress') {
    return (
      <div className="page">
        <Banner kind="ok">This session is {session.status}.</Banner>
        <Button onClick={() => navigate('/')}>Back home</Button>
      </div>
    )
  }

  function toggleSet(entry: SessionEntry, s: SetLog) {
    const prevDone = isDone(s)
    const prevLogged = loggedWeights[s.id]
    const next = !prevDone
    setDoneSet((d) => ({ ...d, [s.id]: next }))
    const r = reps[s.id] ?? String(s.actual_reps ?? s.planned_reps ?? '')
    // An explicit hero-input edit wins; otherwise each set logs at its OWN
    // planned weight (per-set targets can differ), falling back to the entry's.
    const w =
      weights[entry.id] ??
      (s.planned_weight != null
        ? String(s.planned_weight)
        : entry.planned_weight != null
          ? String(entry.planned_weight)
          : '')
    // Capture this set's own load (so ramping/back-off shows per set) and kick
    // off rest — only when logging, not when undoing.
    if (next) {
      if (w) setLoggedWeights((m) => ({ ...m, [s.id]: Number(w) }))
      setRestSignal((n) => n + 1)
    } else {
      setLoggedWeights((m) => {
        const copy = { ...m }
        delete copy[s.id]
        return copy
      })
    }
    update.mutate(
      {
        id: s.id,
        patch: {
          is_completed: next,
          completed_at: next ? new Date().toISOString() : null,
          actual_reps: r ? Number(r) : null,
          actual_weight: w ? Number(w) : null,
          amrap_reps: s.is_amrap && r ? Number(r) : null,
        },
      },
      {
        // A basement-gym signal drop must not silently "eat" a logged set: roll
        // the optimistic UI back to what it was and tell the lifter.
        onError: () => {
          setDoneSet((d) => ({ ...d, [s.id]: prevDone }))
          setLoggedWeights((m) => {
            const copy = { ...m }
            if (prevLogged === undefined) delete copy[s.id]
            else copy[s.id] = prevLogged
            return copy
          })
          toast(next ? "That set didn't save — check your connection." : "Couldn't update that set.", 'err')
        },
      },
    )
  }

  const active = ordered[activeIndex]

  async function onComplete() {
    if (!session) return
    // Snapshot what the screen shows before the writes (local overlays win over
    // possibly-stale DB rows — same resolution the set cards use).
    const snapshot = ordered.map((e) => ({
      exerciseId: e.exercise_id,
      sets: (logsByEntry.get(e.id) ?? []).map((s) => {
        if (!isDone(s)) return { done: false, weightLb: null, reps: null }
        return {
          done: true,
          weightLb: loggedWeights[s.id] ?? s.actual_weight ?? (Number(weightOf(e)) || null),
          reps: Number(repsOf(s)) || null,
        }
      }),
    }))
    // Let in-flight set-log writes land first (bounded): completion freezes
    // set_logs and reads them for the progression verdict, so a just-tapped
    // final set still PATCHing on gym wifi must not be missed (wrong "failure"
    // verdict) or rejected by the immutability trigger. Past the cap we proceed
    // — a connection that bad will fail complete() visibly, which is retryable.
    const deadline = Date.now() + 6000
    while (qc.isMutating() > 0 && Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 150))
    }
    try {
      const report = await complete.mutateAsync(session)
      setSummary(
        summarizeSession({
          entries: snapshot,
          outcomes: report.outcomes,
          bestE1rmByExercise: report.bestE1rmByExercise,
          startedAt: session.started_at,
          endedAtMs: Date.now(),
        }),
      )
      setConfirming(false)
    } catch {
      // Same contract as toggleSet: a signal drop must never silently eat the
      // session. Keep the confirm sheet open so "Finish & lock" can be retried.
      toast("Couldn't finish the session — check your connection and try again.", 'err')
    }
  }

  return (
    <div className="session">
      <ProgressHeader
        exerciseIndex={activeIndex}
        exerciseCount={ordered.length}
        setsDone={totals.done}
        setsTotal={totals.total}
      />

      {active ? (
        <ActiveExercise
          entry={active}
          exercise={exById.get(active.exercise_id) ?? null}
          sets={logsByEntry.get(active.id) ?? []}
          weight={weightOf(active)}
          weightTouched={weights[active.id] !== undefined}
          onWeight={(v) => setWeights((w) => ({ ...w, [active.id]: v }))}
          repsOf={repsOf}
          onReps={(s, v) => setReps((r) => ({ ...r, [s.id]: v }))}
          isDone={isDone}
          onToggle={(s) => toggleSet(active, s)}
          onVideo={(s) => setVideoSet(s)}
          loggedWeights={loggedWeights}
          restSignal={restSignal}
          bar={equipment?.bar ?? null}
          plates={equipment?.plates ?? []}
          prefs={equipment?.prefs ?? null}
          stickyNote={
            (active.workout_entry_id ? weById.get(active.workout_entry_id)?.notes : null) ?? null
          }
          note={entryNotes[active.id] ?? active.notes ?? ''}
          onNote={(v) => setEntryNotes((n) => ({ ...n, [active.id]: v }))}
          onNoteBlur={() => {
            const text = (entryNotes[active.id] ?? active.notes ?? '').trim()
            if ((active.notes ?? '') === text) return
            updateNotes.mutate(
              { id: active.id, notes: text || null },
              { onError: () => toast("That note didn't save — check your connection.", 'err') },
            )
          }}
          hasPrev={activeIndex > 0}
          hasNext={activeIndex < ordered.length - 1}
          onPrev={() => setActiveIndex((i) => Math.max(0, i - 1))}
          onNext={() => setActiveIndex((i) => Math.min(ordered.length - 1, i + 1))}
        />
      ) : null}

      {ordered.length > 1 ? (
        <div className="upnext">
          <p className="upnext__label">Workout</p>
          <ul className="upnext__list">
            {ordered.map((e, i) => {
              const ls = logsByEntry.get(e.id) ?? []
              const d = ls.filter((s) => isDone(s)).length
              const allDone = ls.length > 0 && d === ls.length
              return (
                <li key={e.id}>
                  <button
                    type="button"
                    className={`upnext__item ${i === activeIndex ? 'is-active' : ''} ${allDone ? 'is-done' : ''}`}
                    onClick={() => setActiveIndex(i)}
                  >
                    <span className="upnext__name">{exById.get(e.exercise_id)?.name ?? '…'}</span>
                    <span className="upnext__meta mono">
                      {allDone ? (
                        <>
                          <Check size={14} aria-hidden="true" /> done
                        </>
                      ) : (
                        `${d}/${ls.length}`
                      )}
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
        </div>
      ) : null}

      <div className="session__finish">
        <Button onClick={() => setConfirming(true)} disabled={complete.isPending}>
          {complete.isPending ? 'Finishing…' : 'Complete workout'}
        </Button>
      </div>

      {confirming ? (
        <CompleteSheet
          setsDone={totals.done}
          setsTotal={totals.total}
          exerciseCount={ordered.length}
          pending={complete.isPending}
          onCancel={() => setConfirming(false)}
          onConfirm={() => void onComplete()}
        />
      ) : null}

      {videoSet ? (
        <VideoSheet
          setLogId={videoSet.id}
          userId={user!.id}
          setLabel={`Set ${videoSet.set_index}`}
          onClose={() => setVideoSet(null)}
        />
      ) : null}
    </div>
  )
}

function ProgressHeader({
  exerciseIndex,
  exerciseCount,
  setsDone,
  setsTotal,
}: {
  exerciseIndex: number
  exerciseCount: number
  setsDone: number
  setsTotal: number
}) {
  const pct = setsTotal ? Math.round((setsDone / setsTotal) * 100) : 0
  return (
    <div className="sprogress">
      <div className="sprogress__row">
        <span className="sprogress__lift">
          Exercise{' '}
          <strong className="mono">
            {exerciseIndex + 1}/{exerciseCount}
          </strong>
        </span>
        <span className="sprogress__sets mono">
          {setsDone}/{setsTotal} sets
        </span>
      </div>
      <div className="sprogress__bar" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
        <span className="sprogress__fill" style={{ transform: `scaleX(${pct / 100})` }} />
      </div>
    </div>
  )
}

function ActiveExercise({
  entry,
  exercise,
  sets,
  weight,
  weightTouched,
  onWeight,
  repsOf,
  onReps,
  isDone,
  onToggle,
  onVideo,
  loggedWeights,
  restSignal,
  bar,
  plates,
  prefs,
  stickyNote,
  note,
  onNote,
  onNoteBlur,
  hasPrev,
  hasNext,
  onPrev,
  onNext,
}: {
  entry: SessionEntry
  exercise: Exercise | null
  sets: SetLog[]
  weight: string
  weightTouched: boolean
  onWeight: (v: string) => void
  repsOf: (s: SetLog) => string
  onReps: (s: SetLog, v: string) => void
  isDone: (s: SetLog) => boolean
  onToggle: (s: SetLog) => void
  onVideo: (s: SetLog) => void
  loggedWeights: Record<string, number>
  restSignal: number
  bar: Barbell | null
  plates: PlateInventory[]
  prefs: EquipmentPreferences | null
  stickyNote: string | null
  note: string
  onNote: (v: string) => void
  onNoteBlur: () => void
  hasPrev: boolean
  hasNext: boolean
  onPrev: () => void
  onNext: () => void
}) {
  const usesPlates = exercise ? PLATE_LOADED.has(exercise.loading_style) : false
  const w = Number(weight)
  const currentIdx = sets.findIndex((s) => !isDone(s))

  const solution = useMemo(() => {
    if (!usesPlates || !bar || !w) return null
    const inventory: PlateStock[] = plates.map((p) => ({
      denominationLb: p.denomination_lb,
      quantity: p.quantity,
    }))
    return solvePlates(w, bar.weight_lb, inventory, {
      rounding: prefs?.rounding_direction ?? 'down',
      microPlatesEnabled: prefs?.micro_plates_enabled ?? false,
    })
  }, [usesPlates, bar, w, plates, prefs])

  // Warm-up ramp (engine-generated guidance, not logged): only for a loaded
  // barbell carrying meaningfully more than the bar itself.
  const warmups = useMemo(() => {
    if (!usesPlates || !bar || !w) return []
    return generateWarmups({
      workingWeightLb: w,
      barbellLb: bar.weight_lb,
      inventory: plates.map((p) => ({ denominationLb: p.denomination_lb, quantity: p.quantity })),
      microPlatesEnabled: prefs?.micro_plates_enabled ?? false,
      roundingDirection: prefs?.rounding_direction ?? 'down',
      thresholdBasis: 'working_weight',
      thresholdValue: bar.weight_lb + 30,
    })
  }, [usesPlates, bar, w, plates, prefs])
  const [warmDone, setWarmDone] = useState<Record<number, boolean>>({})

  function bump(delta: number) {
    const next = Math.max(0, (Number(weight) || 0) + delta)
    onWeight(String(next))
  }

  return (
    <Card>
      <div className="hero__head">
        <h2 className="hero__name">{exercise?.name ?? '…'}</h2>
        <span className="hero__scheme mono">{schemeText(entry)}</span>
      </div>

      {stickyNote ? (
        <p className="stickynote">
          <Pin size={14} aria-hidden="true" /> {stickyNote}
        </p>
      ) : null}

      <div className="weighthero">
        <button className="weighthero__step" onClick={() => bump(-5)} aria-label="Decrease weight 5 lb">
          −
        </button>
        <div className="weighthero__value">
          <input
            className="weighthero__input mono"
            type="number"
            inputMode="decimal"
            step="2.5"
            value={weight}
            onChange={(e) => onWeight(e.target.value)}
            aria-label="Working weight in pounds"
          />
          <span className="weighthero__unit">lb</span>
        </div>
        <button className="weighthero__step" onClick={() => bump(5)} aria-label="Increase weight 5 lb">
          +
        </button>
      </div>

      {usesPlates ? (
        <div className="plateload">
          {!bar ? (
            <span className="muted">Set a default barbell to see the plate load.</span>
          ) : solution ? (
            <>
              <div className="plateload__plates">
                {solution.perSide.length === 0 ? (
                  <span className="muted">empty bar</span>
                ) : (
                  solution.perSide.map((p) => (
                    <span key={p.denominationLb} className="plate plate--lg">
                      {p.count}×{p.denominationLb}
                    </span>
                  ))
                )}
              </div>
              <p className="plateload__total mono">
                {bar.name} · loads <strong>{solution.loadedTotalLb} lb</strong>
                {solution.exact ? '' : ` (${solution.deltaLb > 0 ? '+' : ''}${solution.deltaLb})`}
                {solution.ceilingReached ? ' · max' : ''} per side
              </p>
            </>
          ) : (
            <span className="muted">Enter a weight.</span>
          )}
        </div>
      ) : null}

      {warmups.length > 0 ? (
        <div className="warmups">
          <p className="warmups__label">Warm-up</p>
          <ul className="warmups__list">
            {warmups.map((wu, i) => (
              <li key={`${wu.pct}-${wu.weightLb}`}>
                <button
                  type="button"
                  className={`warmup ${warmDone[i] ? 'is-done' : ''}`}
                  aria-pressed={!!warmDone[i]}
                  aria-label={`Warm-up ${wu.pct === 0 ? 'empty bar' : `${wu.pct} percent`}, ${wu.weightLb} pounds`}
                  onClick={() => setWarmDone((d) => ({ ...d, [i]: !d[i] }))}
                >
                  <span className="warmup__pct">{wu.pct === 0 ? 'Bar' : `${wu.pct}%`}</span>
                  <span className="warmup__wt mono">
                    {wu.weightLb}
                    <span className="warmup__unit">lb</span>
                  </span>
                  {warmDone[i] ? (
                    <span className="warmup__check" aria-hidden="true">
                      <Check size={16} aria-hidden="true" />
                    </span>
                  ) : null}
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <ul className="sets">
        {sets.map((s, i) => {
          const done = isDone(s)
          const current = i === currentIdx
          // Each set shows the load it was logged at (ramp/back-off visible);
          // a pending set previews its own planned weight (per-set targets can
          // differ) unless the hero input was edited, which overrides all sets.
          const shownWeight = done
            ? loggedWeights[s.id] ?? s.actual_weight ?? w
            : weightTouched
              ? w
              : s.planned_weight ?? w
          return (
            <li key={s.id} className={`setcard ${done ? 'is-done' : ''} ${current ? 'is-current' : ''}`}>
              <span className="setcard__n">Set {s.set_index}</span>
              <span className="setcard__wt mono">
                {shownWeight ? (
                  <>
                    {shownWeight}
                    <span className="setcard__wtunit">lb</span>
                  </>
                ) : (
                  '—'
                )}
              </span>
              <span className="setcard__reps">
                <button
                  className="repstep"
                  aria-label="Fewer reps"
                  onClick={() => onReps(s, String(Math.max(0, (Number(repsOf(s)) || 0) - 1)))}
                >
                  −
                </button>
                <span className="repstep__n mono">{repsOf(s) || '0'}</span>
                <button
                  className="repstep"
                  aria-label="More reps"
                  onClick={() => onReps(s, String((Number(repsOf(s)) || 0) + 1))}
                >
                  +
                </button>
                <span className="setcard__unit">{s.is_amrap ? 'AMRAP' : 'reps'}</span>
              </span>
              <span className="setcard__actions">
                <button
                  className={`logbtn ${done ? 'is-done' : ''}`}
                  aria-pressed={done}
                  aria-label={`${done ? 'Undo' : 'Log'} set ${s.set_index}`}
                  onClick={() => onToggle(s)}
                >
                  {done ? <Check size={18} aria-hidden="true" /> : 'Log'}
                </button>
                {done ? (
                  <button
                    className="setvid"
                    aria-label={`Form video for set ${s.set_index}`}
                    title="Form video"
                    onClick={() => onVideo(s)}
                  >
                    <Video size={18} aria-hidden="true" />
                  </button>
                ) : null}
              </span>
            </li>
          )
        })}
      </ul>

      {entry.planned_rest_seconds ? (
        <RestTimer seconds={entry.planned_rest_seconds} autoStartSignal={restSignal} />
      ) : null}

      <div className="sessionnote">
        <TextArea
          placeholder="Note for today (e.g. shoulders clicking)"
          aria-label={`Today's note for ${exercise?.name ?? 'this exercise'}`}
          value={note}
          onChange={(e) => onNote(e.target.value)}
          onBlur={onNoteBlur}
        />
      </div>

      <div className="hero__nav">
        <Button variant="ghost" disabled={!hasPrev} onClick={onPrev}>
          <ChevronLeft size={18} aria-hidden="true" /> Prev
        </Button>
        <Button variant="ghost" disabled={!hasNext} onClick={onNext}>
          Next <ChevronRight size={18} aria-hidden="true" />
        </Button>
      </div>
    </Card>
  )
}

function CompleteSheet({
  setsDone,
  setsTotal,
  exerciseCount,
  pending,
  onCancel,
  onConfirm,
}: {
  setsDone: number
  setsTotal: number
  exerciseCount: number
  pending: boolean
  onCancel: () => void
  onConfirm: () => void
}) {
  const nothingLogged = setsDone === 0
  const panelRef = useDialog<HTMLDivElement>(onCancel)
  const titleId = useId()
  return (
    <div className="sheet">
      <div className="sheet__backdrop" onClick={onCancel} />
      <div
        className="sheet__panel"
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
      >
        <h3 className="sheet__title" id={titleId}>
          Finish &amp; lock?
        </h3>
        {nothingLogged ? (
          <Banner kind="warn">You haven&apos;t logged any sets yet. Log at least one before finishing.</Banner>
        ) : (
          <p className="sheet__summary">
            <strong className="mono">{setsDone}</strong> of {setsTotal} sets logged across{' '}
            <strong className="mono">{exerciseCount}</strong>{' '}
            {exerciseCount === 1 ? 'exercise' : 'exercises'}. Completing locks this session and
            advances your routine — the weights climb next time.
          </p>
        )}
        <div className="sheet__actions">
          <Button variant="ghost" onClick={onCancel} disabled={pending}>
            Keep going
          </Button>
          <Button onClick={onConfirm} disabled={pending || nothingLogged}>
            {pending ? 'Finishing…' : 'Finish & lock'}
          </Button>
        </div>
      </div>
    </div>
  )
}

/** The peak-end moment: what you did, what it earned, what's next. */
function PayoffSheet({
  summary,
  nameOf,
  onDone,
}: {
  summary: SessionSummary
  nameOf: (exerciseId: string) => string
  onDone: () => void
}) {
  const panelRef = useDialog<HTMLDivElement>(onDone)
  const titleId = useId()
  return (
    <div className="sheet">
      <div className="sheet__backdrop" onClick={onDone} />
      <div
        className="sheet__panel payoff"
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
      >
        <h3 className="sheet__title" id={titleId}>
          Workout complete
        </h3>
        <div className="payoff__stats">
          <div className="stat">
            <div className="stat__value">
              {summary.setsDone}
              <span className="stat__unit">/ {summary.setsTotal}</span>
            </div>
            <span className="stat__label">Sets</span>
          </div>
          {summary.tonnageLb > 0 ? (
            <div className="stat">
              <div className="stat__value">
                {Math.round(summary.tonnageLb).toLocaleString()}
                <span className="stat__unit">lb</span>
              </div>
              <span className="stat__label">Volume</span>
            </div>
          ) : null}
          {summary.durationMin != null ? (
            <div className="stat">
              <div className="stat__value">
                {summary.durationMin}
                <span className="stat__unit">min</span>
              </div>
              <span className="stat__label">Time</span>
            </div>
          ) : null}
        </div>
        <ul className="payoff__list">
          {summary.exercises.map((x) => (
            <li key={x.exerciseId} className="payoffrow">
              <span className="payoffrow__name">{nameOf(x.exerciseId)}</span>
              {x.setsDone === 0 ? (
                <span className="payoffrow__skipped">skipped</span>
              ) : (
                <>
                  {x.isRecord ? <span className="payoffrow__pr">PR</span> : null}
                  <span className="payoffrow__top mono">
                    {x.topWeightLb != null
                      ? `${x.topWeightLb} lb × ${x.topReps}`
                      : `${x.setsDone} ${x.setsDone === 1 ? 'set' : 'sets'}`}
                  </span>
                  {x.bestE1rmLb != null ? (
                    <span className="payoffrow__e1rm">e1RM {Math.round(x.bestE1rmLb)}</span>
                  ) : null}
                </>
              )}
              <NextTime x={x} />
            </li>
          ))}
        </ul>
        <div className="sheet__actions">
          <Button onClick={onDone}>Done</Button>
        </div>
      </div>
    </div>
  )
}

/** "Next time: 230 lb (+5)" — the auto-progression made visible at the payoff. */
function NextTime({ x }: { x: ExerciseSummary }) {
  if (x.nextLb == null) return null
  const delta = x.deltaLb
  const dir = !delta ? 'hold' : delta > 0 ? 'up' : 'down'
  return (
    <span className={`payoffrow__next payoffrow__next--${dir}`}>
      Next time:{' '}
      <strong className="mono">
        {x.nextLb} lb{dir === 'up' ? ` (+${delta})` : dir === 'down' ? ` (−${Math.abs(delta!)})` : ''}
      </strong>
    </span>
  )
}
