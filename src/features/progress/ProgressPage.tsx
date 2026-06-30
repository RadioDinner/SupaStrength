/**
 * Body progress (BUILD_PLAN M8): measurements (one mutable row/day + CSV import),
 * progress photos (categorized, private, side-by-side compare), and the cadenced
 * reminders surfaced via the `reminders_due` view. Phase-1 exit feature.
 */
import { useMemo, useRef, useState, type FormEvent } from 'react'
import { Bell, Camera, Ruler, Scale, type LucideIcon } from 'lucide-react'
import { Banner, Button, Card, EmptyState, Field, SkeletonList, TextInput } from '../../components/ui'
import { useAuth } from '../../hooks/useAuth'
import { MEASUREMENT_FIELDS, type MeasurementValues } from '../../data/repos/measurementsRepo'
import {
  useDueReminders,
  useImportMeasurementsCsv,
  useRecentMeasurements,
  useReminderActions,
  useSaveMeasurement,
} from './useProgress'
import { PhotosSection } from './PhotosSection'
import type { BodyMeasurement, MeasurementField } from '../../data/types'

const todayIso = () => new Date().toISOString().slice(0, 10)

export function ProgressPage() {
  const { user } = useAuth()
  const [tab, setTab] = useState<'measure' | 'photos' | 'reminders'>('measure')

  return (
    <div className="page">
      <Card title="Progress" subtitle="Measurements, photos, and check-in reminders">
        <div className="seg" role="group" aria-label="Progress section">
          {([
            ['measure', 'Measurements'],
            ['photos', 'Photos'],
            ['reminders', 'Reminders'],
          ] as const).map(([k, label]) => (
            <button
              key={k}
              type="button"
              className={`seg__btn ${tab === k ? 'seg__btn--on' : ''}`}
              aria-pressed={tab === k}
              onClick={() => setTab(k)}
            >
              {label}
            </button>
          ))}
        </div>
      </Card>

      {tab === 'measure' ? <MeasurementsSection /> : null}
      {tab === 'photos' ? <PhotosSection userId={user!.id} /> : null}
      {tab === 'reminders' ? <RemindersSection /> : null}
    </div>
  )
}

