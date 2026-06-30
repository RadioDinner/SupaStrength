import { describe, expect, it } from 'vitest'
import { applyFailure, type FailureResponse } from '../../src/engine/failure'
import { ctx, repSetState, weightState } from './support'

const repeat = (limit: number | null, position = 0): FailureResponse => ({
  position,
  type: 'repeat',
  repeatLimit: limit,
  amount: null,
})

describe('failure — repeat indefinitely (120×5×5)', () => {
  it('holds the weight and counts repeats, forever', () => {
    let w = weightState({ currentWeightLb: 120, targetLineWeightLb: 120 })
    const rs = repSetState()
    for (let i = 1; i <= 5; i++) {
      const out = applyFailure(w, rs, [repeat(null)], ctx())
      w = out.weight
      expect(w.currentWeightLb).toBe(120)
      expect(w.failureCounter).toBe(i)
    }
  })

  it('empty chain defaults to repeat-indefinitely', () => {
    const out = applyFailure(
      weightState({ currentWeightLb: 100, targetLineWeightLb: 100 }),
      repSetState(),
      [],
      ctx(),
    )
    expect(out.weight.failureCounter).toBe(1)
    expect(out.weight.currentWeightLb).toBe(100)
  })
})

describe('failure — repeat up to 3 then deload 10%', () => {
  const chain: FailureResponse[] = [
    repeat(3, 0),
    { position: 1, type: 'deload_pct', repeatLimit: null, amount: 10 },
  ]

  it('holds three times, then deloads and advances the cursor', () => {
    let w = weightState({ currentWeightLb: 200, targetLineWeightLb: 200 })
    const rs = repSetState()

    for (let i = 1; i <= 3; i++) {
      const out = applyFailure(w, rs, chain, ctx())
      w = out.weight
      expect(w.currentWeightLb).toBe(200)
      expect(w.failureCounter).toBe(i)
      expect(w.currentFailureResponseIndex).toBe(0)
    }

    // 4th failure: repeat exhausted → deload 10% (200 → 180, loadable). The
    // cursor advances PAST the applied deload (to index 2 = end here), so further
    // failures hold at the last response rather than deloading again.
    const out = applyFailure(w, rs, chain, ctx())
    expect(out.weight.currentWeightLb).toBe(180)
    expect(out.weight.targetLineWeightLb).toBe(180)
    expect(out.weight.currentFailureResponseIndex).toBe(2)
    expect(out.weight.failureCounter).toBe(0)
    expect(out.events.some((e) => e.action === 'deload')).toBe(true)

    // 5th failure: chain exhausted → hold at the last response (no 2nd deload).
    const held = applyFailure(out.weight, rs, chain, ctx())
    expect(held.weight.currentWeightLb).toBe(180)
    expect(held.weight.failureCounter).toBe(1)
  })
})

describe('failure — long chain [repeat3, deload%, repeat3, deload lb]', () => {
  const chain: FailureResponse[] = [
    repeat(3, 0),
    { position: 1, type: 'deload_pct', repeatLimit: null, amount: 10 },
    repeat(3, 2),
    { position: 3, type: 'deload_lb', repeatLimit: null, amount: 10 },
  ]

  it('walks both repeat budgets and both deloads', () => {
    let w = weightState({ currentWeightLb: 200, targetLineWeightLb: 200 })
    const rs = repSetState()
    const apply = () => {
      const out = applyFailure(w, rs, chain, ctx())
      w = out.weight
      return out
    }

    apply() // hold 1
    apply() // hold 2
    apply() // hold 3
    apply() // deload 10% → 180, cursor advances to repeat#2 at index 2
    expect(w.currentWeightLb).toBe(180)
    expect(w.currentFailureResponseIndex).toBe(2)

    apply() // hold 1 (cursor on repeat#2)
    apply() // hold 2
    apply() // hold 3
    expect(w.currentFailureResponseIndex).toBe(2)
    apply() // deload 10 lb → 170, cursor advances past the chain to index 4
    expect(w.currentWeightLb).toBe(170)
    expect(w.currentFailureResponseIndex).toBe(4)
  })
})

describe('failure — rep/set deloads', () => {
  it('deload_reps reduces the rep target', () => {
    const out = applyFailure(
      weightState(),
      repSetState({ currentRepTarget: 8 }),
      [{ position: 0, type: 'deload_reps', repeatLimit: null, amount: 2 }],
      ctx(),
    )
    expect(out.repset.currentRepTarget).toBe(6)
  })

  it('drop_set reduces the set count (defaults to 1)', () => {
    const out = applyFailure(
      weightState(),
      repSetState({ currentSetCount: 3 }),
      [{ position: 0, type: 'drop_set', repeatLimit: null, amount: null }],
      ctx(),
    )
    expect(out.repset.currentSetCount).toBe(2)
  })

  it('deload_lb reduces the weight and plate-rounds', () => {
    const out = applyFailure(
      weightState({ currentWeightLb: 200, targetLineWeightLb: 200 }),
      repSetState(),
      [{ position: 0, type: 'deload_lb', repeatLimit: null, amount: 20 }],
      ctx(),
    )
    expect(out.weight.currentWeightLb).toBe(180)
  })

  it('weight deloads are inert on an unloaded lift', () => {
    const out = applyFailure(
      weightState({ currentWeightLb: null, targetLineWeightLb: null }),
      repSetState(),
      [{ position: 0, type: 'deload_pct', repeatLimit: null, amount: 10 }],
      ctx(),
    )
    expect(out.weight.currentWeightLb).toBeNull()
  })
})
