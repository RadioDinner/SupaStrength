/**
 * A compact post-workout / dashboard nudge listing the reminders that are due.
 * Lives in its own module (not ProgressPage) so the eager Home screen can show
 * nudges without pulling the whole Progress screen — including PhotosSection —
 * into the initial bundle. ProgressPage itself stays route-split/lazy.
 */
import { Bell } from 'lucide-react'
import { Button, Card } from '../../components/ui'
import { REMINDER_META } from './reminderMeta'
import { useDueReminders, useReminderActions } from './useProgress'

export function DueNudges() {
  const { data: reminders } = useDueReminders()
  const { markDone, snooze } = useReminderActions()
  const due = (reminders ?? []).filter((r) => r.is_due && r.enabled)
  if (due.length === 0) return null
  const snoozeUntil = new Date(Date.now() + 1000 * 60 * 60 * 24 * 3).toISOString()
  return (
    <Card title="Time for a check-in">
      <ul className="list">
        {due.map((r) => {
          const meta = REMINDER_META[r.type] ?? { label: r.type, Icon: Bell }
          return (
            <li key={r.id} className="reminder">
              <span className="reminder__icon" aria-hidden="true">
                <meta.Icon size={20} aria-hidden />
              </span>
              <div className="reminder__body">
                <span className="reminder__name">{meta.label} is due</span>
                <span className="reminder__sub muted">It’s been {r.cadence_days}+ days.</span>
              </div>
              <div className="reminder__actions">
                <Button variant="ghost" onClick={() => markDone.mutate(r.id)}>
                  Did it
                </Button>
                <Button variant="ghost" onClick={() => snooze.mutate({ id: r.id, until: snoozeUntil })}>
                  Snooze
                </Button>
              </div>
            </li>
          )
        })}
      </ul>
    </Card>
  )
}
