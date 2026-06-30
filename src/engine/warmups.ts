/**
 * Warm-up generation (SPEC §4 "Warm-up sets", [O-8]).
 *
 * Auto-generate warmups only when the working load exceeds a configured
 * threshold. Default ramp = empty bar → ~55% → 70% → 85% of the working weight,
 * each plate-rounded to a loadable weight. Pure + I/O-free.
 */
import { solvePlates, type PlateStock } from './plates'
import type { RoundDir } from './weight'

export type WarmupBasis = 'working_weight' | 'volume'

export interface WarmupContext {
  workingWeightLb: number
  barbellLb: number
  inventory: PlateStock[]
  microPlatesEnabled: boolean
  roundingDirection: RoundDir
  /** Default {@link DEFAULT_RAMP_PCTS} when omitted/empty. */
  rampPcts?: number[]
  /** When omitted, warmups always generate. */
  thresholdBasis?: WarmupBasis
  thresholdValue?: number
  /** Required when thresholdBasis='volume': prescribed working sets × reps. */
  prescribedSets?: number
  prescribedReps?: number
}

export interface WarmupSet {
  /** Percentage of working weight (0 = empty bar). */
  pct: number
  /** Plate-rounded warmup weight (lb). */
  weightLb: number
}

export const DEFAULT_RAMP_PCTS = [0, 55, 70, 85] as const

/**
 * Returns the warmup ramp, or `[]` when the working load is at/below the
 * threshold (no warmups needed). The 100%+ rungs are dropped — warmups never
 * meet or exceed the working weight.
 */
export function generateWarmups(ctx: WarmupContext): WarmupSet[] {
  const working = ctx.workingWeightLb
  if (working <= 0) return []

  // Threshold gate.
  if (ctx.thresholdBasis && ctx.thresholdValue != null) {
    const operand =
      ctx.thresholdBasis === 'volume'
        ? working * (ctx.prescribedSets ?? 0) * (ctx.prescribedReps ?? 0)
        : working
    if (operand <= ctx.thresholdValue) return []
  }

  const ramp = ctx.rampPcts && ctx.rampPcts.length > 0 ? ctx.rampPcts : [...DEFAULT_RAMP_PCTS]

  const out: WarmupSet[] = []
  const seen = new Set<number>()
  for (const pct of ramp) {
    if (pct >= 100) continue
    let weightLb: number
    if (pct <= 0) {
      weightLb = ctx.barbellLb
    } else {
      const sol = solvePlates((working * pct) / 100, ctx.barbellLb, ctx.inventory, {
        rounding: ctx.roundingDirection,
        microPlatesEnabled: ctx.microPlatesEnabled,
      })
      weightLb = sol.loadedTotalLb
    }
    // A "warmup" must be genuinely lighter than the working weight (the percent
    // gate isn't enough — plate rounding / a heavy empty bar can land a low-%
    // rung at or above the work weight). Drop those and de-dup collapsed rungs.
    if (weightLb >= working) continue
    if (seen.has(weightLb)) continue
    seen.add(weightLb)
    out.push({ pct, weightLb })
  }
  return out
}
