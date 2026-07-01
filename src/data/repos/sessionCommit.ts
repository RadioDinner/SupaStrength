/**
 * Session-commit engine wiring (BUILD_PLAN M5d). On completing a routine session,
 * for each entry: compute a success/failure verdict from the logged sets, then run
 * the pure engine (`applyProgression` / `applyFailure`) over the shared
 * `progression_state` (weight) and per-entry `progression_entry_state` (rep/set),
 * with a default pipeline derived from the entry's rep scheme. Persists the
 * advanced state so the *next* session auto-prescribes the new weight/reps.
 *
 * Weight advances at most ONCE per (session, exercise) via the driving entry (the
 * heaviest set performed); rep/set advance per entry. Cold start: the first time
 * an exercise is completed, the weight line is seeded from the weight actually
 * lifted, then the pipeline advances from there.
 */
import { onlineDataClient } from '../online/supabaseDataClient'
import { applyProgression } from '../../engine/pipeline'
import { applyFailure, type FailureResponse } from '../../engine/failure'
import { defaultPipeline, type DefaultScheme } from '../../engine/presets'
import type { PlateStock } from '../../engine/plates'
import type {
  CeilingBehavior,
  EntryBaseline,
  RepSetState,
  WeightContext,
  WeightState,
} from '../../engine/types'
import type {
  ProgressionEntryState,
  ProgressionState,
  SessionEntry,
  SetLog,
  WorkoutEntry,
} from '../types'

/** SPEC default failure response: repeat (hold) indefinitely until success. */
const DEFAULT_FAILURE: FailureResponse[] = [
  { position: 0, type: 'repeat', repeatLimit: null, amount: null },
]

export interface CommitEquipment {
  barbellLb: number
  inventory: PlateStock[]
  microPlatesEnabled: boolean
  roundingDirection: 'up' | 'down'
  maxLoadableLb: number
  ceilingBehavior: CeilingBehavior
}

export interface CommitInput {
  routineId: string
  entries: SessionEntry[]
  setLogsByEntry: Map<string, SetLog[]>
  workoutEntryById: Map<string, WorkoutEntry>
  equipment: CommitEquipment
}

/** What the engine decided for one exercise: where the line was → what's next. */
export interface ProgressionOutcome {
  exerciseId: string
  /**
   * The shared weight line BEFORE this session's advance (cold start: seeded
   * from what was lifted). Deltas against this report the engine's actual
   * progression direction, even when the lifter overrode the weight input.
   */
  fromLb: number | null
  /** The advanced shared weight line — next session's prescription. */
  nextLb: number | null
}

interface EntryEval {
  entry: SessionEntry
  success: boolean
  achievedWeight: number | null
}

function evaluateEntry(entry: SessionEntry, logs: SetLog[]): EntryEval {
  const working = logs.filter((l) => !l.is_warmup)
  const completed = working.filter((l) => l.is_completed)
  const achievedWeight = completed.reduce<number | null>(
    (max, l) => (l.actual_weight != null && (max == null || l.actual_weight > max) ? l.actual_weight : max),
    null,
  )
  const success =
    working.length > 0 &&
    completed.length >= working.length &&
    completed.every((l) => (l.actual_reps ?? 0) >= (l.planned_reps ?? 0))
  return { entry, success, achievedWeight }
}

function initWeightState(seed: number | null): WeightState {
  return {
    currentWeightLb: seed,
    targetLineWeightLb: seed,
    pipelineStepIndex: 0,
    stepCompletionCounter: 0,
    failureCounter: 0,
    currentFailureResponseIndex: 0,
    consolidationCounter: 0,
    progressionMode: 'weight',
    weightFrozen: false,
    stopped: false,
  }
}

function weightStateFromRow(row: ProgressionState): WeightState {
  return {
    currentWeightLb: row.current_weight,
    targetLineWeightLb: row.target_line_weight,
    pipelineStepIndex: row.pipeline_step_index,
    stepCompletionCounter: row.step_completion_counter,
    failureCounter: row.failure_counter,
    currentFailureResponseIndex: row.current_failure_response_index,
    consolidationCounter: row.consolidation_counter,
    progressionMode: row.progression_mode,
    weightFrozen: row.weight_frozen,
    stopped: false, // parking is encoded by pipeline_step_index ≥ steps.length
  }
}

function repSetStateFromRow(row: ProgressionEntryState): RepSetState {
  return {
    currentRepTarget: row.current_rep_target,
    currentRepRangeLow: row.current_rep_range_low,
    currentRepRangeHigh: row.current_rep_range_high,
    currentSetCount: row.current_set_count,
    repsetPipelineStepIndex: row.repset_pipeline_step_index,
    repsetStepCompletionCounter: row.repset_step_completion_counter,
    stopped: false,
  }
}

function initRepSetState(entry: SessionEntry): RepSetState {
  return {
    currentRepTarget: entry.planned_rep_target ?? entry.planned_rep_low ?? null,
    currentRepRangeLow: entry.planned_rep_low,
    currentRepRangeHigh: entry.planned_rep_high,
    currentSetCount: entry.planned_sets,
    repsetPipelineStepIndex: 0,
    repsetStepCompletionCounter: 0,
    stopped: false,
  }
}

