/**
 * Progression pipeline engine (SPEC §4 + DATA_MODEL §6) — pure, deterministic.
 *
 * A pipeline is an ordered list of {@link Step}s. The engine walks them with a
 * single logical program counter that is mirrored into the two stored cursors
 * (`progression_state.pipeline_step_index` for weight steps,
 * `progression_entry_state.repset_pipeline_step_index` for rep/set steps) so each
 * state table is self-contained while the cursors stay in lockstep through
 * cap / next_step / loop transitions.
 *
 * Weight steps mutate the shared {@link WeightState} (the un-rounded
 * `targetLineWeightLb` ideal line + its plate-rounded `currentWeightLb`
 * realization). Rep/set steps mutate the per-entry {@link RepSetState}. This split
 * is the literal encoding of SPEC O-5a (shared weight, per-entry rep/set ladders).
 *
 * The functions here operate on a *single* entry's resolved pipeline. The
 * once-per-(session,exercise) weight dedupe across two head workouts on the same
 * gym day is an orchestration concern (M5d) layered on top of these primitives.
 */
import { solvePlates } from './plates'
import type {
  AuditEvent,
  EntryBaseline,
  Pipeline,
  RepSetState,
  Step,
  WeightContext,
  WeightState,
} from './types'

export interface ProgressionCandidate {
  scope: 'exercise' | 'workout' | 'routine'
  pipeline: Pipeline
}

const SCOPE_RANK: Record<ProgressionCandidate['scope'], number> = {
  exercise: 3,
  workout: 2,
  routine: 1,
}

/**
 * Most-specific-wins pipeline selection (SPEC §4 scope inheritance). Whole-object
 * selection, NOT a field-level merge: an exercise-scope override must restate the
 * full pipeline (DATA_MODEL §6 "scope inheritance" note).
 */
export function resolvePipeline(candidates: ProgressionCandidate[]): Pipeline | null {
  let best: ProgressionCandidate | null = null
  for (const c of candidates) {
    if (best === null || SCOPE_RANK[c.scope] > SCOPE_RANK[best.scope]) best = c
  }
  return best?.pipeline ?? null
}

export interface ApplyResult {
  weight: WeightState
  repset: RepSetState
  events: AuditEvent[]
}

function sortedSteps(pipeline: Pipeline): Step[] {
  return [...pipeline.steps].sort((a, b) => a.position - b.position)
}

/** Apply a `reset` directive to the rep/set state (used at transitions). */
function applyReset(rs: RepSetState, step: Step, baseline: EntryBaseline): AuditEvent | null {
  if (step.reset === 'reps_to_base') {
    const base = baseline.repRangeLow ?? baseline.baseRepTarget
    rs.currentRepTarget = base
    if (baseline.repRangeLow != null) rs.currentRepRangeLow = baseline.repRangeLow
    if (baseline.repRangeHigh != null) rs.currentRepRangeHigh = baseline.repRangeHigh
    return { action: 'reset', summary: `reps reset to base (${base ?? '—'})` }
  }
  if (step.reset === 'sets_to_base') {
    rs.currentSetCount = baseline.baseSets
    return { action: 'reset', summary: `sets reset to base (${baseline.baseSets})` }
  }
  return null
}

/**
 * Apply ONE qualifying *successful* completion to a single entry's states.
 *
 * Resets the failure cursor/counter (SPEC §6 step 4) then advances the pipeline
 * by executing the step at the current logical position (subject to `every_n`),
 * handling caps, transitions (`next_step`/`loop`/`stop`), `reset`, plate-aware
 * rounding, gap-workout consolidation, and the equipment ceiling.
 */
