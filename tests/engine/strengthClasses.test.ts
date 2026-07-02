import { describe, expect, it } from 'vitest'
import {
  BAND_LABEL,
  CLASS_RATIOS,
  CLASS_SCORE,
  GROUP_KEYS,
  MAX_SCORE,
  MUSCLE_LIFT_WEIGHTS,
  STRENGTH_BANDS,
  STRENGTH_CLASSES,
  bandForScore,
  expectedE1rmLb,
  liftScore,
  muscleScores,
  overallScore,
} from '../../src/engine/strengthClasses'
import type { LiftKey, Sex } from '../../src/data/types'

const LIFTS: LiftKey[] = ['squat', 'bench', 'deadlift', 'ohp', 'row']
const SEXES: Sex[] = ['male', 'female']

describe('expectedE1rmLb', () => {
  it('reproduces the reference tables for a 200 lb male (5 lb rounding)', () => {
    // Spot checks straight off the user's screenshots.
    expect(expectedE1rmLb('squat', 'untrained', 200, 'male')).toBe(135)
    expect(expectedE1rmLb('squat', 'novice', 200, 'male')).toBe(205)
    expect(expectedE1rmLb('squat', 'intermediate', 200, 'male')).toBe(270)
    expect(expectedE1rmLb('squat', 'proficient', 200, 'male')).toBe(340)
    expect(expectedE1rmLb('squat', 'advanced', 200, 'male')).toBe(395)
    expect(expectedE1rmLb('squat', 'elite', 200, 'male')).toBe(510)
    expect(expectedE1rmLb('squat', 'world_class', 200, 'male')).toBe(565)

    expect(expectedE1rmLb('deadlift', 'proficient', 200, 'male')).toBe(390)
    expect(expectedE1rmLb('bench', 'advanced', 200, 'male')).toBe(295)
    expect(expectedE1rmLb('ohp', 'untrained', 200, 'male')).toBe(65)
    expect(expectedE1rmLb('row', 'elite', 200, 'male')).toBe(310)
    expect(expectedE1rmLb('bench', 'world_class', 200, 'male')).toBe(420)
  })

  it('scales linearly with bodyweight (ratio form)', () => {
    expect(expectedE1rmLb('bench', 'intermediate', 150, 'male')).toBe(150)
    expect(expectedE1rmLb('bench', 'intermediate', 250, 'male')).toBe(250)
  })

  it('every ladder is strictly increasing and female < male throughout', () => {
    for (const sex of SEXES) {
      for (const lift of LIFTS) {
        const r = CLASS_RATIOS[sex][lift]
        for (let i = 1; i < STRENGTH_CLASSES.length; i++) {
          expect(r[STRENGTH_CLASSES[i]]).toBeGreaterThan(r[STRENGTH_CLASSES[i - 1]])
        }
      }
    }
    for (const lift of LIFTS) {
      for (const c of STRENGTH_CLASSES) {
        expect(CLASS_RATIOS.female[lift][c]).toBeLessThan(CLASS_RATIOS.male[lift][c])
      }
    }
  })
})

describe('liftScore', () => {
  it('hits the class score exactly at each threshold', () => {
    for (const sex of SEXES) {
      for (const lift of LIFTS) {
        for (const c of STRENGTH_CLASSES) {
          const lb = CLASS_RATIOS[sex][lift][c] * 200
          expect(liftScore(lift, lb, 200, sex)).toBeCloseTo(CLASS_SCORE[c], 6)
        }
      }
    }
  })

  it('interpolates between thresholds', () => {
    // Halfway between untrained (135 → 30) and novice (205 → 45) squat @200 male.
    const mid = (135 + 205) / 2
    expect(liftScore('squat', mid, 200, 'male')).toBeCloseTo(37.5, 6)
    // Below untrained: linear from 0 lb → 0 up to untrained → 30.
    expect(liftScore('squat', 135 / 2, 200, 'male')).toBeCloseTo(15, 6)
  })

  it('extrapolates past world class but caps at MAX_SCORE', () => {
    const above = liftScore('squat', 600, 200, 'male')
    expect(above).toBeGreaterThan(125)
    expect(liftScore('squat', 5000, 200, 'male')).toBe(MAX_SCORE)
  })

  it('is 0 for zero/negative inputs', () => {
    expect(liftScore('squat', 0, 200, 'male')).toBe(0)
    expect(liftScore('squat', 100, 0, 'male')).toBe(0)
  })

  it('is monotonic in e1RM', () => {
    let prev = -1
    for (let lb = 0; lb <= 700; lb += 5) {
      const s = liftScore('deadlift', lb, 200, 'female')
      expect(s).toBeGreaterThanOrEqual(prev)
      prev = s
    }
  })
})

describe('bandForScore', () => {
  it('maps scores to bands with inclusive lower bounds', () => {
    expect(bandForScore(0)).toBe('subpar')
    expect(bandForScore(29.9)).toBe('subpar')
    expect(bandForScore(30)).toBe('untrained')
    expect(bandForScore(44.9)).toBe('untrained')
    expect(bandForScore(45)).toBe('novice')
    expect(bandForScore(60)).toBe('intermediate')
    expect(bandForScore(75)).toBe('proficient')
    expect(bandForScore(90)).toBe('advanced')
    expect(bandForScore(112.5)).toBe('elite')
    expect(bandForScore(125)).toBe('world_class')
    expect(bandForScore(MAX_SCORE)).toBe('world_class')
  })

  it('every band has a label', () => {
    for (const b of STRENGTH_BANDS) expect(BAND_LABEL[b]).toBeTruthy()
  })
})

describe('muscleScores', () => {
  it('covers all 12 groups; calves are never rankable', () => {
    expect(GROUP_KEYS).toHaveLength(12)
    const all = muscleScores({ squat: 60, bench: 60, deadlift: 60, ohp: 60, row: 60 })
    for (const g of GROUP_KEYS) {
      if (g === 'calves') expect(all[g]).toBeNull()
      else expect(all[g]).toBeCloseTo(60, 6)
    }
  })

  it('unlogged lifts leave their groups unranked', () => {
    const benchOnly = muscleScores({ bench: 80 })
    expect(benchOnly.chest).toBeCloseTo(80, 6)
    expect(benchOnly.shoulders).toBeCloseTo(80, 6) // bench is its only logged lift
    expect(benchOnly.triceps).toBeCloseTo(80, 6)
    expect(benchOnly.quads).toBeNull()
    expect(benchOnly.back).toBeNull()
    expect(benchOnly.biceps).toBeNull()
  })

  it('weights blend contributing lifts', () => {
    // glutes: deadlift 0.9, squat 0.8 → (90·0.9 + 45·0.8) / 1.7 = 68.82…
    const s = muscleScores({ deadlift: 90, squat: 45 })
    expect(s.glutes).toBeCloseTo((90 * 0.9 + 45 * 0.8) / 1.7, 6)
    // hamstrings lean deadlift: (90·1 + 45·0.3) / 1.3
    expect(s.hamstrings).toBeCloseTo((90 * 1 + 45 * 0.3) / 1.3, 6)
  })

  it('weight table only references the five main lifts', () => {
    for (const g of GROUP_KEYS) {
      for (const lift of Object.keys(MUSCLE_LIFT_WEIGHTS[g])) {
        expect(LIFTS).toContain(lift as LiftKey)
      }
    }
  })
})

describe('overallScore', () => {
  it('averages logged lifts and is null with none', () => {
    expect(overallScore({})).toBeNull()
    expect(overallScore({ squat: 30, bench: 60 })).toBeCloseTo(45, 6)
  })
})
