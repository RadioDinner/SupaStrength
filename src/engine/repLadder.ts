/**
 * Rep-ladder overload (migration 9993) — per-entry, per-set progression that
 * bypasses the shared weight line. The canonical example (dumbbell lateral
 * raise): sets sit at 15 lb × 9/8/5; every workout, each set that hits its
 * target climbs one rep (a failed set holds); when EVERY set sits at the rep
 * cap (10) and all hit it, the weight steps up (+5 lb) and every set's target
 * resets to the post-increment floor (7) — because +5 lb per hand at 10 reps
 * is too big a tonnage jump to keep the reps.
 *
 * Pure and stateless like the rest of engine/: callers load the targets,
 * apply this, and persist what comes back.
 */

export interface LadderSet {
  setIndex: number
  targetReps: number
  targetWeight: number | null
}

export interface LadderConfig {
  /** Reps every set must reach before the weight steps up. */
  repCap: number
  /** Weight added on increment (per dumbbell/bar — whatever unit is logged). */
  incrementLb: number
  /** Every set's rep target after an increment. */
  repsAfterIncrement: number
}

export interface LadderSetResult {
  setIndex: number
  achievedReps: number | null
  completed: boolean
}

/** A set succeeded when it was logged complete at (or above) its target. */
function succeeded(set: LadderSet, results: LadderSetResult[]): boolean {
  const r = results.find((x) => x.setIndex === set.setIndex)
  return !!r && r.completed && (r.achievedReps ?? 0) >= set.targetReps
}

export function advanceRepLadder(
  sets: LadderSet[],
  config: LadderConfig,
  results: LadderSetResult[],
): LadderSet[] {
  if (sets.length === 0) return []

  const allAtCap = sets.every((s) => s.targetReps >= config.repCap)
  const allSucceeded = sets.every((s) => succeeded(s, results))

  if (allAtCap && allSucceeded) {
    // The ladder is topped out and conquered: step the weight, drop the reps.
    return sets.map((s) => ({
      ...s,
      targetReps: config.repsAfterIncrement,
      targetWeight: s.targetWeight != null ? s.targetWeight + config.incrementLb : null,
    }))
  }

  // Climb: each set that hit its target gains a rep (up to the cap);
  // failed or unlogged sets hold where they are.
  return sets.map((s) =>
    succeeded(s, results) && s.targetReps < config.repCap
      ? { ...s, targetReps: s.targetReps + 1 }
      : { ...s },
  )
}
