/**
 * Workout history. Lists completed sessions (newest first); expand one to see the
 * logged working sets per exercise. Expanding also reveals Delete — a confirmed
 * hard-delete of the session and its logged sets (progression already applied
 * stays; see migration 9996).
 */
import { useMemo, useRef, useState } from 'react'
import { format, parseISO } from 'date-fns'
import { ChevronDown, ChevronRight, NotebookText, Trash2 } from 'lucide-react'
import { Button, Card, ConfirmDialog, EmptyState, Skeleton, SkeletonList } from '../../components/ui'
import {
  useDeleteSession,
  useRecentSessions,
  useSessionEntries,
  useSetLogs,
} from '../session/useSession'
import { useExercisesByIds } from '../workouts/useWorkouts'
import { useToast } from '../../hooks/useToast'
import type { Session, SetLog } from '../../data/types'

function prettyDate(d: string): string {
  try {
    return format(parseISO(d), 'EEE, MMM d')
  } catch {
    return d
  }
}

/**
 * Quiet tabular summary for a collapsed row. Per-set data (working sets, volume)
 * isn't loaded at the list level — it's fetched lazily on expand — so derive the
 * session's real duration from the started/completed timestamps already on the row
 * instead of fabricating set/volume figures or adding a per-row query.
 */
function durationLabel(s: Session): string | null {
  if (!s.started_at || !s.completed_at) return null
  const ms = parseISO(s.completed_at).getTime() - parseISO(s.started_at).getTime()
  if (!Number.isFinite(ms) || ms <= 0) return null
  const mins = Math.round(ms / 60000)
  const h = Math.floor(mins / 60)
  const m = mins % 60
  return h ? `${h}h ${m}m` : `${m} min`
}

export function HistoryPage() {
  const { data: sessions, isLoading } = useRecentSessions(30)
  const remove = useDeleteSession()
  const { toast } = useToast()
  const [deleting, setDeleting] = useState<Session | null>(null)
  // Post-delete focus target: the dialog restores focus to the row's Delete
  // button, but a successful delete unmounts that row — land on the page
  // instead so keyboard/SR users keep their place.
  const pageRef = useRef<HTMLDivElement>(null)

  return (
    <div className="page" ref={pageRef} tabIndex={-1}>
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
              <HistoryRow key={s.id} session={s} onDelete={setDeleting} />
            ))}
          </ul>
        </Card>
      )}

      {deleting ? (
        <ConfirmDialog
          title={`Delete the ${prettyDate(deleting.performed_on)} session?`}
          body="This permanently removes the session and every set it logged from your history and analytics. Progression it already applied stays."
          confirmLabel="Delete"
          danger
          pending={remove.isPending}
          onCancel={() => setDeleting(null)}
          onConfirm={() => {
            // Stay open while the delete is in flight — pending disables both
            // buttons ('…'), which is also what prevents a double confirm.
            remove.mutate(deleting.id, {
              onSuccess: () => {
                toast('Session deleted.', 'ok')
                pageRef.current?.focus()
              },
              onError: () => toast("Couldn't delete that session — try again.", 'err'),
              onSettled: () => setDeleting(null),
            })
          }}
        />
      ) : null}
    </div>
  )
}

function HistoryRow({
  session,
  onDelete,
}: {
  session: Session
  onDelete: (s: Session) => void
}) {
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
        {durationLabel(session) ? (
          <span className="rowstat">{durationLabel(session)}</span>
        ) : null}
        <span className="historyrow__chev" aria-hidden="true">
          {open ? <ChevronDown size={18} aria-hidden /> : <ChevronRight size={18} aria-hidden />}
        </span>
      </button>
      {open ? (
        <>
          <SessionDetail sessionId={session.id} />
          <div className="historyrow__foot">
            <Button
              variant="ghost"
              onClick={() => onDelete(session)}
              aria-label={`Delete the ${prettyDate(session.performed_on)} session`}
            >
              <Trash2 size={16} aria-hidden="true" /> Delete
            </Button>
          </div>
        </>
      ) : null}
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
