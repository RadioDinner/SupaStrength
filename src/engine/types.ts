/**
 * Engine-local domain types. These mirror the relevant DB shapes
 * (`docs/DATA_MODEL.md` §3.5) but are deliberately plain, I/O-free inputs so the
 * engine stays pure and reusable verbatim on native/offline (BUILD_PLAN rule #2).
 */
import type { RoundDir } from './weight'
import type { PlateStock } from './plates'

export type Dimension = 'weight' | 'reps' | 'sets'
export type AppliesTo = 'all_sets' | 'last_set'
export type WeightMode = 'fixed' | 'pct_of_last' | 'pct_of_target'
export type CapType = 'none' | 'target_weight' | 'rep_count' | 'set_count'
export type OnCap = 'stop' | 'next_step' | 'loop'
export type ResetKind = 'none' | 'reps_to_base' | 'sets_to_base'

/** One ordered step of a progression pipeline (DATA_MODEL `progression_steps`). */
export interface Step {
  position: number
  dimension: Dimension
  appliesTo: AppliesTo | null
  weightMode: WeightMode | null
  amount: number
  everyN: number
  capType: CapType
  capValue: number | null
  onCap: OnCap
  loopTargetPosition: number
  reset: ResetKind
}

export interface Pipeline {
  steps: Step[]
}

export type ProgressionMode = 'weight' | 'reps_fallback'
export type CeilingBehavior = 'hold_warn' | 'auto_switch_reps'

/** Shared working-WEIGHT line (`progression_state`, keyed routine+exercise). */
export interface WeightState {
  /** Plate-rounded working weight in lb (null for unloaded lifts). */
  currentWeightLb: number | null
  /** Ideal un-rounded running line in lb; `currentWeightLb` is its realization. */
  targetLineWeightLb: number | null
  /** Weight-dimension cursor into the resolved pipeline. */
  pipelineStepIndex: number
  /** Drives the active weight step's `every_n`; resets on step change. */
  stepCompletionCounter: number
  /** Repeats taken within the current failure response. */
  failureCounter: number
  /** Cursor into the failure-response chain. */
  currentFailureResponseIndex: number
  /** Gap-workout holds remaining (SPEC §6 consolidation). */
  consolidationCounter: number
  progressionMode: ProgressionMode
  /** Set when the computed weight exceeds the location's loadable max. */
  weightFrozen: boolean
  /** True once a weight step has hit a `stop` cap — progression is parked. */
  stopped: boolean
}

/** Per-entry REP/SET live line (`progression_entry_state`, keyed routine+entry). */
export interface RepSetState {
  currentRepTarget: number | null
  currentRepRangeLow: number | null
  currentRepRangeHigh: number | null
  currentSetCount: number | null
  /** Rep/set-dimension cursor into the resolved pipeline. */
  repsetPipelineStepIndex: number
  /** Drives the active rep/set step's `every_n`; resets on step change. */
  repsetStepCompletionCounter: number
  /** True once a rep/set step has hit a `stop` cap. */
  stopped: boolean
}

/** Immutable prescription baseline for an entry (for `reset_to_base`). */
export interface EntryBaseline {
  baseSets: number
  baseRepTarget: number | null
  repRangeLow: number | null
  repRangeHigh: number | null
}

/** Equipment context used to plate-round computed weights + detect ceilings. */
export interface WeightContext {
  barbellLb: number
  inventory: PlateStock[]
  microPlatesEnabled: boolean
  roundingDirection: RoundDir
  /** Pre-computed max loadable total (lb) for the active equipment. */
  maxLoadableLb: number
  /** Opt-in gap-workout consolidation for the driving entry (SPEC §6). */
  consolidationEnabled: boolean
  consolidationSessions: number
  /** Resolved ceiling behavior (entry override → equipment_preferences). */
  ceilingBehavior: CeilingBehavior
}

export type AuditAction =
  | 'progression_adjust'
  | 'deload'
  | 'gap_workout'
  | 'failure_repeat'
  | 'step_advance'
  | 'cap_reached'
  | 'reset'

export interface AuditEvent {
  action: AuditAction
  summary: string
  before?: Record<string, unknown>
  after?: Record<string, unknown>
}

export type Verdict = 'success' | 'failure'