export function applyProgression(
  weight: WeightState,
  repset: RepSetState,
  pipeline: Pipeline,
  baseline: EntryBaseline,
  ctx: WeightContext,
): ApplyResult {
  const events: AuditEvent[] = []
  const w: WeightState = {
    ...weight,
    failureCounter: 0,
    currentFailureResponseIndex: 0,
  }
  const rs: RepSetState = { ...repset }

  const steps = sortedSteps(pipeline)
  if (steps.length === 0) return { weight: w, repset: rs, events }

  // Logical program counter — mirrored across both stored cursors.
  const pos = w.pipelineStepIndex
  if (w.stopped || rs.stopped || pos < 0 || pos >= steps.length) {
    return { weight: w, repset: rs, events }
  }
  const step = steps[pos]!

  // ── every_n gating ────────────────────────────────────────────────────────
  const isWeight = step.dimension === 'weight'
  const counter = isWeight ? w.stepCompletionCounter : rs.repsetStepCompletionCounter
  const fires = (counter + 1) % step.everyN === 0
  const nextCounter = counter + 1
  if (isWeight) w.stepCompletionCounter = nextCounter
  else rs.repsetStepCompletionCounter = nextCounter

  if (!fires) {
    // Parity not met this completion — tick the counter, change nothing else.
    return { weight: w, repset: rs, events }
  }

  // ── execute the firing step ────────────────────────────────────────────────
  let capReached = false
  if (isWeight) {
    capReached = applyWeightStep(w, step, ctx, events)
    // A frozen ceiling short-circuits any pipeline transition.
    if (w.weightFrozen) return { weight: w, repset: rs, events }
  } else {
    capReached = applyRepSetStep(rs, step, events)
  }

  // Apply the step's `reset` as part of *executing* it, so a reps→base reset
  // rides atomically with its carrying step's effect (double-progression resets
  // reps with the +5 weight; the shoulders ladder resets reps with the +1 set).
  const resetEvent = applyReset(rs, step, baseline)
  if (resetEvent) events.push(resetEvent)

  // ── transition? ────────────────────────────────────────────────────────────
  // Capped steps transition per on_cap. A cap-less step with on_cap=loop/next_step
  // is a one-shot that immediately moves on (e.g. double-progression's weight
  // step). A cap-less on_cap=stop step (StrongLifts, every-2nd) keeps applying.
  const shouldTransition = capReached || (step.capType === 'none' && step.onCap !== 'stop')
  if (!shouldTransition) return { weight: w, repset: rs, events }

  const onCap = step.onCap
  if (onCap === 'stop') {
    park(w, rs, steps.length)
    events.push({ action: capReached ? 'cap_reached' : 'step_advance', summary: 'progression stopped' })
  } else if (onCap === 'next_step') {
    const nextPos = pos + 1
    if (nextPos >= steps.length) {
      park(w, rs, steps.length)
      events.push({ action: 'cap_reached', summary: 'no next step — progression stopped' })
    } else {
      moveCursor(w, rs, nextPos)
      events.push({ action: 'step_advance', summary: `advance to step ${nextPos}` })
    }
  } else {
    // loop
    const target = step.loopTargetPosition
    if (target < 0 || target >= steps.length) {
      park(w, rs, steps.length)
      events.push({ action: 'cap_reached', summary: 'loop target out of range — stopped' })
    } else {
      moveCursor(w, rs, target)
      events.push({ action: 'step_advance', summary: `loop to step ${target}` })
    }
  }

  return { weight: w, repset: rs, events }
}

function moveCursor(w: WeightState, rs: RepSetState, pos: number): void {
  w.pipelineStepIndex = pos
  rs.repsetPipelineStepIndex = pos
  // On any cursor change both per-step completion counters reset (DATA_MODEL §3.5).
  w.stepCompletionCounter = 0
  rs.repsetStepCompletionCounter = 0
}

function park(w: WeightState, rs: RepSetState, end: number): void {
  w.pipelineStepIndex = end
  rs.repsetPipelineStepIndex = end
  w.stepCompletionCounter = 0
  rs.repsetStepCompletionCounter = 0
  w.stopped = true
  rs.stopped = true
}

/**
 * Execute a weight-dimension step against the shared weight line. Returns whether
 * a `target_weight` cap was reached. Mutates `w` (and pushes audit events).
 */
