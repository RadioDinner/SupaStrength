/**
 * Body-measurements repository (BUILD_PLAN M8). One mutable row per day
 * (`unique (user_id, taken_on)`), typed girth columns + a jsonb `extra` tail,
 * plus a CSV importer. Logging a row trips the DB trigger that bumps the
 * weigh-in / measurements reminders.
 */
import { onlineDataClient } from '../online/supabaseDataClient'
import type { BodyMeasurement, MeasurementField } from '../types'

export const MEASUREMENT_FIELDS: { key: MeasurementField; label: string; unit: string }[] = [
  { key: 'bodyweight', label: 'Bodyweight', unit: 'lb' },
  { key: 'body_fat_pct', label: 'Body fat', unit: '%' },
  { key: 'neck', label: 'Neck', unit: 'in' },
  { key: 'shoulders', label: 'Shoulders', unit: 'in' },
  { key: 'chest', label: 'Chest', unit: 'in' },
  { key: 'waist', label: 'Waist', unit: 'in' },
  { key: 'hips', label: 'Hips', unit: 'in' },
  { key: 'arm_l', label: 'Arm (L)', unit: 'in' },
  { key: 'arm_r', label: 'Arm (R)', unit: 'in' },
  { key: 'thigh_l', label: 'Thigh (L)', unit: 'in' },
  { key: 'thigh_r', label: 'Thigh (R)', unit: 'in' },
  { key: 'calf_l', label: 'Calf (L)', unit: 'in' },
  { key: 'calf_r', label: 'Calf (R)', unit: 'in' },
  { key: 'forearm_l', label: 'Forearm (L)', unit: 'in' },
  { key: 'forearm_r', label: 'Forearm (R)', unit: 'in' },
]

const FIELD_KEYS = MEASUREMENT_FIELDS.map((f) => f.key)

export type MeasurementValues = Partial<Record<MeasurementField, number | null>> & {
  note?: string | null
}

export const measurementsRepo = {
  recent(limit = 60): Promise<BodyMeasurement[]> {
    return onlineDataClient.list<BodyMeasurement>('body_measurements', {
      order: [{ column: 'taken_on', ascending: false }],
      limit,
    })
  },

  getByDate(takenOn: string): Promise<BodyMeasurement | null> {
    return onlineDataClient.getOne<BodyMeasurement>('body_measurements', [
      { column: 'taken_on', op: 'eq', value: takenOn },
    ])
  },

  /** Insert-or-update the row for a day (one per day). user_id defaults to auth.uid(). */
  save(takenOn: string, values: MeasurementValues): Promise<BodyMeasurement[]> {
    const row: Record<string, unknown> = { taken_on: takenOn }
    for (const k of FIELD_KEYS) {
      if (k in values) row[k] = values[k] ?? null
    }
    if ('note' in values) row.note = values.note ?? null
    return onlineDataClient.upsert<BodyMeasurement>('body_measurements', row, 'user_id,taken_on')
  },

  /**
   * Import a CSV with a header row. Recognized headers: `date`/`taken_on` (required)
   * + any measurement field key or its label. Returns parsed rows for an
   * idempotent upsert; unknown columns are ignored. Throws on a missing date col.
   */
  parseCsv(text: string): { takenOn: string; values: MeasurementValues }[] {
    const lines = text.trim().split(/\r?\n/).filter((l) => l.trim())
    if (lines.length < 2) return []
    const headers = splitCsvLine(lines[0] ?? '').map((h) => normalizeHeader(h))
    const dateIdx = headers.findIndex((h) => h === 'taken_on')
    if (dateIdx === -1) throw new Error('CSV needs a "date" (or "taken_on") column.')

    const out: { takenOn: string; values: MeasurementValues }[] = []
    for (let i = 1; i < lines.length; i++) {
      const cells = splitCsvLine(lines[i] ?? '')
      const takenOn = (cells[dateIdx] ?? '').trim()
      if (!takenOn) continue
      const values: MeasurementValues = {}
      headers.forEach((h, idx) => {
        if (idx === dateIdx) return
        const raw = (cells[idx] ?? '').trim()
        if (h === 'note') {
          if (raw) values.note = raw
        } else if ((FIELD_KEYS as string[]).includes(h) && raw !== '') {
          const n = Number(raw)
          if (!Number.isNaN(n)) values[h as MeasurementField] = n
        }
      })
      out.push({ takenOn, values })
    }
    return out
  },

  async importCsv(text: string): Promise<number> {
    const rows = measurementsRepo.parseCsv(text)
    for (const r of rows) {
      await measurementsRepo.save(r.takenOn, r.values)
    }
    return rows.length
  },
}

/** Map a header label/key to a measurement field key (or 'taken_on'/'note'). */
function normalizeHeader(h: string): string {
  const s = h.trim().toLowerCase()
  if (s === 'date' || s === 'taken_on' || s === 'day') return 'taken_on'
  if (s === 'note' || s === 'notes') return 'note'
  const byLabel = MEASUREMENT_FIELDS.find(
    (f) => f.label.toLowerCase() === s || f.key === s.replace(/\s+/g, '_'),
  )
  return byLabel ? byLabel.key : s.replace(/\s+/g, '_')
}

/** Minimal CSV cell split (handles double-quoted cells with commas). */
function splitCsvLine(line: string): string[] {
  const out: string[] = []
  let cur = ''
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const c = line[i]
    if (inQuotes) {
      if (c === '"') {
        if (line[i + 1] === '"') {
          cur += '"'
          i++
        } else inQuotes = false
      } else cur += c
    } else if (c === '"') inQuotes = true
    else if (c === ',') {
      out.push(cur)
      cur = ''
    } else cur += c
  }
  out.push(cur)
  return out
}
