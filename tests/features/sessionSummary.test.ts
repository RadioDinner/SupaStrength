/**
 * Unit tests for the end-of-session payoff summary (`features/session/summary`).
 * Pure math — tonnage, best-set/e1RM selection, record flags, progression merge,
 * duration — with no DOM or network.
 */
import { describe, expect, it } from 'vitest'
import {
  epleyE1rm,
  summarizeSession,
  type SessionSummary,
  type SummarizeInput,
  type SummaryEntryInput,
} from '../../src/features/session/summary'

/** Indexed accessor that satisfies noUncheckedIndexedAccess. */
function ex(s: SessionSummary, i: number) {
  const x = s.exercises[i]
  if (!x) throw new Error(`no exercise summary at index ${i}`)
  return x
}

const T0 = '2026-07-01T17:00:00.000Z'
const t = (minutes: number) => Date.parse(T0) + minutes * 60_000

function input(entries: SummaryEntryInput[], overrides: Partial<SummarizeInput> = {}): SummarizeInput {
  return {
    entries,
    outcomes: [],
    bestE1rmByExercise: {},
    startedAt: T0,
    endedAtMs: t(45),
    ...overrides,
  }
}

const set = (weightLb: number | null, reps: number | null, done = true) => ({ done, weightLb, reps })

describe('epleyE1rm', () => {
  it('matches the v_set_log_metrics formula: w * (1 + r/30)', () => {
    expect(epleyE1rm(225, 5)).toBeCloseTo(262.5, 6)
    expect(epleyE1rm(315, 5)).toBeCloseTo(367.5, 6)
    // No reps=1 special case — the DB view has none either.
    expect(epleyE1rm(300, 1)).toBeCloseTo(310, 6)
  })
})

