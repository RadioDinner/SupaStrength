/**
 * Default progression pipelines (BUILD_PLAN M5d). Until the in-app
 * pipeline-builder exists, the engine derives a sensible default pipeline from a
 * workout entry's rep scheme:
 *   - straight  → linear weight (+amount every session) — the StrongLifts default.
 *   - double    → double progression (ramp reps low→high, then +amount & reset).
 *   - rpe       → no auto-progression (lifter picks the weight).
 * Pure; reused by the session-commit engine wiring.
 */
import type { Pipeline, Step } from './types'

export type DefaultScheme = 'straight' | 'double' | 'rpe'

export interface DefaultPipelineSpec {
  repScheme: DefaultScheme
  repRangeLow: number | null
  repRangeHigh: number | null
  /** Weight increment in lb (default 5). */
  weightAmount?: number
}

function weightStep(amount: number, overrides: Partial<Step> = {}): Step {
  return {
    position: 0,
    dimension: 'weight',
    appliesTo: null,
    weightMode: 'fixed',
    amount,
    everyN: 1,
    capType: 'none',
    capValue: null,
    onCap: 'stop',
    loopTargetPosition: 0,
    reset: 'none',
    ...overrides,
  }
}

export function defaultPipeline(spec: DefaultPipelineSpec): Pipeline {
  const amount = spec.weightAmount ?? 5

  if (spec.repScheme === 'double' && spec.repRangeHigh != null) {
    return {
      steps: [
        {
          position: 0,
          dimension: 'reps',
          appliesTo: 'all_sets',
          weightMode: null,
          amount: 1,
          everyN: 1,
          capType: 'rep_count',
          capValue: spec.repRangeHigh,
          onCap: 'next_step',
          loopTargetPosition: 0,
          reset: 'none',
        },
        weightStep(amount, {
          position: 1,
          onCap: 'loop',
          loopTargetPosition: 0,
          reset: 'reps_to_base',
        }),
      ],
    }
  }

  if (spec.repScheme === 'rpe') {
    return { steps: [] } // autoregulated — no auto progression
  }

  // straight (default): linear weight, every session, forever
  return { steps: [weightStep(amount)] }
}
