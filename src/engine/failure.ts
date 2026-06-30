/**
 * Failure handling (SPEC §4 "Failure handling", DATA_MODEL §6 failure chain).
 *
 * A chainable, ordered list of {@link FailureResponse}s driven by two cursors on
 * the weight state: `currentFailureResponseIndex` (which response is active) and
 * `failureCounter` (repeats taken within the current response). Pure + I/O-free.
 */
import { solvePlates } from './plates'
import type { AuditEvent, RepSetState, WeightContext, WeightState } from './types'

export type FailureResponseType = 'repeat' | 'deload_lb' | 'deload_pct' | 'deload_reps' | 'drop_set'

export interface FailureResponse {
  position: number
  type: FailureResponseType
  /** null = repeat indefinitely (repeat only). */
  repeatLimit: number | null
  /** lb (deload_lb), % (deload_pct), reps (deload_reps), sets (drop_set, default 1). */
  amount: number | null
}

export interface FailureResult {
  weight: WeightState
  repset: RepSetState
  events: AuditEvent[]
}

/**
 * Evaluate one failed qualifying completion against the response chain.
 *
 * - An active `repeat` with budget left (limit null, or counter < limit) holds the
 *   weight and increments `failureCounter`.
 * - An exhausted `repeat` falls through to the next response in the same failure.
 * - A deload/drop_set response applies its effect, advances the cursor, and resets
 *   `failureCounter`. Past the end of the chain it holds at the last response.
 *
 * `responses` must be the ordered chain (sorted by position). An empty chain means
 * "repeat indefinitely" (SPEC default).
 */
export function applyFailure(
  weight: WeightState,
  repset: RepSetState,
  responses: FailureResponse[],
  ctx: WeightContext,
): FailureResult {
  const events: AuditEvent[] = []
  const w: WeightState = { ...weight }
  const rs: RepSetState = { ...repset }
  const chain = [...responses].sort((a, b) => a.position - b.position)

  if (chain.length === 0) {
    w.failureCounter += 1
    events.push({ action: 'failure_repeat', summary: `hold (repeat indefinitely) @ ${w.currentWeightLb ?? '—'}` })
    return { weight: w, repset: rs, events }
  }

  // Walk the chain from the current cursor; exhausted repeats fall through.
  // Bounded by chain length so a pathological all-repeat-exhausted chain can't spin.
  for (let guard = 0; guard <= chain.length; guard++) {
    const idx = w.currentFailureResponseIndex
    if (idx >= chain.length) {
      // Past the end — hold at the last response.
      w.failureCounter += 1
      events.push({ action: 'failure_repeat', summary: `hold (chain exhausted) @ ${w.currentWeightLb ?? '—'}` })
      return { weight: w, repset: rs, events }
    }
    const resp = chain[idx]!
    if (resp.type === 'repeat') {
      if (resp.repeatLimit == null || w.failureCounter < resp.repeatLimit) {
        w.failureCounter += 1
        events.push({
          action: 'failure_repeat',
          summary: `repeat hold ${w.failureCounter}${resp.repeatLimit == null ? '' : `/${resp.repeatLimit}`} @ ${w.currentWeightLb ?? '—'}`,
        })
        return { weight: w, repset: rs, events }
      }
      // Exhausted — advance and fall through to the next response in this failure.
      w.currentFailureResponseIndex = idx + 1
      w.failureCounter = 0
      continue
    }
    // Deload / drop-set response — apply, advance the cursor, reset the counter.
    applyDeload(w, rs, resp, ctx, events)
    w.currentFailureResponseIndex = idx + 1
    w.failureCounter = 0
    return { weight: w, repset: rs, events }
  }

  // Unreachable in practice (loop is bounded), but keep the shape total.
  return { weight: w, repset: rs, events }
}

function applyDeload(
  w: WeightState,
  rs: RepSetState,
  resp: FailureResponse,
  ctx: WeightContext,
  events: AuditEvent[],
): void {
  switch (resp.type) {
    case 'deload_lb': {
      if (w.currentWeightLb == null || w.targetLineWeightLb == null) break
      const amt = resp.amount ?? 0
      const newIdeal = round2(Math.max(0, w.targetLineWeightLb - amt))
      const sol = solvePlates(newIdeal, ctx.barbellLb, ctx.inventory, {
        rounding: ctx.roundingDirection,
        microPlatesEnabled: ctx.microPlatesEnabled,
      })
      events.push({
        action: 'deload',
        summary: `deload -${amt} lb → ${sol.loadedTotalLb}`,
        before: { from: w.currentWeightLb },
        after: { to: sol.loadedTotalLb },
      })
      w.currentWeightLb = sol.loadedTotalLb
      w.targetLineWeightLb = newIdeal
      break
    }
    case 'deload_pct': {
      if (w.currentWeightLb == null || w.targetLineWeightLb == null) break
      const pct = resp.amount ?? 0
      const newIdeal = round2(Math.max(0, w.targetLineWeightLb * (1 - pct / 100)))
      const sol = solvePlates(newIdeal, ctx.barbellLb, ctx.inventory, {
        rounding: ctx.roundingDirection,
        microPlatesEnabled: ctx.microPlatesEnabled,
      })
      events.push({
        action: 'deload',
        summary: `deload -${pct}% → ${sol.loadedTotalLb}`,
        before: { from: w.currentWeightLb },
        after: { to: sol.loadedTotalLb },
      })
      w.currentWeightLb = sol.loadedTotalLb
      w.targetLineWeightLb = newIdeal
      break
    }
    case 'deload_reps': {
      if (rs.currentRepTarget == null) break
      const amt = resp.amount ?? 0
      const next = Math.max(1, rs.currentRepTarget - amt)
      events.push({
        action: 'deload',
        summary: `deload reps -${amt} → ${next}`,
        before: { from: rs.currentRepTarget },
        after: { to: next },
      })
      rs.currentRepTarget = next
      break
    }
    case 'drop_set': {
      if (rs.currentSetCount == null) break
      const amt = resp.amount ?? 1
      const next = Math.max(1, rs.currentSetCount - amt)
      events.push({
        action: 'deload',
        summary: `drop set -${amt} → ${next}`,
        before: { from: rs.currentSetCount },
        after: { to: next },
      })
      rs.currentSetCount = next
      break
    }
  }
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}