function buildCtx(eq: CommitEquipment, we: WorkoutEntry | undefined): WeightContext {
  return {
    barbellLb: eq.barbellLb,
    inventory: eq.inventory,
    microPlatesEnabled: eq.microPlatesEnabled,
    roundingDirection: eq.roundingDirection,
    maxLoadableLb: eq.maxLoadableLb,
    consolidationEnabled: we?.consolidation_enabled ?? false,
    consolidationSessions: we?.consolidation_sessions ?? 0,
    ceilingBehavior: we?.ceiling_behavior_override ?? eq.ceilingBehavior,
  }
}

const schemeOf = (entry: SessionEntry): DefaultScheme =>
  entry.planned_rep_scheme === 'double' ? 'double' : entry.planned_rep_scheme === 'rpe' ? 'rpe' : 'straight'

export async function commitSessionProgression(input: CommitInput): Promise<ProgressionOutcome[]> {
  const { routineId, entries, setLogsByEntry, workoutEntryById, equipment } = input
  const outcomes: ProgressionOutcome[] = []

  // Group entries by exercise so the shared weight line advances once per exercise.
  const byExercise = new Map<string, SessionEntry[]>()
  for (const e of entries) {
    const arr = byExercise.get(e.exercise_id) ?? []
    arr.push(e)
    byExercise.set(e.exercise_id, arr)
  }

  for (const [exerciseId, exEntries] of byExercise) {
    const evals = exEntries.map((e) => evaluateEntry(e, setLogsByEntry.get(e.id) ?? []))
    // Driving entry = the heaviest set performed (ties → keep first).
    const driving = evals.reduce((best, cur) =>
      (cur.achievedWeight ?? -1) > (best.achievedWeight ?? -1) ? cur : best,
    )

    // Shared weight state for this exercise (cold-start seeds from what was lifted).
    const wsRow = await onlineDataClient.getOne<ProgressionState>('progression_state', [
      { column: 'routine_id', op: 'eq', value: routineId },
      { column: 'exercise_id', op: 'eq', value: exerciseId },
    ])
    const ws0 = wsRow ? weightStateFromRow(wsRow) : initWeightState(driving.achievedWeight)
    if (ws0.currentWeightLb == null && driving.achievedWeight != null) {
      ws0.currentWeightLb = driving.achievedWeight
      ws0.targetLineWeightLb = driving.achievedWeight
    }
    const fromLb = ws0.currentWeightLb

    let advancedWeight: WeightState = ws0

    for (const ev of evals) {
      const weId = ev.entry.workout_entry_id
      const we = weId ? workoutEntryById.get(weId) : undefined
      const pipeline = defaultPipeline({
        repScheme: schemeOf(ev.entry),
        repRangeLow: ev.entry.planned_rep_low,
        repRangeHigh: ev.entry.planned_rep_high,
      })
      const base: EntryBaseline = {
        baseSets: ev.entry.planned_sets ?? 1,
        baseRepTarget: ev.entry.planned_rep_target,
        repRangeLow: ev.entry.planned_rep_low,
        repRangeHigh: ev.entry.planned_rep_high,
      }
      const ctx = buildCtx(equipment, we)

      const esRow = weId
        ? await onlineDataClient.getOne<ProgressionEntryState>('progression_entry_state', [
            { column: 'routine_id', op: 'eq', value: routineId },
            { column: 'workout_entry_id', op: 'eq', value: weId },
          ])
        : null
      const rs = esRow ? repSetStateFromRow(esRow) : initRepSetState(ev.entry)

      // Each entry computes against a clone of the shared weight; only the driving
      // entry's result is persisted to the shared line.
      const wsClone: WeightState = { ...ws0 }
      const result = ev.success
        ? applyProgression(wsClone, rs, pipeline, base, ctx)
        : applyFailure(wsClone, rs, DEFAULT_FAILURE, ctx)

      if (weId) {
        await onlineDataClient.upsert<ProgressionEntryState>(
          'progression_entry_state',
          {
            routine_id: routineId,
            workout_entry_id: weId,
            current_rep_target: result.repset.currentRepTarget,
            current_rep_range_low: result.repset.currentRepRangeLow,
            current_rep_range_high: result.repset.currentRepRangeHigh,
            current_set_count: result.repset.currentSetCount,
            repset_pipeline_step_index: result.repset.repsetPipelineStepIndex,
            repset_step_completion_counter: result.repset.repsetStepCompletionCounter,
            last_session_entry_id: ev.entry.id,
          },
          'routine_id,workout_entry_id',
        )
      }

      if (ev === driving) advancedWeight = result.weight
    }

    await onlineDataClient.upsert<ProgressionState>(
      'progression_state',
      {
        routine_id: routineId,
        exercise_id: exerciseId,
        current_weight: advancedWeight.currentWeightLb,
        target_line_weight: advancedWeight.targetLineWeightLb,
        pipeline_step_index: advancedWeight.pipelineStepIndex,
        step_completion_counter: advancedWeight.stepCompletionCounter,
        failure_counter: advancedWeight.failureCounter,
        current_failure_response_index: advancedWeight.currentFailureResponseIndex,
        consolidation_counter: advancedWeight.consolidationCounter,
        progression_mode: advancedWeight.progressionMode,
        weight_frozen: advancedWeight.weightFrozen,
        last_session_entry_id: driving.entry.id,
      },
      'routine_id,exercise_id',
    )

    outcomes.push({
      exerciseId,
      fromLb,
      nextLb: advancedWeight.currentWeightLb,
    })
  }

  return outcomes
}
