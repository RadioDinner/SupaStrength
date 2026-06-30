import { describe, expect, it } from 'vitest'
import { advanceRotations, nextGymDay, type Rotation } from '../../src/engine/schedule'
import { consumeConsolidationHold } from '../../src/engine/prescribe'
import { weightState } from './support'

describe('schedule — rotation pointers (SPEC §3)', () => {
  // Rotation 1 = [A, B] (cycles); Rotation 2 = [Shoulder Blowup] (always on).
  const initial = (): Rotation[] => [
    { id: 'r1', currentIndex: 0, workoutIds: ['A', 'B'] },
    { id: 'r2', currentIndex: 0, workoutIds: ['Shoulder'] },
  ]

  it('next gym day = head of every rotation; advancing wraps each', () => {
    let rots = initial()
    expect(nextGymDay(rots).map((d) => d.workoutId)).toEqual(['A', 'Shoulder'])

    rots = advanceRotations(rots)
    expect(nextGymDay(rots).map((d) => d.workoutId)).toEqual(['B', 'Shoulder'])

    rots = advanceRotations(rots)
    expect(nextGymDay(rots).map((d) => d.workoutId)).toEqual(['A', 'Shoulder'])

    expect(rots.find((r) => r.id === 'r2')!.currentIndex).toBe(0) // length-1 stays put
  })

  it('empty rotations contribute nothing and are left untouched', () => {
    const rots: Rotation[] = [{ id: 'empty', currentIndex: 0, workoutIds: [] }]
    expect(nextGymDay(rots)).toEqual([])
    expect(advanceRotations(rots)[0]!.currentIndex).toBe(0)
  })

  it('tolerates an out-of-range stored pointer', () => {
    const rots: Rotation[] = [{ id: 'r', currentIndex: 5, workoutIds: ['A', 'B'] }]
    expect(nextGymDay(rots)[0]!.workoutId).toBe('B') // 5 % 2 = 1
  })
})

describe('prescribe — consolidation hold consumption', () => {
  it('decrements the counter and re-prescribes the held weight', () => {
    let w = weightState({ currentWeightLb: 145, consolidationCounter: 2 })

    let hold = consumeConsolidationHold(w)
    expect(hold.held).toBe(true)
    expect(hold.weightLb).toBe(145)
    expect(hold.weight.consolidationCounter).toBe(1)
    w = hold.weight

    hold = consumeConsolidationHold(w)
    expect(hold.held).toBe(true)
    expect(hold.weight.consolidationCounter).toBe(0)
    w = hold.weight

    hold = consumeConsolidationHold(w)
    expect(hold.held).toBe(false)
    expect(hold.weight.consolidationCounter).toBe(0)
  })
})
