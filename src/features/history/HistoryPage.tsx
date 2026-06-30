/**
 * Workout history. Lists completed sessions (newest first); expand one to see the
 * logged working sets per exercise. Reuses the session repos — read-only, so no
 * new data layer. Closes the "no way to review past workouts" gap.
 */
import { useMemo, useState } from 'react'
import { format, parseISO } from 'date-fns'
import { ChevronDown, ChevronRight, NotebookText } from 'lucide-react'
import { Card, EmptyState, Skeleton, SkeletonList } from '../../components/ui'
import { useRecentSessions, useSessionEntries, useSetLogs } from '../session/useSession'
import { useExercisesByIds } from '../workouts/useWorkouts'
import type { Session, SetLog } from '../../data/types'

function prettyDate(d: string): string {
  try {
    return format(parseISO(d), 'EEE, MMM d')
  } catch {
    return d
  }
}

export function HistoryPage() {
  const { data: sessions, isLoading } = useRecentSessions(30)

  return (
    <div className="page">
      <Card title="History" subtitle="Your completed sessions" />
      {isLoading ? (
        <SkeletonList rows={4} />
      ) : !sessions || sessions.length === 0 ? (
        <EmptyState
          icon={<NotebookText size={40} aria-hidden />}
          title="No sessions yet"
          hint="Finish a workout and it lands here — every set you logged, kept for good."
        />
      ) : (
        <Card>
          <ul className="history">
            {sessions.map((s) => (
              <HistoryRow key={s.id} session={s} />
            ))}
          </ul>
        </Card>
      )}
    </div>
  )
}

function HistoryRow({ session }: { session: Session }) {
  const [open, setOpen] = useState(false)
  return (
    <li className="historyrow">
      <button
        type="button"
        className="historyrow__head"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        <span className="historyrow__date">{prettyDate(session.performed_on)}</span>
        <span className="historyrow__chev" aria-hidden="true">
          {open ? <ChevronDown size={18} aria-hidden /> : <ChevronRight size={18} aria-hidden />}
        </span>
      </button>
      {open ? <SessionDetail sessionId={session.id} /> : null}
    </li>
  )
}

function SessionDetail({ sessionId }: { sessionId: string }) {
  const { data: entries, isLoading: entriesLoading } = useSessionEntries(sessionId)
  const entryIds = useMemo(() => (entries ?? []).map((e) => e.id), [entries])
  const { data: logs, isLoading: logsLoading } = useSetLogs(sessionId, entryIds)
  const exerciseIds = useMemo(() => (entries ?? []).map((e) => e.exercise_id), [entries])
  const { data: exercises } = useExercisesByIds(exerciseIds)

  const nameById = useMemo(
    () => new Map((exercises ?? []).map((e) => [e.id, e.name])),
    [exercises],
  )
  const logsByEntry = useMemo(() => {
    const m = new Map<string, SetLog[]>()
    for (const l of logs ?? []) {
      const a = m.get(l.session_entry_id) ?? []
      a.push(l)
      m.set(l.session_entry_id, a)
    }
    return m
  }, [logs])

  if (entriesLoading || logsLoading) {
    return (
      <div className="historyrow__detail">
        <Skeleton w="70%" h={14} />
      </div>
    )
  }

  return (
    <div className="historyrow__detail">
      {(entries ?? []).map((e) => {
        const working = (logsByEntry.get(e.id) ?? [])
          .filter((l) => !l.is_warmup)
          .sort((a, b) => a.set_index - b.set_index)
        const done = working.filter((l) => l.is_completed)
        return (
          <div key={e.id} className="histex">
            <span className="histex__name">{nameById.get(e.exercise_id) ?? '…'}</span>
            {done.length === 0 ? (
              <span className="muted">no sets logged</span>
            ) : (
              <span className="histex__sets">
                {done.map((l) => (
                  <span key={l.id} className="histset mono">
                    {l.actual_weight ?? '—'}
                    <span className="histset__x">×</span>
                    {l.actual_reps ?? '—'}
                  </span>
                ))}
              </span>
            )}
          </div>
        )
      })}
    </div>
  )
}
