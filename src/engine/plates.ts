/**
 * Plate calculator (SPEC §6, features #2/#3) — a pure function over the active
 * location's equipment. No plate solution is ever stored.
 *
 * Rules encoded:
 * - Honors the bar weight + the location's plate inventory (individual
 *   quantities; a *pair* is `floor(quantity / 2)` since loading is symmetric).
 * - Symmetric per-side loading; a denomination can't be used more than the owned
 *   pair count.
 * - Micro-plates (denominations < 2.5 lb, i.e. the 1.25 lb plate) are only used
 *   when `microPlatesEnabled`.
 * - "Do the best you can": when the exact target isn't loadable, return the
 *   closest achievable total in the user's preferred rounding direction
 *   (up/down). Beyond the max loadable total, flag `ceilingReached`.
 *
 * Implementation: an exact bounded-subset-sum over per-side achievable sums
 * (denominations and pair counts are tiny — at most a handful), so we never rely
 * on greedy heuristics that can miss the closest combination for odd plate sets.
 */
import { fromLb, toLb, type Weight, type RoundDir } from './weight'

export interface PlateStock {
  /** Plate denomination in pounds (e.g. 45, 2.5, 1.25). */
  denominationLb: number
  /** Individual plate count owned (not pairs). */
  quantity: number
}

export interface PlateCount {
  denominationLb: number
  /** Plates of this denomination on ONE side of the bar. */
  count: number
}

export interface SolveOptions {
  rounding: RoundDir
  microPlatesEnabled: boolean
}

export interface PlateSolution {
  targetLb: number
  barbellLb: number
  /** Plates to put on each side (symmetric), largest first. */
  perSide: PlateCount[]
  /** The total actually loaded: bar + 2 × (sum of one side). */
  loadedTotalLb: number
  /** loadedTotal − target. Positive = over, negative = under, 0 = exact. */
  deltaLb: number
  exact: boolean
  /** Target exceeded the maximum loadable total for this equipment. */
  ceilingReached: boolean
}

const MICRO_THRESHOLD_LB = 2.5

/** Per-side achievable sums (in cp) → a representative plate combo (largest-first). */
interface Reachable {
  /** Sorted ascending list of achievable per-side sums in cp. */
  sums: number[]
  /** sum(cp) → plates-per-side combo that achieves it. */
  comboBySum: Map<number, PlateCount[]>
  /** Largest achievable per-side sum (cp). */
  maxSum: number
}

function usablePairs(inventory: PlateStock[], microPlatesEnabled: boolean): { denomCp: number; denomLb: number; pairs: number }[] {
  return inventory
    .filter((p) => p.denominationLb > 0)
    .filter((p) => microPlatesEnabled || p.denominationLb >= MICRO_THRESHOLD_LB)
    .map((p) => ({
      denomCp: Math.round(p.denominationLb * 100),
      denomLb: p.denominationLb,
      pairs: Math.floor(p.quantity / 2),
    }))
    .filter((p) => p.pairs > 0)
    // largest denomination first → natural, big-plate-first loading
    .sort((a, b) => b.denomCp - a.denomCp)
}

/**
 * Build every achievable per-side sum (bounded knapsack) with one representative
 * combo each. Denominations are processed largest-first and we keep the first
 * combo found per sum, which naturally prefers fewer/larger plates.
 */
function buildReachable(pairs: { denomCp: number; denomLb: number; pairs: number }[]): Reachable {
  const comboBySum = new Map<number, PlateCount[]>()
  comboBySum.set(0, [])
  let sums = [0]

  for (const { denomCp, denomLb, pairs: maxCount } of pairs) {
    const next = new Map(comboBySum)
    for (const base of sums) {
      const baseCombo = comboBySum.get(base)!
      for (let k = 1; k <= maxCount; k++) {
        const s = base + denomCp * k
        if (!next.has(s)) {
          next.set(s, [...baseCombo, { denominationLb: denomLb, count: k }])
        }
      }
    }
    for (const [s, combo] of next) comboBySum.set(s, combo)
    sums = [...comboBySum.keys()].sort((a, b) => a - b)
  }

  return { sums, comboBySum, maxSum: sums.length ? sums[sums.length - 1]! : 0 }
}

/** Largest achievable per-side sum ≤ target (or 0 if none). */
function floorSum(sums: number[], targetCp: number): number {
  let best = 0
  for (const s of sums) {
    if (s <= targetCp) best = s
    else break
  }
  return best
}

/** Smallest achievable per-side sum ≥ target, or null if target exceeds max. */
function ceilSum(sums: number[], targetCp: number): number | null {
  for (const s of sums) if (s >= targetCp) return s
  return null
}