describe('summarizeSession', () => {
  it('counts sets, sums tonnage over completed sets only, and reports duration', () => {
    const s = summarizeSession(
      input([
        { exerciseId: 'squat', sets: [set(315, 5), set(315, 5), set(315, 4, false)] },
        { exerciseId: 'bench', sets: [set(225, 5)] },
      ]),
    )
    expect(s.setsDone).toBe(3)
    expect(s.setsTotal).toBe(4)
    expect(s.tonnageLb).toBe(315 * 5 + 315 * 5 + 225 * 5)
    expect(s.durationMin).toBe(45)
  })

  it('picks the best set by e1RM, not by raw weight', () => {
    // 225×5 → 262.5 beats 235×2 → 250.7
    const s = summarizeSession(
      input([{ exerciseId: 'bench', sets: [set(235, 2), set(225, 5)] }]),
    )
    const bench = ex(s, 0)
    expect(bench.topWeightLb).toBe(225)
    expect(bench.topReps).toBe(5)
    expect(bench.bestE1rmLb).toBeCloseTo(262.5, 6)
  })

  it('breaks e1RM ties toward the heavier weight', () => {
    // An exact e1RM tie: 180×10 → 240 and 200×6 → 240.
    const s = summarizeSession(
      input([{ exerciseId: 'row', sets: [set(180, 10), set(200, 6)] }]),
    )
    expect(ex(s, 0).topWeightLb).toBe(200)
    expect(ex(s, 0).topReps).toBe(6)
  })

  it('merges entries of the same exercise into one summary row', () => {
    const s = summarizeSession(
      input([
        { exerciseId: 'squat', sets: [set(315, 5)] },
        { exerciseId: 'squat', sets: [set(275, 8)] },
      ]),
    )
    expect(s.exercises).toHaveLength(1)
    expect(ex(s, 0).setsDone).toBe(2)
    expect(ex(s, 0).topWeightLb).toBe(315)
  })

  it('merges progression outcomes into next/delta', () => {
    const s = summarizeSession(
      input(
        [
          { exerciseId: 'squat', sets: [set(315, 5)] },
          { exerciseId: 'curl', sets: [set(60, 12)] },
        ],
        {
          outcomes: [
            { exerciseId: 'squat', fromLb: 315, nextLb: 320 },
            { exerciseId: 'press', fromLb: 95, nextLb: 95 }, // not in session order → ignored
          ],
        },
      ),
    )
    const squat = ex(s, 0)
    const curl = ex(s, 1)
    expect(squat.nextLb).toBe(320)
    expect(squat.deltaLb).toBe(5)
    expect(curl.nextLb).toBeNull()
    expect(curl.deltaLb).toBeNull()
  })

  it('reports a deload as a negative delta', () => {
    const s = summarizeSession(
      input([{ exerciseId: 'ohp', sets: [set(100, 3)] }], {
        outcomes: [{ exerciseId: 'ohp', fromLb: 100, nextLb: 90 }],
      }),
    )
    expect(ex(s, 0).deltaLb).toBe(-10)
  })

  it('computes the delta against the pre-session line, not what was lifted', () => {
    // Lifter overrode the input to 235 while the line sat at 225 → engine
    // progressed 225→230. That is a +5 progression, not a −5 deload.
    const s = summarizeSession(
      input([{ exerciseId: 'bench', sets: [set(235, 5)] }], {
        outcomes: [{ exerciseId: 'bench', fromLb: 225, nextLb: 230 }],
      }),
    )
    expect(ex(s, 0).nextLb).toBe(230)
    expect(ex(s, 0).deltaLb).toBe(5)
  })

  it('flags a record when today ties-or-beats the post-completion all-time best', () => {
    const s = summarizeSession(
      input(
        [
          { exerciseId: 'squat', sets: [set(315, 5)] }, // 367.5 — the new best
          { exerciseId: 'bench', sets: [set(225, 5)] }, // 262.5 < 280 historical
        ],
        { bestE1rmByExercise: { squat: 367.5, bench: 280 } },
      ),
    )
    expect(ex(s, 0).isRecord).toBe(true)
    expect(ex(s, 1).isRecord).toBe(false)
  })

  it('tolerates float drift between JS and DB e1RM values', () => {
    // 225 * (1 + 5/30) in JS floats vs the DB's exact 262.5.
    const s = summarizeSession(
      input([{ exerciseId: 'bench', sets: [set(225, 5)] }], {
        bestE1rmByExercise: { bench: 262.5 },
      }),
    )
    expect(ex(s, 0).isRecord).toBe(true)
  })

  it('never flags a record without a completed loaded set', () => {
    const s = summarizeSession(
      input(
        [
          { exerciseId: 'skipped', sets: [set(null, null, false)] },
          { exerciseId: 'bodyweight', sets: [set(null, 12)] },
        ],
        { bestE1rmByExercise: { skipped: 100, bodyweight: 100 } },
      ),
    )
    expect(ex(s, 0).isRecord).toBe(false)
    expect(ex(s, 0).setsDone).toBe(0)
    expect(ex(s, 1).isRecord).toBe(false)
    expect(ex(s, 1).setsDone).toBe(1)
    expect(ex(s, 1).topWeightLb).toBeNull()
  })

  it('keeps bodyweight sets out of tonnage but in the set counts', () => {
    const s = summarizeSession(input([{ exerciseId: 'pullup', sets: [set(null, 10), set(null, 8)] }]))
    expect(s.tonnageLb).toBe(0)
    expect(s.setsDone).toBe(2)
  })

  it('returns null duration without a start time and clamps to ≥1 minute', () => {
    const noStart = summarizeSession(input([], { startedAt: null }))
    expect(noStart.durationMin).toBeNull()

    const instant = summarizeSession(input([], { endedAtMs: t(0) + 5_000 }))
    expect(instant.durationMin).toBe(1)

    const clockSkew = summarizeSession(input([], { endedAtMs: t(-5) }))
    expect(clockSkew.durationMin).toBeNull()
  })

  it('preserves session order of exercises', () => {
    const s = summarizeSession(
      input([
        { exerciseId: 'b', sets: [set(100, 5)] },
        { exerciseId: 'a', sets: [set(100, 5)] },
      ]),
    )
    expect(s.exercises.map((x) => x.exerciseId)).toEqual(['b', 'a'])
  })
})
