/**
 * End-of-session payoff summary (pure — unit tested). Computes what the
 * completion sheet celebrates: sets logged, session tonnage, duration, the best
 * set + Epley e1RM per exercise, an all-time-record flag, and the engine's
 * "next time" weight merged in from the progression commit.
 */
import type { ProgressionOutcome } from '../../data/repos/sessionCommit'

/** One set as the session screen resolved it (local overlays win over DB rows). */
export interface SummarySet {
  done: boolean
  weightLb: number | null
  reps: number | null
}

export interface SummaryEntryInput {
  exerciseId: string
  sets: SummarySet[]
}

export interface ExerciseSummary {
  exerciseId: string
  setsDone: number
  setsTotal: number
  /** The completed set with the best e1RM (ties → heavier weight). */
  topWeightLb: number | null
  topReps: number | null
  bestE1rmLb: number | null
  /** Prescribed working weight for the next session (null: no progression line). */
  nextLb: number | null
  /** nextLb − the pre-session weight line: the engine's progression direction. */
  deltaLb: number | null
  /** Best e1RM today ties-or-beats the all-time best (fetched post-completion). */
  isRecord: boolean
}

export interface SessionSummary {
  setsDone: number
  setsTotal: number
  tonnageLb: number
  durationMin: number | null
  exercises: ExerciseSummary[]
}

export interface SummarizeInput {
  entries: SummaryEntryInput[]
  outcomes: ProgressionOutcome[]
  /**
   * All-time best e1RM per exercise, read AFTER completion — it already includes
   * this session, so today matching it means today set (or tied) the record.
   */
  bestE1rmByExercise: Record<string, number>
  startedAt: string | null
  endedAtMs: number
}

/**
 * Epley estimated 1RM — matches `v_set_log_metrics` (`weight * (1 + reps/30)`,
 * no special-casing of reps=1) so record checks compare like against like.
 */
export function epleyE1rm(weightLb: number, reps: number): number {
  return weightLb * (1 + reps / 30)
}

/** Float slack when comparing a JS-computed e1RM against the DB's numeric one. */
const E1RM_EPSILON_LB = 0.01

export function summarizeSession(input: SummarizeInput): SessionSummary {
  const { entries, outcomes, bestE1rmByExercise, startedAt, endedAtMs } = input
  const outcomeByExercise = new Map(outcomes.map((o) => [o.exerciseId, o]))

  // Group by exercise (an exercise can appear in more than one entry).
  const byExercise = new Map<string, SummarySet[]>()
  const order: string[] = []
  for (const e of entries) {
    if (!byExercise.has(e.exerciseId)) order.push(e.exerciseId)
    byExercise.set(e.exerciseId, [...(byExercise.get(e.exerciseId) ?? []), ...e.sets])
  }

  let setsDone = 0
  let setsTotal = 0
  let tonnageLb = 0
  const exercises: ExerciseSummary[] = []

  for (const exerciseId of order) {
    const sets = byExercise.get(exerciseId) ?? []
    let done = 0
    let topWeightLb: number | null = null
    let topReps: number | null = null
    let bestE1rmLb: number | null = null

    for (const s of sets) {
      if (!s.done) continue
      done += 1
      if (s.weightLb != null && s.weightLb > 0 && s.reps != null) {
        tonnageLb += s.weightLb * s.reps
        const e1rm = epleyE1rm(s.weightLb, s.reps)
        const better =
          bestE1rmLb == null ||
          e1rm > bestE1rmLb + E1RM_EPSILON_LB ||
          (Math.abs(e1rm - bestE1rmLb) <= E1RM_EPSILON_LB && s.weightLb > (topWeightLb ?? 0))
        if (better) {
          bestE1rmLb = e1rm
          topWeightLb = s.weightLb
          topReps = s.reps
        }
      }
    }

    setsDone += done
    setsTotal += sets.length

    const outcome = outcomeByExercise.get(exerciseId)
    const nextLb = outcome?.nextLb ?? null
    const fromLb = outcome?.fromLb ?? null
    const allTime = bestE1rmByExercise[exerciseId]
    exercises.push({
      exerciseId,
      setsDone: done,
      setsTotal: sets.length,
      topWeightLb,
      topReps,
      bestE1rmLb,
      nextLb,
      deltaLb: nextLb != null && fromLb != null ? nextLb - fromLb : null,
      isRecord:
        done > 0 && bestE1rmLb != null && allTime != null && bestE1rmLb >= allTime - E1RM_EPSILON_LB,
    })
  }

  return {
    setsDone,
    setsTotal,
    tonnageLb,
    durationMin: durationMinutes(startedAt, endedAtMs),
    exercises,
  }
}

/** Whole minutes from `startedAt` to `endedAtMs`; ≥1 when computable, else null. */
function durationMinutes(startedAt: string | null, endedAtMs: number): number | null {
  if (!startedAt) return null
  const startMs = Date.parse(startedAt)
  if (Number.isNaN(startMs) || endedAtMs < startMs) return null
  return Math.max(1, Math.round((endedAtMs - startMs) / 60_000))
}