/**
 * Solve plate loading for a target total weight.
 *
 * When the exact total isn't loadable, the closest achievable total in the
 * `rounding` direction is returned ('nearest' picks the closer of floor/ceil,
 * ties → up). If the target exceeds the max loadable, `ceilingReached` is true
 * and the max loadable solution is returned.
 */
export function solvePlates(
  targetLb: number,
  barbellLb: number,
  inventory: PlateStock[],
  opts: SolveOptions,
): PlateSolution {
  const barCp = Math.round(barbellLb * 100)
  const targetCp = Math.round(targetLb * 100)
  const perSideTargetCp = (targetCp - barCp) / 2

  const pairs = usablePairs(inventory, opts.microPlatesEnabled)
  const reachable = buildReachable(pairs)
  const { sums, maxSum } = reachable

  // Target at or below the empty bar → just the bar, nothing loaded.
  if (perSideTargetCp <= 0) {
    const loadedCp = barCp
    return {
      targetLb,
      barbellLb,
      perSide: [],
      loadedTotalLb: toLb(fromLb(loadedCp / 100)),
      deltaLb: round2((loadedCp - targetCp) / 100),
      exact: loadedCp === targetCp,
      ceilingReached: false,
    }
  }

  let chosenSum: number
  let ceilingReached = false

  if (sums.includes(perSideTargetCp)) {
    chosenSum = perSideTargetCp
  } else if (perSideTargetCp > maxSum) {
    // Beyond what we can load — return the max and flag the ceiling.
    chosenSum = maxSum
    ceilingReached = true
  } else {
    const below = floorSum(sums, perSideTargetCp)
    const above = ceilSum(sums, perSideTargetCp)
    if (opts.rounding === 'down') {
      chosenSum = below
    } else if (opts.rounding === 'up') {
      chosenSum = above ?? below
    } else {
      // nearest: closer of the two, ties → up
      if (above === null) chosenSum = below
      else {
        const distDown = perSideTargetCp - below
        const distUp = above - perSideTargetCp
        chosenSum = distUp <= distDown ? above : below
      }
    }
  }

  const combo = reachable.comboBySum.get(chosenSum) ?? []
  const loadedCp = barCp + 2 * chosenSum

  return {
    targetLb,
    barbellLb,
    perSide: combo,
    loadedTotalLb: round2(loadedCp / 100),
    deltaLb: round2((loadedCp - targetCp) / 100),
    exact: loadedCp === targetCp,
    ceilingReached,
  }
}

/** Max loadable total (bar + biggest symmetric plate sum) for a plate-loaded bar. */
export function maxLoadableLb(
  barbellLb: number,
  inventory: PlateStock[],
  microPlatesEnabled: boolean,
): number {
  const pairs = usablePairs(inventory, microPlatesEnabled)
  const { maxSum } = buildReachable(pairs)
  return round2((Math.round(barbellLb * 100) + 2 * maxSum) / 100)
}

export interface DumbbellSnap {
  targetLb: number
  /** The chosen owned bell weight, or null if none are owned. */
  weightLb: number | null
  deltaLb: number
  exact: boolean
  ceilingReached: boolean
}

/**
 * Snap a target to the closest owned dumbbell (SPEC §6 [P3], §7 dumbbell
 * ceiling). Dumbbells are discrete owned bells, not plate-loaded.
 */
export function snapDumbbell(
  targetLb: number,
  ownedBellsLb: number[],
  rounding: RoundDir,
): DumbbellSnap {
  const bells = [...new Set(ownedBellsLb)].sort((a, b) => a - b)
  if (bells.length === 0) {
    return { targetLb, weightLb: null, deltaLb: 0, exact: false, ceilingReached: false }
  }
  const maxBell = bells[bells.length - 1]!
  if (targetLb > maxBell) {
    return {
      targetLb,
      weightLb: maxBell,
      deltaLb: round2(maxBell - targetLb),
      exact: maxBell === targetLb,
      ceilingReached: true,
    }
  }
  const exactMatch = bells.find((b) => b === targetLb)
  if (exactMatch !== undefined) {
    return { targetLb, weightLb: exactMatch, deltaLb: 0, exact: true, ceilingReached: false }
  }
  const below = [...bells].reverse().find((b) => b < targetLb) ?? null
  const above = bells.find((b) => b > targetLb) ?? null
  let chosen: number
  if (rounding === 'down') chosen = below ?? above!
  else if (rounding === 'up') chosen = above ?? below!
  else {
    if (below === null) chosen = above!
    else if (above === null) chosen = below
    else chosen = above - targetLb <= targetLb - below ? above : below
  }
  return {
    targetLb,
    weightLb: chosen,
    deltaLb: round2(chosen - targetLb),
    exact: false,
    ceilingReached: false,
  }
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

// Re-export for callers that want the branded value.
export type { Weight }
