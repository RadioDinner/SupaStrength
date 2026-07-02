import { describe, expect, it } from 'vitest'
import {
  advanceRepLadder,
  type LadderConfig,
  type LadderSet,
  type LadderSetResult,
} from '../../src/engine/repLadder'

const CONFIG: LadderConfig = { repCap: 10, incrementLb: 5, repsAfterIncrement: 7 }

const lateralRaise: LadderSet[] = [
  { setIndex: 1, targetReps: 9, targetWeight: 15 },
  { setIndex: 2, targetReps: 8, targetWeight: 15 },
  { setIndex: 3, targetReps: 5, targetWeight: 15 },
]

const hit = (sets: LadderSet[]): LadderSetResult[] =>
  sets.map((s) => ({ setIndex: s.setIndex, achievedReps: s.targetReps, completed: true }))

describe('advanceRepLadder', () => {
  it('adds a rep to every set that hit its target', () => {
    const next = advanceRepLadder(lateralRaise, CONFIG, hit(lateralRaise))
    expect(next.map((s) => s.targetReps)).toEqual([10, 9, 6])
    expect(next.map((s) => s.targetWeight)).toEqual([15, 15, 15])
  })

  it('holds a set that failed while the others climb', () => {
    const results: LadderSetResult[] = [
      { setIndex: 1, achievedReps: 9, completed: true },
      { setIndex: 2, achievedReps: 8, completed: true },
      { setIndex: 3, achievedReps: 4, completed: true }, // under target → hold
    ]
    const next = advanceRepLadder(lateralRaise, CONFIG, results)
    expect(next.map((s) => s.targetReps)).toEqual([10, 9, 5])
  })

  it('holds an unlogged (skipped) set', () => {
    const results = hit(lateralRaise).filter((r) => r.setIndex !== 2)
    const next = advanceRepLadder(lateralRaise, CONFIG, results)
    expect(next.map((s) => s.targetReps)).toEqual([10, 8, 6])
  })

  it('holds a set already at the cap while laggards climb', () => {
    const sets: LadderSet[] = [
      { setIndex: 1, targetReps: 10, targetWeight: 15 },
      { setIndex: 2, targetReps: 10, targetWeight: 15 },
      { setIndex: 3, targetReps: 8, targetWeight: 15 },
    ]
    const next = advanceRepLadder(sets, CONFIG, hit(sets))
    expect(next.map((s) => s.targetReps)).toEqual([10, 10, 9])
    expect(next.map((s) => s.targetWeight)).toEqual([15, 15, 15])
  })

  it('steps the weight and resets reps when every set conquers the cap', () => {
    const sets: LadderSet[] = [
      { setIndex: 1, targetReps: 10, targetWeight: 15 },
      { setIndex: 2, targetReps: 10, targetWeight: 15 },
      { setIndex: 3, targetReps: 10, targetWeight: 15 },
    ]
    const next = advanceRepLadder(sets, CONFIG, hit(sets))
    expect(next.map((s) => s.targetWeight)).toEqual([20, 20, 20])
    expect(next.map((s) => s.targetReps)).toEqual([7, 7, 7])
  })

  it('does NOT step the weight when all sets are at the cap but one fails', () => {
    const sets: LadderSet[] = [
      { setIndex: 1, targetReps: 10, targetWeight: 15 },
      { setIndex: 2, targetReps: 10, targetWeight: 15 },
      { setIndex: 3, targetReps: 10, targetWeight: 15 },
    ]
    const results: LadderSetResult[] = [
      { setIndex: 1, achievedReps: 10, completed: true },
      { setIndex: 2, achievedReps: 10, completed: true },
      { setIndex: 3, achievedReps: 9, completed: true }, // missed the cap
    ]
    const next = advanceRepLadder(sets, CONFIG, results)
    expect(next.map((s) => s.targetWeight)).toEqual([15, 15, 15])
    expect(next.map((s) => s.targetReps)).toEqual([10, 10, 10])
  })

  it('counts an over-achieved set (AMRAP-style extra reps) as a hit', () => {
    const results: LadderSetResult[] = [
      { setIndex: 1, achievedReps: 12, completed: true },
      { setIndex: 2, achievedReps: 8, completed: true },
      { setIndex: 3, achievedReps: 5, completed: true },
    ]
    const next = advanceRepLadder(lateralRaise, CONFIG, results)
    expect(next.map((s) => s.targetReps)).toEqual([10, 9, 6])
  })

  it('keeps a null weight null across an increment (bodyweight ladder)', () => {
    const sets: LadderSet[] = [
      { setIndex: 1, targetReps: 10, targetWeight: null },
      { setIndex: 2, targetReps: 10, targetWeight: null },
    ]
    const next = advanceRepLadder(sets, CONFIG, hit(sets))
    expect(next.map((s) => s.targetWeight)).toEqual([null, null])
    expect(next.map((s) => s.targetReps)).toEqual([7, 7])
  })

  it('handles an incomplete-but-marked set as a miss', () => {
    const results: LadderSetResult[] = [
      { setIndex: 1, achievedReps: 9, completed: false }, // un-checked in the app
      { setIndex: 2, achievedReps: 8, completed: true },
      { setIndex: 3, achievedReps: 5, completed: true },
    ]
    const next = advanceRepLadder(lateralRaise, CONFIG, results)
    expect(next.map((s) => s.targetReps)).toEqual([9, 9, 6])
  })

  it('returns [] for an entry with no target sets', () => {
    expect(advanceRepLadder([], CONFIG, [])).toEqual([])
  })
})
