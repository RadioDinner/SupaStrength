import { describe, expect, it } from 'vitest'
import { applyProgression, resolvePipeline } from '../../src/engine/pipeline'
import type { Pipeline } from '../../src/engine/types'
import { baseline, ctx, repSetState, step, weightState } from './support'

describe('resolvePipeline — most-specific scope wins (whole-object)', () => {
  const mk = (): Pipeline => ({ steps: [step({ dimension: 'weight', amount: 5, position: 0 })] })
  it('exercise beats workout beats routine', () => {
    const r = { scope: 'routine' as const, pipeline: mk() }
    const w = { scope: 'workout' as const, pipeline: mk() }
    const e = { scope: 'exercise' as const, pipeline: mk() }
    expect(resolvePipeline([r, w, e])).toBe(e.pipeline)
    expect(resolvePipeline([r, w])).toBe(w.pipeline)
    expect(resolvePipeline([r])).toBe(r.pipeline)
    expect(resolvePipeline([])).toBeNull()
  })
})

describe('StrongLifts linear — +5 every workout, never stops', () => {
  const pipe: Pipeline = { steps: [step({ dimension: 'weight', amount: 5 })] }
  it('climbs the shared weight line by 5 each completion', () => {
    let w = weightState({ currentWeightLb: 180, targetLineWeightLb: 180 })
    const rs = repSetState()
    for (const expected of [185, 190, 195, 200]) {
      const out = applyProgression(w, rs, pipe, baseline(), ctx())
      w = out.weight
      expect(w.currentWeightLb).toBe(expected)
      expect(w.stopped).toBe(false)
      expect(w.pipelineStepIndex).toBe(0)
    }
  })
})

describe('OHP +5 until 150 then stop [O-4]', () => {
  const pipe: Pipeline = {
    steps: [step({ dimension: 'weight', amount: 5, capType: 'target_weight', capValue: 150, onCap: 'stop' })],
  }
  it('reaches exactly 150 and parks', () => {
    let w = weightState({ currentWeightLb: 140, targetLineWeightLb: 140 })
    const rs = repSetState()
    let out = applyProgression(w, rs, pipe, baseline(), ctx())
    w = out.weight
    expect(w.currentWeightLb).toBe(145)
    expect(w.stopped).toBe(false)

    out = applyProgression(w, rs, pipe, baseline(), ctx())
    w = out.weight
    expect(w.currentWeightLb).toBe(150)
    expect(w.stopped).toBe(true)

    // Further completions do nothing — parked at the cap.
    out = applyProgression(w, out.repset, pipe, baseline(), ctx())
    expect(out.weight.currentWeightLb).toBe(150)
  })

  it('clamps an overshooting step to the cap', () => {
    const w = weightState({ currentWeightLb: 148, targetLineWeightLb: 148 })
    const out = applyProgression(w, repSetState(), pipe, baseline(), ctx())
    expect(out.weight.targetLineWeightLb).toBe(150)
    expect(out.weight.stopped).toBe(true)
  })
})

describe('Bench +5 every 2nd time', () => {
  const pipe: Pipeline = { steps: [step({ dimension: 'weight', amount: 5, everyN: 2 })] }
  it('applies the increment on every second qualifying completion', () => {
    let w = weightState({ currentWeightLb: 100, targetLineWeightLb: 100 })
    const rs = repSetState()
    const seq = [100, 105, 105, 110, 110, 115]
    for (const expected of seq) {
      const out = applyProgression(w, rs, pipe, baseline(), ctx())
      w = out.weight
      expect(w.currentWeightLb).toBe(expected)
    }
  })
})

describe('Double progression 3×8–12 [O-7]', () => {
  const pipe: Pipeline = {
    steps: [
      step({
        dimension: 'reps',
        appliesTo: 'all_sets',
        amount: 1,
        capType: 'rep_count',
        capValue: 12,
        onCap: 'next_step',
        position: 0,
      }),
      step({
        dimension: 'weight',
        amount: 5,
        onCap: 'loop',
        loopTargetPosition: 0,
        reset: 'reps_to_base',
        position: 1,
      }),
    ],
  }
  const base = baseline({ baseRepTarget: 8, repRangeLow: 8, repRangeHigh: 12 })

  it('ramps reps 8→12, then bumps weight +5 and resets reps to 8', () => {
    let w = weightState({ currentWeightLb: 135, targetLineWeightLb: 135 })
    let rs = repSetState({ currentRepTarget: 8, currentRepRangeLow: 8, currentRepRangeHigh: 12 })

    // 4 completions ramp reps 8→9→10→11→12; the 12 caps and advances to step 1.
    for (const expected of [9, 10, 11, 12]) {
      const out = applyProgression(w, rs, pipe, base, ctx())
      w = out.weight
      rs = out.repset
      expect(rs.currentRepTarget).toBe(expected)
    }
    expect(rs.repsetPipelineStepIndex).toBe(1)
    expect(w.currentWeightLb).toBe(135) // weight unchanged while ramping reps

    // Next completion: weight +5, reps reset to base 8, loop back to step 0.
    const out = applyProgression(w, rs, pipe, base, ctx())
    expect(out.weight.currentWeightLb).toBe(140)
    expect(out.repset.currentRepTarget).toBe(8)
    expect(out.repset.repsetPipelineStepIndex).toBe(0)
    expect(out.weight.pipelineStepIndex).toBe(0)
  })
})

