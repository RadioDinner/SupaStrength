import { describe, expect, it } from 'vitest'
import { defaultPipeline } from '../../src/engine/presets'
import { applyProgression } from '../../src/engine/pipeline'
import { baseline, ctx, repSetState, weightState } from './support'

describe('defaultPipeline — derived from rep scheme', () => {
  it('straight → linear +5 weight, drives the shared line each session', () => {
    const pipe = defaultPipeline({ repScheme: 'straight', repRangeLow: null, repRangeHigh: null })
    expect(pipe.steps).toHaveLength(1)
    const w = weightState({ currentWeightLb: 135, targetLineWeightLb: 135 })
    const out = applyProgression(w, repSetState({ currentRepTarget: 5 }), pipe, baseline(), ctx())
    expect(out.weight.currentWeightLb).toBe(140)
  })

  it('double → reps ramp to high, then +5 and reset', () => {
    const pipe = defaultPipeline({ repScheme: 'double', repRangeLow: 8, repRangeHigh: 10 })
    expect(pipe.steps).toHaveLength(2)
    let w = weightState({ currentWeightLb: 135, targetLineWeightLb: 135 })
    let rs = repSetState({ currentRepTarget: 8, currentRepRangeLow: 8, currentRepRangeHigh: 10 })
    const base = baseline({ baseRepTarget: 8, repRangeLow: 8, repRangeHigh: 10 })
    // 8→9→10 caps reps; next completion bumps weight + resets reps to 8.
    for (const expected of [9, 10]) {
      const out = applyProgression(w, rs, pipe, base, ctx())
      w = out.weight
      rs = out.repset
      expect(rs.currentRepTarget).toBe(expected)
    }
    const out = applyProgression(w, rs, pipe, base, ctx())
    expect(out.weight.currentWeightLb).toBe(140)
    expect(out.repset.currentRepTarget).toBe(8)
  })

  it('rpe → empty pipeline (no auto progression)', () => {
    const pipe = defaultPipeline({ repScheme: 'rpe', repRangeLow: null, repRangeHigh: null })
    expect(pipe.steps).toHaveLength(0)
    const w = weightState({ currentWeightLb: 135, targetLineWeightLb: 135 })
    const out = applyProgression(w, repSetState(), pipe, baseline(), ctx())
    expect(out.weight.currentWeightLb).toBe(135)
  })
})
