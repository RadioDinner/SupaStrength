/**
 * Exact pound arithmetic (BUILD_PLAN architectural rule #4: "Money flows through
 * `numeric`, never `float`").
 *
 * All weights are represented internally as integer **centi-pounds** (cp), where
 * 1 lb = 100 cp. Every plate denomination the app cares about — 45, 35, 25, 15,
 * 10, 5, 2.5, and the 1.25 lb micro — is an exact integer number of cp
 * (4500, 3500, …, 250, 125), so plate sums never drift. Percentage-based
 * progression (`pct_of_last` / `pct_of_target`) rounds to the nearest cp
 * (0.01 lb) once, deterministically, before plate-aware rounding takes over.
 *
 * A `Weight` is a branded number so a raw `number` (assumed to be lbs) can't be
 * mixed in by accident. Construct with {@link fromLb}/{@link fromCp}, read back
 * with {@link toLb}.
 */

export type Weight = number & { readonly __brand: 'Weight_cp' }

export const CP_PER_LB = 100

/** Construct a Weight from pounds, rounding to the nearest centi-pound. */
export function fromLb(lb: number): Weight {
  return Math.round(lb * CP_PER_LB) as Weight
}

/** Construct a Weight from a raw centi-pound integer. */
export function fromCp(cp: number): Weight {
  return Math.round(cp) as Weight
}

/** Read a Weight back as pounds (may be fractional, e.g. 1.25). */
export function toLb(w: Weight): number {
  return w / CP_PER_LB
}

/** The raw centi-pound integer, for tight loops (plate solving). */
export function toCp(w: Weight): number {
  return w
}

export const ZERO = 0 as Weight

export function add(a: Weight, b: Weight): Weight {
  return (a + b) as Weight
}

export function sub(a: Weight, b: Weight): Weight {
  return (a - b) as Weight
}

/** Add a pound delta (e.g. +5, +1.25) to a Weight. */
export function addLb(w: Weight, deltaLb: number): Weight {
  return (w + Math.round(deltaLb * CP_PER_LB)) as Weight
}

/** Scale by a percentage (e.g. 55 → 55%), rounding to the nearest centi-pound. */
export function scaleByPct(w: Weight, pct: number): Weight {
  return Math.round((w * pct) / 100) as Weight
}

export type RoundDir = 'up' | 'down' | 'nearest'

/**
 * Round to the nearest multiple of `stepLb` pounds. Used for coarse granularity
 * (the real plate-aware rounding lives in `plates.ts`). Ties on `nearest` go up.
 */
export function roundToStepLb(w: Weight, stepLb: number, dir: RoundDir = 'nearest'): Weight {
  const step = Math.round(stepLb * CP_PER_LB)
  if (step <= 0) return w
  switch (dir) {
    case 'up':
      return (Math.ceil(w / step) * step) as Weight
    case 'down':
      return (Math.floor(w / step) * step) as Weight
    default: {
      // round half up
      return (Math.floor(w / step + 0.5) * step) as Weight
    }
  }
}

export const gt = (a: Weight, b: Weight): boolean => a > b
export const gte = (a: Weight, b: Weight): boolean => a >= b
export const lt = (a: Weight, b: Weight): boolean => a < b
export const lte = (a: Weight, b: Weight): boolean => a <= b
export const eq = (a: Weight, b: Weight): boolean => a === b
export const max = (a: Weight, b: Weight): Weight => (a >= b ? a : b)
export const min = (a: Weight, b: Weight): Weight => (a <= b ? a : b)

/** Format a Weight as a trimmed pound string ("182.5", "45", "186.25"). */
export function formatLb(w: Weight): string {
  const lb = toLb(w)
  return Number.isInteger(lb) ? String(lb) : String(Number(lb.toFixed(2)))
}