function applyWeightStep(w: WeightState, step: Step, ctx: WeightContext, events: AuditEvent[]): boolean {
  if (w.currentWeightLb == null || w.targetLineWeightLb == null) {
    // Unloaded lift — no weight progression.
    return false
  }
  const prevCurrent = w.currentWeightLb
  const ideal = w.targetLineWeightLb

  // Compute the intended pound delta for this step.
  let deltaLb: number
  switch (step.weightMode) {
    case 'pct_of_last':
      deltaLb = round2((prevCurrent * step.amount) / 100)
      break
    case 'pct_of_target': {
      const base = step.capType === 'target_weight' && step.capValue != null ? step.capValue : ideal
      deltaLb = round2((base * step.amount) / 100)
      break
    }
    case 'fixed':
    default:
      deltaLb = step.amount
      break
  }

  let newIdeal = round2(ideal + deltaLb)
  let capReached = false
  if (step.capType === 'target_weight' && step.capValue != null) {
    if (newIdeal >= step.capValue) {
      newIdeal = step.capValue
      capReached = true
    }
  }

  // Plate-aware rounding of the ideal into a loadable reality.
  const sol = solvePlates(newIdeal, ctx.barbellLb, ctx.inventory, {
    rounding: ctx.roundingDirection,
    microPlatesEnabled: ctx.microPlatesEnabled,
  })
  const rounded = sol.loadedTotalLb

  // ── equipment ceiling (DATA_MODEL §7 / §3.5) ──────────────────────────────
  if (sol.ceilingReached || newIdeal > ctx.maxLoadableLb) {
    w.weightFrozen = true
    w.targetLineWeightLb = newIdeal // keep the ideal so growth later can resume
    if (ctx.ceilingBehavior === 'auto_switch_reps') {
      w.progressionMode = 'reps_fallback'
      events.push({
        action: 'cap_reached',
        summary: 'ceiling auto-switch → reps fallback',
        before: { currentWeightLb: prevCurrent },
        after: { ceilingLb: ctx.maxLoadableLb },
      })
    } else {
      events.push({
        action: 'cap_reached',
        summary: 'ceiling reached → hold + warn',
        before: { currentWeightLb: prevCurrent },
        after: { ceilingLb: ctx.maxLoadableLb },
      })
    }
    // Hold the current loaded weight (do not exceed the ceiling).
    return capReached
  }

  // ── gap-workout consolidation (SPEC §6) ───────────────────────────────────
  const forcedJump = round2(rounded - prevCurrent)
  if (ctx.consolidationEnabled && forcedJump > deltaLb && ctx.consolidationSessions > 0) {
    w.consolidationCounter = ctx.consolidationSessions
    events.push({
      action: 'gap_workout',
      summary: `consolidation hold: wanted +${deltaLb}, plates forced +${forcedJump}`,
      before: { desired: deltaLb, forced: forcedJump },
      after: { holdSessions: ctx.consolidationSessions, weightLb: rounded },
    })
  }

  w.currentWeightLb = rounded
  w.targetLineWeightLb = newIdeal
  events.push({
    action: capReached ? 'cap_reached' : 'progression_adjust',
    summary: `weight +${deltaLb} → ${rounded}${capReached ? ' (cap)' : ''}`,
    before: { from: prevCurrent },
    after: { to: rounded, ideal: newIdeal },
  })
  return capReached
}

/**
 * Execute a reps/sets-dimension step against the per-entry rep/set line. Returns
 * whether a `rep_count`/`set_count` cap was reached. Mutates `rs`.
 */
function applyRepSetStep(rs: RepSetState, step: Step, events: AuditEvent[]): boolean {
  let capReached = false
  if (step.dimension === 'reps') {
    if (rs.currentRepTarget == null) return false
    let next = rs.currentRepTarget + step.amount
    if (step.capType === 'rep_count' && step.capValue != null && next >= step.capValue) {
      next = step.capValue
      capReached = true
    }
    const scope = step.appliesTo === 'last_set' ? 'last set' : 'all sets'
    events.push({
      action: capReached ? 'cap_reached' : 'progression_adjust',
      summary: `reps +${step.amount} (${scope}) → ${next}${capReached ? ' (cap)' : ''}`,
      before: { from: rs.currentRepTarget },
      after: { to: next },
    })
    rs.currentRepTarget = next
  } else {
    // sets
    if (rs.currentSetCount == null) return false
    let next = rs.currentSetCount + step.amount
    if (step.capType === 'set_count' && step.capValue != null && next >= step.capValue) {
      next = step.capValue
      capReached = true
    }
    events.push({
      action: capReached ? 'cap_reached' : 'progression_adjust',
      summary: `sets +${step.amount} → ${next}${capReached ? ' (cap)' : ''}`,
      before: { from: rs.currentSetCount },
      after: { to: next },
    })
    rs.currentSetCount = next
  }
  return capReached
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}