describe('Shoulders: +1 rep/set until 12, then add sets until 5 [Q-B]', () => {
  // Clean repeating ladder (SPEC §6 prose intent: 3×12 → 4×8, no dip). The
  // reps→base reset rides on the SETS step so it is atomic with the +1 set,
  // mirroring how double-progression resets reps on its weight step. (Putting the
  // reset on the reps step — §6's literal encoding — would instead prescribe a
  // one-session 3×8 dip before 4×8; see HANDOFF "Engine encoding notes".)
  const pipe: Pipeline = {
    steps: [
      step({
        dimension: 'reps',
        appliesTo: 'all_sets',
        amount: 1,
        capType: 'rep_count',
        capValue: 12,
        onCap: 'next_step',
        position: 0,
      }),
      step({
        dimension: 'sets',
        amount: 1,
        capType: 'set_count',
        capValue: 5,
        onCap: 'stop',
        reset: 'reps_to_base',
        position: 1,
      }),
    ],
  }
  const base = baseline({ baseRepTarget: 8, baseSets: 3 })

  it('rolls reps→sets and resets reps to base together with the +1 set', () => {
    let w = weightState({ currentWeightLb: 30, targetLineWeightLb: 30 })
    let rs = repSetState({ currentRepTarget: 8, currentSetCount: 3 })

    for (const expected of [9, 10, 11, 12]) {
      const out = applyProgression(w, rs, pipe, base, ctx())
      w = out.weight
      rs = out.repset
      expect(rs.currentRepTarget).toBe(expected)
    }
    // Reps capped at 12 → next_step (no reset on the reps step) → reps stay 12,
    // cursor at the sets step.
    expect(rs.currentRepTarget).toBe(12)
    expect(rs.repsetPipelineStepIndex).toBe(1)

    // Sets step: +1 set AND reset reps to base 8, atomically → next is 4×8.
    let out = applyProgression(w, rs, pipe, base, ctx())
    rs = out.repset
    expect(rs.currentSetCount).toBe(4)
    expect(rs.currentRepTarget).toBe(8)

    out = applyProgression(out.weight, rs, pipe, base, ctx())
    expect(out.repset.currentSetCount).toBe(5)
    expect(out.repset.stopped).toBe(true)
  })
})

describe('+1 rep to last set only', () => {
  const pipe: Pipeline = {
    steps: [step({ dimension: 'reps', appliesTo: 'last_set', amount: 1 })],
  }
  it('increments the rep target and tags the audit event as last set', () => {
    const rs = repSetState({ currentRepTarget: 8 })
    const out = applyProgression(weightState(), rs, pipe, baseline(), ctx())
    expect(out.repset.currentRepTarget).toBe(9)
    expect(out.events.some((e) => e.summary.includes('last set'))).toBe(true)
  })
})

describe('Gap-workout consolidation [§6]', () => {
  // Gappy inventory: +5 is not loadable, round-up forces +10.
  const inv = [
    { denominationLb: 45, quantity: 2 },
    { denominationLb: 25, quantity: 2 },
    { denominationLb: 10, quantity: 2 },
    { denominationLb: 5, quantity: 2 },
  ]
  const pipe: Pipeline = { steps: [step({ dimension: 'weight', amount: 5 })] }

  it('forced +10 over desired +5 sets the consolidation counter and ideal line', () => {
    const w = weightState({ currentWeightLb: 135, targetLineWeightLb: 135 })
    const c = ctx({
      inventory: inv,
      roundingDirection: 'up',
      consolidationEnabled: true,
      consolidationSessions: 2,
    })
    const out = applyProgression(w, repSetState(), pipe, baseline(), c)
    expect(out.weight.currentWeightLb).toBe(145) // forced +10
    expect(out.weight.targetLineWeightLb).toBe(140) // ideal line keeps +5
    expect(out.weight.consolidationCounter).toBe(2)
    expect(out.events.some((e) => e.action === 'gap_workout')).toBe(true)
  })

  it('does not fire when consolidation is disabled', () => {
    const w = weightState({ currentWeightLb: 135, targetLineWeightLb: 135 })
    const c = ctx({ inventory: inv, roundingDirection: 'up', consolidationEnabled: false })
    const out = applyProgression(w, repSetState(), pipe, baseline(), c)
    expect(out.weight.consolidationCounter).toBe(0)
  })
})

