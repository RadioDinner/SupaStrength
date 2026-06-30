/**
 * Prescribe-time helpers (read path) — SPEC §6 consolidation hold.
 *
 * The advance path (`pipeline.ts`) *sets* `consolidationCounter` when forced
 * rounding overshoots the desired increment. This is the matching read-path step
 * run at session build: while the counter is positive, the held weight is
 * re-prescribed and the counter decremented, softening the oversized jump across
 * the configured number of extra sessions.
 */
import type { WeightState } from './types'

export interface ConsolidationHold {
  /** True if this session re-prescribes a held (consolidation) weight. */
  held: boolean
  /** The weight to prescribe (lb) — the held current weight when on hold. */
  weightLb: number | null
  /** The weight state after consuming one hold (counter decremented). */
  weight: WeightState
}

/**
 * Consume one consolidation hold for a session build. Idempotent shape: when no
 * hold is pending it returns the state unchanged with `held = false`.
 */
export function consumeConsolidationHold(weight: WeightState): ConsolidationHold {
  if (weight.consolidationCounter <= 0) {
    return { held: false, weightLb: weight.currentWeightLb, weight }
  }
  return {
    held: true,
    weightLb: weight.currentWeightLb,
    weight: { ...weight, consolidationCounter: weight.consolidationCounter - 1 },
  }
}
