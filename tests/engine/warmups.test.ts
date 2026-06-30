import { describe, expect, it } from 'vitest'
import { generateWarmups } from '../../src/engine/warmups'
import { HOME_BARBELL_LB, HOME_GYM } from './support'

const base = {
  barbellLb: HOME_BARBELL_LB,
  inventory: HOME_GYM,
  microPlatesEnabled: false,
  roundingDirection: 'down' as const,
}

describe('generateWarmups', () => {
  it('default ramp = empty bar → 55/70/85%, plate-rounded, below working', () => {
    const sets = generateWarmups({ ...base, workingWeightLb: 185 })
    expect(sets).toHaveLength(4)
    expect(sets[0]).toEqual({ pct: 0, weightLb: 45 }) // empty bar
    expect(sets.every((s) => s.weightLb < 185)).toBe(true)
    expect(sets.map((s) => s.pct)).toEqual([0, 55, 70, 85])
  })

  it('respects a working_weight threshold (no warmups when at/below)', () => {
    const none = generateWarmups({
      ...base,
      workingWeightLb: 185,
      thresholdBasis: 'working_weight',
      thresholdValue: 200,
    })
    expect(none).toEqual([])

    const some = generateWarmups({
      ...base,
      workingWeightLb: 185,
      thresholdBasis: 'working_weight',
      thresholdValue: 100,
    })
    expect(some.length).toBeGreaterThan(0)
  })

  it('volume-basis threshold uses sets × reps × weight', () => {
    const none = generateWarmups({
      ...base,
      workingWeightLb: 185,
      thresholdBasis: 'volume',
      thresholdValue: 3000,
      prescribedSets: 3,
      prescribedReps: 5, // 185*15 = 2775 ≤ 3000
    })
    expect(none).toEqual([])

    const some = generateWarmups({
      ...base,
      workingWeightLb: 185,
      thresholdBasis: 'volume',
      thresholdValue: 2000,
      prescribedSets: 3,
      prescribedReps: 5, // 2775 > 2000
    })
    expect(some.length).toBeGreaterThan(0)
  })

  it('drops ramp rungs at/above 100% and handles a custom ramp', () => {
    const sets = generateWarmups({
      ...base,
      workingWeightLb: 135,
      rampPcts: [0, 50, 100, 120],
    })
    expect(sets.map((s) => s.pct)).toEqual([0, 50])
  })

  it('zero working weight → no warmups', () => {
    expect(generateWarmups({ ...base, workingWeightLb: 0 })).toEqual([])
  })

  it('never emits a rung at/above the working weight, nor duplicates (F1)', () => {
    // Working weight at/below the bar: every rung would collapse to the 45 bar.
    expect(generateWarmups({ ...base, workingWeightLb: 44 })).toEqual([])

    // Just above the bar: rungs collapse to 45 — keep one, drop the duplicates,
    // and only because 45 < 50.
    const low = generateWarmups({ ...base, workingWeightLb: 50 })
    expect(low.every((s) => s.weightLb < 50)).toBe(true)
    expect(new Set(low.map((s) => s.weightLb)).size).toBe(low.length) // no dups
  })
})