describe('Equipment ceiling [§7]', () => {
  const pipe: Pipeline = { steps: [step({ dimension: 'weight', amount: 5 })] }

  it('hold_warn freezes the weight at the ceiling', () => {
    const w = weightState({ currentWeightLb: 320, targetLineWeightLb: 320 })
    const out = applyProgression(w, repSetState(), pipe, baseline(), ctx({ ceilingBehavior: 'hold_warn' }))
    expect(out.weight.weightFrozen).toBe(true)
    expect(out.weight.currentWeightLb).toBe(320) // held
    expect(out.weight.progressionMode).toBe('weight')
    expect(out.events.some((e) => e.action === 'cap_reached')).toBe(true)
  })

  it('auto_switch_reps flips into reps fallback', () => {
    const w = weightState({ currentWeightLb: 320, targetLineWeightLb: 320 })
    const out = applyProgression(
      w,
      repSetState(),
      pipe,
      baseline(),
      ctx({ ceilingBehavior: 'auto_switch_reps' }),
    )
    expect(out.weight.weightFrozen).toBe(true)
    expect(out.weight.progressionMode).toBe('reps_fallback')
  })
})

describe('percentage weight modes', () => {
  it('pct_of_last adds a % of the current weight', () => {
    const pipe: Pipeline = {
      steps: [step({ dimension: 'weight', weightMode: 'pct_of_last', amount: 10 })],
    }
    const w = weightState({ currentWeightLb: 100, targetLineWeightLb: 100 })
    const out = applyProgression(w, repSetState(), pipe, baseline(), ctx())
    expect(out.weight.targetLineWeightLb).toBe(110) // +10% of 100
  })

  it('pct_of_target adds a constant absolute jump (% of the target cap)', () => {
    const pipe: Pipeline = {
      steps: [
        step({
          dimension: 'weight',
          weightMode: 'pct_of_target',
          amount: 2.5,
          capType: 'target_weight',
          capValue: 200,
        }),
      ],
    }
    const w = weightState({ currentWeightLb: 100, targetLineWeightLb: 100 })
    const out = applyProgression(w, repSetState(), pipe, baseline(), ctx())
    expect(out.weight.targetLineWeightLb).toBe(105) // 2.5% of 200 = 5
  })
})

describe('transition edge cases', () => {
  it('next_step with no following step parks the pipeline', () => {
    const pipe: Pipeline = {
      steps: [
        step({ dimension: 'reps', appliesTo: 'all_sets', amount: 1, capType: 'rep_count', capValue: 6, onCap: 'next_step' }),
      ],
    }
    const rs = repSetState({ currentRepTarget: 5 })
    const out = applyProgression(weightState(), rs, pipe, baseline(), ctx())
    expect(out.repset.currentRepTarget).toBe(6)
    expect(out.repset.stopped).toBe(true)
  })

  it('loop to an out-of-range target parks the pipeline', () => {
    const pipe: Pipeline = {
      steps: [
        step({
          dimension: 'weight',
          amount: 5,
          onCap: 'loop',
          loopTargetPosition: 9,
          reset: 'reps_to_base',
        }),
      ],
    }
    const w = weightState({ currentWeightLb: 100, targetLineWeightLb: 100 })
    const out = applyProgression(w, repSetState(), pipe, baseline(), ctx())
    expect(out.weight.stopped).toBe(true)
  })

  it('an already-parked pipeline is inert', () => {
    const pipe: Pipeline = { steps: [step({ dimension: 'weight', amount: 5 })] }
    const w = weightState({ currentWeightLb: 100, targetLineWeightLb: 100, stopped: true })
    const out = applyProgression(w, repSetState(), pipe, baseline(), ctx())
    expect(out.weight.currentWeightLb).toBe(100)
  })
})

describe('failure reset on success', () => {
  it('a successful completion clears the failure cursor + counter', () => {
    const pipe: Pipeline = { steps: [step({ dimension: 'weight', amount: 5 })] }
    const w = weightState({
      currentWeightLb: 135,
      targetLineWeightLb: 135,
      failureCounter: 2,
      currentFailureResponseIndex: 1,
    })
    const out = applyProgression(w, repSetState(), pipe, baseline(), ctx())
    expect(out.weight.failureCounter).toBe(0)
    expect(out.weight.currentFailureResponseIndex).toBe(0)
  })
})

describe('unloaded lifts', () => {
  it('weight steps are inert when there is no weight', () => {
    const pipe: Pipeline = { steps: [step({ dimension: 'weight', amount: 5 })] }
    const w = weightState({ currentWeightLb: null, targetLineWeightLb: null })
    const out = applyProgression(w, repSetState(), pipe, baseline(), ctx())
    expect(out.weight.currentWeightLb).toBeNull()
  })
})

describe('empty pipeline', () => {
  it('no steps → states unchanged', () => {
    const w = weightState({ currentWeightLb: 100, targetLineWeightLb: 100 })
    const out = applyProgression(w, repSetState(), { steps: [] }, baseline(), ctx())
    expect(out.weight.currentWeightLb).toBe(100)
  })
})