// ── Measurements ──────────────────────────────────────────────────────────────
function MeasurementsSection() {
  const { data: rows, isLoading } = useRecentMeasurements()
  const save = useSaveMeasurement()
  const importCsv = useImportMeasurementsCsv()
  const [date, setDate] = useState(todayIso())
  const [form, setForm] = useState<Record<string, string>>({})
  const [note, setNote] = useState('')
  const [msg, setMsg] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const editing = useMemo(() => (rows ?? []).find((r) => r.taken_on === date), [rows, date])

  function loadRow(r: BodyMeasurement) {
    setDate(r.taken_on)
    const f: Record<string, string> = {}
    for (const { key } of MEASUREMENT_FIELDS) {
      const v = r[key as MeasurementField]
      if (v != null) f[key] = String(v)
    }
    setForm(f)
    setNote(r.note ?? '')
    setMsg(null)
  }

  function reset() {
    setForm({})
    setNote('')
    setDate(todayIso())
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setMsg(null)
    const values: MeasurementValues = { note: note || null }
    for (const { key } of MEASUREMENT_FIELDS) {
      const raw = form[key]
      if (raw != null && raw !== '') {
        const n = Number(raw)
        if (!Number.isNaN(n)) values[key as MeasurementField] = n
      } else {
        values[key as MeasurementField] = null
      }
    }
    try {
      await save.mutateAsync({ takenOn: date, values })
      setMsg(`Saved ${date}.`)
    } catch (err) {
      setMsg(err instanceof Error ? err.message : String(err))
    }
  }

  async function onCsv(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setMsg(null)
    try {
      const text = await file.text()
      const n = await importCsv.mutateAsync(text)
      setMsg(`Imported ${n} day${n === 1 ? '' : 's'}.`)
    } catch (err) {
      setMsg(err instanceof Error ? err.message : String(err))
    } finally {
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  return (
    <>
      <Card
        title={editing ? `Edit ${date}` : 'Log measurements'}
        subtitle="One entry per day — re-saving a date overwrites it"
        actions={
          editing ? (
            <Button variant="ghost" onClick={reset}>
              New day
            </Button>
          ) : undefined
        }
      >
        <form className="form" onSubmit={onSubmit}>
          <Field label="Date" htmlFor="m_date">
            <TextInput
              id="m_date"
              type="date"
              value={date}
              max={todayIso()}
              onChange={(e) => setDate(e.target.value)}
            />
          </Field>
          <div className="measuregrid">
            {MEASUREMENT_FIELDS.map((f) => (
              <Field key={f.key} label={`${f.label} (${f.unit})`} htmlFor={`m_${f.key}`}>
                <TextInput
                  id={`m_${f.key}`}
                  type="number"
                  inputMode="decimal"
                  step="0.1"
                  value={form[f.key] ?? ''}
                  onChange={(e) => setForm((s) => ({ ...s, [f.key]: e.target.value }))}
                />
              </Field>
            ))}
          </div>
          <Field label="Note" htmlFor="m_note">
            <TextInput id="m_note" value={note} onChange={(e) => setNote(e.target.value)} />
          </Field>
          {msg ? <Banner kind={msg.startsWith('Saved') || msg.startsWith('Imported') ? 'ok' : 'err'}>{msg}</Banner> : null}
          <div className="rowbtns">
            <Button type="submit" disabled={save.isPending}>
              {save.isPending ? 'Saving…' : editing ? 'Update day' : 'Save day'}
            </Button>
            <input ref={fileRef} type="file" accept=".csv,text/csv" hidden onChange={onCsv} id="csvimport" />
            <Button type="button" variant="ghost" onClick={() => fileRef.current?.click()} disabled={importCsv.isPending}>
              {importCsv.isPending ? 'Importing…' : 'Import CSV'}
            </Button>
          </div>
        </form>
      </Card>

      {isLoading ? (
        <SkeletonList rows={3} />
      ) : (rows ?? []).length === 0 ? (
        <EmptyState
          icon={<Ruler size={40} aria-hidden />}
          title="No measurements yet"
          hint="Log your bodyweight and a few girths above — or import a CSV with a date column."
        />
      ) : (
        <Card title="History" subtitle={`${rows!.length} day${rows!.length === 1 ? '' : 's'}`}>
          <div className="mtable">
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>BW</th>
                  <th>Waist</th>
                  <th>Arm R</th>
                  <th>Thigh R</th>
                  <th aria-label="Edit" />
                </tr>
              </thead>
              <tbody>
                {rows!.map((r) => (
                  <tr key={r.id} className={r.taken_on === date ? 'is-active' : ''}>
                    <td className="mono">{r.taken_on}</td>
                    <td className="mono">{r.bodyweight ?? '—'}</td>
                    <td className="mono">{r.waist ?? '—'}</td>
                    <td className="mono">{r.arm_r ?? '—'}</td>
                    <td className="mono">{r.thigh_r ?? '—'}</td>
                    <td>
                      <button type="button" className="linkbtn" onClick={() => loadRow(r)}>
                        Edit
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </>
  )
}

// ── Reminders ─────────────────────────────────────────────────────────────────
const REMINDER_META: Record<string, { label: string; Icon: LucideIcon }> = {
  weigh_in: { label: 'Weigh-in', Icon: Scale },
  measurements: { label: 'Measurements', Icon: Ruler },
  photos: { label: 'Progress photos', Icon: Camera },
}

function RemindersSection() {
  const { data: reminders, isLoading } = useDueReminders()
  const { markDone, snooze, setEnabled } = useReminderActions()

  if (isLoading) return <SkeletonList rows={3} />

  return (
    <Card title="Check-in reminders" subtitle="On-screen nudges — never a push notification">
      <ul className="list">
        {(reminders ?? []).map((r) => {
          const meta = REMINDER_META[r.type] ?? { label: r.type, Icon: Bell }
          const snoozeUntil = new Date(Date.now() + 1000 * 60 * 60 * 24 * 3).toISOString()
          return (
            <li key={r.id} className="reminder">
              <span className="reminder__icon" aria-hidden="true">
                <meta.Icon size={20} aria-hidden />
              </span>
              <div className="reminder__body">
                <span className="reminder__name">
                  {meta.label}
                  {r.is_due ? <span className="badge badge--due">Due</span> : null}
                  {!r.enabled ? <span className="badge">Off</span> : null}
                </span>
                <span className="reminder__sub muted">
                  Every {r.cadence_days} days ·{' '}
                  {r.last_done_at ? `last ${r.last_done_at.slice(0, 10)}` : 'never logged'}
                </span>
              </div>
              <div className="reminder__actions">
                <label className="switch" title="Enabled">
                  <input
                    type="checkbox"
                    checked={r.enabled}
                    onChange={(e) => setEnabled.mutate({ id: r.id, enabled: e.target.checked })}
                  />
                  <span className="switch__track" />
                </label>
                <Button variant="ghost" onClick={() => markDone.mutate(r.id)}>
                  Did it
                </Button>
                <Button variant="ghost" onClick={() => snooze.mutate({ id: r.id, until: snoozeUntil })}>
                  Snooze 3d
                </Button>
              </div>
            </li>
          )
        })}
      </ul>
    </Card>
  )
}

/** A compact post-workout / dashboard nudge listing the reminders that are due. */
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
                  Done
                </Button>
                <Button variant="ghost" onClick={() => snooze.mutate({ id: r.id, until: snoozeUntil })}>
                  Later
                </Button>
              </div>
            </li>
          )
        })}
      </ul>
    </Card>
  )
}
