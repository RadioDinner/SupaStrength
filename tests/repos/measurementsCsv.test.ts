import { describe, expect, it } from 'vitest'
import { measurementsRepo } from '../../src/data/repos/measurementsRepo'

describe('measurementsRepo.parseCsv (M8 CSV import)', () => {
  it('parses a header + rows by field key', () => {
    const csv = ['date,bodyweight,waist,note', '2026-06-01,185.5,33,felt good', '2026-06-08,184,32.5,'].join('\n')
    const rows = measurementsRepo.parseCsv(csv)
    expect(rows).toHaveLength(2)
    expect(rows[0]).toEqual({
      takenOn: '2026-06-01',
      values: { bodyweight: 185.5, waist: 33, note: 'felt good' },
    })
    // empty note cell is omitted (not set to '')
    expect(rows[1]?.values).toEqual({ bodyweight: 184, waist: 32.5 })
  })

  it('maps human labels and "taken_on" header alias', () => {
    const csv = ['taken_on,Body fat,Arm (R)', '2026-06-01,14.2,15.5'].join('\n')
    const rows = measurementsRepo.parseCsv(csv)
    expect(rows[0]?.values).toEqual({ body_fat_pct: 14.2, arm_r: 15.5 })
  })

  it('ignores unknown columns and non-numeric cells', () => {
    const csv = ['date,bodyweight,mood', '2026-06-01,185,happy'].join('\n')
    const rows = measurementsRepo.parseCsv(csv)
    expect(rows[0]?.values).toEqual({ bodyweight: 185 })
  })

  it('handles quoted cells containing commas', () => {
    const csv = ['date,note', '2026-06-01,"big day, new PR"'].join('\n')
    const rows = measurementsRepo.parseCsv(csv)
    expect(rows[0]?.values.note).toBe('big day, new PR')
  })

  it('skips rows with a blank date', () => {
    const csv = ['date,bodyweight', ',180', '2026-06-01,185'].join('\n')
    const rows = measurementsRepo.parseCsv(csv)
    expect(rows).toHaveLength(1)
    expect(rows[0]?.takenOn).toBe('2026-06-01')
  })

  it('throws when there is no date column', () => {
    expect(() => measurementsRepo.parseCsv('bodyweight,waist\n185,33')).toThrow(/date/i)
  })

  it('returns [] for an empty / header-only CSV', () => {
    expect(measurementsRepo.parseCsv('')).toEqual([])
    expect(measurementsRepo.parseCsv('date,bodyweight')).toEqual([])
  })
})
