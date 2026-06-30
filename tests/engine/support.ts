/**
 * Shared fixtures for engine tests. Models the user's real home gym (SPEC §7):
 * one pair each of 2.5/5/10/15/25/35/45 lb plates + a single 45 lb Olympic bar,
 * dumbbells 15/20/25. Loadable barbell range = 45→320 lb in 5 lb steps.
 */
import type { PlateStock } from '../../src/engine/plates'
import { maxLoadableLb } from '../../src/engine/plates'
import type {
  EntryBaseline,
  RepSetState,
  Step,
  WeightContext,
  WeightState,
} from '../../src/engine/types'

export const HOME_GYM: PlateStock[] = [
  { denominationLb: 45, quantity: 2 },
  { denominationLb: 35, quantity: 2 },
  { denominationLb: 25, quantity: 2 },
  { denominationLb: 15, quantity: 2 },
  { denominationLb: 10, quantity: 2 },
  { denominationLb: 5, quantity: 2 },
  { denominationLb: 2.5, quantity: 2 },
]

export const HOME_GYM_WITH_MICROS: PlateStock[] = [
  ...HOME_GYM,
  { denominationLb: 1.25, quantity: 2 },
]

export const HOME_BARBELL_LB = 45
export const HOME_DUMBBELLS = [15, 20, 25]

export function ctx(overrides: Partial<WeightContext> = {}): WeightContext {
  const inventory = overrides.inventory ?? HOME_GYM
  const barbellLb = overrides.barbellLb ?? HOME_BARBELL_LB
  const microPlatesEnabled = overrides.microPlatesEnabled ?? false
  return {
    barbellLb,
    inventory,
    microPlatesEnabled,
    roundingDirection: 'down',
    maxLoadableLb: maxLoadableLb(barbellLb, inventory, microPlatesEnabled),
    consolidationEnabled: false,
    consolidationSessions: 0,
    ceilingBehavior: 'hold_warn',
    ...overrides,
  }
}

export function weightState(o: Partial<WeightState> = {}): WeightState {
  return {
    currentWeightLb: 135,
    targetLineWeightLb: 135,
    pipelineStepIndex: 0,
    stepCompletionCounter: 0,
    failureCounter: 0,
    currentFailureResponseIndex: 0,
    consolidationCounter: 0,
    progressionMode: 'weight',
    weightFrozen: false,
    stopped: false,
    ...o,
  }
}

export function repSetState(o: Partial<RepSetState> = {}): RepSetState {
  return {
    currentRepTarget: 5,
    currentRepRangeLow: null,
    currentRepRangeHigh: null,
    currentSetCount: 3,
    repsetPipelineStepIndex: 0,
    repsetStepCompletionCounter: 0,
    stopped: false,
    ...o,
  }
}

export function baseline(o: Partial<EntryBaseline> = {}): EntryBaseline {
  return { baseSets: 3, baseRepTarget: 5, repRangeLow: null, repRangeHigh: null, ...o }
}

export function step(o: Partial<Step> & Pick<Step, 'dimension'>): Step {
  return {
    position: 0,
    appliesTo: null,
    weightMode: o.dimension === 'weight' ? 'fixed' : null,
    amount: 0,
    everyN: 1,
    capType: 'none',
    capValue: null,
    onCap: 'stop',
    loopTargetPosition: 0,
    reset: 'none',
    ...o,
  }
}
