/**
 * Reminders repository (BUILD_PLAN M8). Three cadenced nudges (weigh-in 7d /
 * measurements 14d / photos 28d). "Due" is NEVER stored — it's computed by the
 * `reminders_due` view (`last_done_at + cadence` vs now, honoring enabled +
 * snooze). DB triggers bump `last_done_at` when a measurement/photo lands; this
 * repo also exposes a manual bump + snooze + enable toggle.
 */
import { onlineDataClient } from '../online/supabaseDataClient'
import type { Reminder, ReminderDue, ReminderType } from '../types'

export const DEFAULT_REMINDERS: { type: ReminderType; cadence_days: number; label: string }[] = [
  { type: 'weigh_in', cadence_days: 7, label: 'Weigh-in' },
  { type: 'measurements', cadence_days: 14, label: 'Measurements' },
  { type: 'photos', cadence_days: 28, label: 'Progress photos' },
]

export const remindersRepo = {
  /** Create any missing default reminders (idempotent; never overwrites cadence). */
  async ensureDefaults(): Promise<void> {
    const existing = await onlineDataClient.list<Reminder>('reminders', {})
    const have = new Set(existing.map((r) => r.type))
    const missing = DEFAULT_REMINDERS.filter((d) => !have.has(d.type))
    if (missing.length === 0) return
    await onlineDataClient.insert<Reminder>(
      'reminders',
      missing.map((d) => ({ type: d.type, cadence_days: d.cadence_days })),
    )
  },

  listDue(): Promise<ReminderDue[]> {
    return onlineDataClient.list<ReminderDue>('reminders_due', {})
  },

  setEnabled(id: string, enabled: boolean): Promise<Reminder[]> {
    return onlineDataClient.update<Reminder>('reminders', { enabled }, [
      { column: 'id', op: 'eq', value: id },
    ])
  },

  /** Snooze until a timestamp (or clear with null). */
  snooze(id: string, until: string | null): Promise<Reminder[]> {
    return onlineDataClient.update<Reminder>('reminders', { snooze_until: until }, [
      { column: 'id', op: 'eq', value: id },
    ])
  },

  /** Manually mark done now (clears any snooze). */
  markDone(id: string): Promise<Reminder[]> {
    return onlineDataClient.update<Reminder>(
      'reminders',
      { last_done_at: new Date().toISOString(), snooze_until: null },
      [{ column: 'id', op: 'eq', value: id }],
    )
  },
}
