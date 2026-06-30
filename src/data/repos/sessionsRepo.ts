/**
 * Live session repository (BUILD_PLAN M5b–d). Starts a session from the active
 * routine's next gym day (or a single workout), records per-set actuals, and
 * completes the session — driving the engine auto-progression.
 *
 * - **M5b/c:** snapshot entries → `session_entries` + `set_logs`; per-set logging.
 * - **M5d:** routine sessions prescribe the climbed weight/reps from
 *   `progression_state` / `progression_entry_state` at build time, and on complete
 *   run the engine to advance those rows (see `sessionCommit.ts`). Single-workout
 *   sessions (no routine) stay manual.
 */
import { onlineDataClient } from '../online/supabaseDataClient'
import { workoutsRepo } from './workoutsRepo'
import { routinesRepo } from './routinesRepo'
import { equipmentRepo } from './equipmentRepo'
import { commitSessionProgression, type CommitEquipment } from './sessionCommit'
import { advanceRotations, nextGymDay } from '../../engine/schedule'
import { maxLoadableLb, type PlateStock } from '../../engine/plates'
import type {
  ProgressionEntryState,
  ProgressionState,
  Session,
  SessionEntry,
  SetLog,
  WorkoutEntry,
} from '../types'

interface Resolved {
  plannedWeight: number | null
  plannedReps: number | null
  plannedSets: number
}

/** Routine prescription: read the climbed weight/reps; consume a consolidation hold. */
async function resolvePlanned(routineId: string, we: WorkoutEntry): Promise<Resolved> {
  const ws = await onlineDataClient.getOne<ProgressionState>('progression_state', [
    { column: 'routine_id', op: 'eq', value: routineId },
    { column: 'exercise_id', op: 'eq', value: we.exercise_id },
  ])
  let plannedWeight = ws?.current_weight ?? null
  if (ws && ws.consolidation_counter > 0) {
    plannedWeight = ws.current_weight // hold the rounded weight an extra session
    await onlineDataClient.update<ProgressionState>(
      'progression_state',
      { consolidation_counter: ws.consolidation_counter - 1 },
      [{ column: 'id', op: 'eq', value: ws.id }],
    )
  }

  const es = await onlineDataClient.getOne<ProgressionEntryState>('progression_entry_state', [
    { column: 'routine_id', op: 'eq', value: routineId },
    { column: 'workout_entry_id', op: 'eq', value: we.id },
  ])
  const plannedSets = es?.current_set_count ?? we.sets
  const plannedReps =
    es?.current_rep_target ??
    (we.rep_scheme === 'double' ? we.rep_range_low : we.rep_target) ??
    null

  return { plannedWeight, plannedReps, plannedSets }
}

async function snapshotEntry(
  sessionId: string,
  e: WorkoutEntry,
  position: number,
  resolved: Resolved,
): Promise<void> {
  const seRows = await onlineDataClient.insert<SessionEntry>('session_entries', {
    session_id: sessionId,
    workout_id: e.workout_id,
    workout_entry_id: e.id,
    exercise_id: e.exercise_id,
    position,
    planned_sets: resolved.plannedSets,
    planned_rep_scheme: e.rep_scheme,
    planned_rep_target: e.rep_target,
    planned_rep_low: e.rep_range_low,
    planned_rep_high: e.rep_range_high,
    planned_weight: resolved.plannedWeight,
    planned_rest_seconds: e.rest_seconds,
    last_set_amrap: e.last_set_amrap,
  })
  const se = seRows[0]
  if (!se) return

  const setRows = Array.from({ length: Math.max(1, resolved.plannedSets) }, (_, i) => ({
    session_entry_id: se.id,
    set_index: i + 1,
    is_warmup: false,
    is_completed: false,
    planned_reps: resolved.plannedReps,
    planned_weight: resolved.plannedWeight,
    is_amrap: e.last_set_amrap && i === resolved.plannedSets - 1,
  }))
  await onlineDataClient.insert<SetLog>('set_logs', setRows)
}

async function loadEquipment(session: Session): Promise<CommitEquipment | null> {
  if (!session.location_id) return null
  const [barbells, plates, prefs] = await Promise.all([
    equipmentRepo.listBarbells(session.location_id),
    equipmentRepo.listPlates(session.location_id),
    equipmentRepo.getPreferences(session.user_id),
  ])
  const bar = barbells.find((b) => b.is_default) ?? barbells[0]
  if (!bar) return null
  const inventory: PlateStock[] = plates.map((p) => ({
    denominationLb: p.denomination_lb,
    quantity: p.quantity,
  }))
  const micros = prefs?.micro_plates_enabled ?? false
  return {
    barbellLb: bar.weight_lb,
    inventory,
    microPlatesEnabled: micros,
    roundingDirection: prefs?.rounding_direction ?? 'down',
    maxLoadableLb: maxLoadableLb(bar.weight_lb, inventory, micros),
    ceilingBehavior: prefs?.ceiling_behavior ?? 'hold_warn',
  }
}

export const sessionsRepo = {
  getActive(): Promise<Session | null> {
    return onlineDataClient
      .list<Session>('sessions', {
        filters: [{ column: 'status', op: 'eq', value: 'in_progress' }],
        order: [{ column: 'started_at', ascending: false }],
        limit: 1,
      })
      .then((rows) => rows[0] ?? null)
  },

  get(id: string): Promise<Session | null> {
    return onlineDataClient.getOne<Session>('sessions', [{ column: 'id', op: 'eq', value: id }])
  },

  recent(limit = 10): Promise<Session[]> {
    return onlineDataClient.list<Session>('sessions', {
      filters: [{ column: 'status', op: 'eq', value: 'completed' }],
      order: [{ column: 'performed_on', ascending: false }],
      limit,
    })
  },

  listEntries(sessionId: string): Promise<SessionEntry[]> {
    return onlineDataClient.list<SessionEntry>('session_entries', {
      filters: [{ column: 'session_id', op: 'eq', value: sessionId }],
      order: [{ column: 'position' }],
    })
  },

  listSetLogs(entryIds: string[]): Promise<SetLog[]> {
    if (entryIds.length === 0) return Promise.resolve([])
    return onlineDataClient.list<SetLog>('set_logs', {
      filters: [{ column: 'session_entry_id', op: 'in', value: entryIds }],
      order: [{ column: 'set_index' }],
    })
  },

  /** Start a session from a single workout (no routine context → manual weight). */
  async startFromWorkout(workoutId: string, locationId: string | null): Promise<string> {
    const entries = await workoutsRepo.listEntries(workoutId)
    const rows = await onlineDataClient.insert<Session>('sessions', {
      location_id: locationId,
      status: 'in_progress',
      started_at: new Date().toISOString(),
    })
    const session = rows[0]
    if (!session) throw new Error('Session insert returned no row')
    let position = 0
    for (const e of entries) {
      await snapshotEntry(session.id, e, position++, {
        plannedWeight: null,
        plannedReps: e.rep_scheme === 'double' ? e.rep_range_low : e.rep_target,
        plannedSets: e.sets,
      })
    }
    return session.id
  },

  /** Start the active routine's next gym day — prescribing the climbed weight/reps. */
  async startNextGymDay(routineId: string, locationId: string | null): Promise<string> {
    const rotations = await routinesRepo.listRotations(routineId)
    const lists = await Promise.all(rotations.map((r) => routinesRepo.listRotationWorkouts(r.id)))
    const engineRotations = rotations.map((r, i) => ({
      id: r.id,
      currentIndex: r.current_index,
      workoutIds: (lists[i] ?? []).map((w) => w.workout_id),
    }))
    const day = nextGymDay(engineRotations)

    const rows = await onlineDataClient.insert<Session>('sessions', {
      routine_id: routineId,
      location_id: locationId,
      status: 'in_progress',
      started_at: new Date().toISOString(),
    })
    const session = rows[0]
    if (!session) throw new Error('Session insert returned no row')

    let position = 0
    for (const d of day) {
      const entries = await workoutsRepo.listEntries(d.workoutId)
      for (const e of entries) {
        const resolved = await resolvePlanned(routineId, e)
        await snapshotEntry(session.id, e, position++, resolved)
      }
    }
    return session.id
  },

  updateSetLog(id: string, patch: Partial<SetLog>): Promise<SetLog[]> {
    return onlineDataClient.update<SetLog>('set_logs', patch, [{ column: 'id', op: 'eq', value: id }])
  },

  /**
   * Complete the session: run engine auto-progression (routine sessions), advance
   * the rotation pointers, then flip the session to completed (immutable).
   */
  async complete(session: Session): Promise<void> {
    const entries = await this.listEntries(session.id)

    // M5d: engine auto-progression (routine sessions with equipment only).
    if (session.routine_id && session.location_id) {
      const equipment = await loadEquipment(session)
      if (equipment) {
        const logs = await this.listSetLogs(entries.map((e) => e.id))
        const setLogsByEntry = new Map<string, SetLog[]>()
        for (const l of logs) {
          const arr = setLogsByEntry.get(l.session_entry_id) ?? []
          arr.push(l)
          setLogsByEntry.set(l.session_entry_id, arr)
        }
        const weIds = entries.map((e) => e.workout_entry_id).filter((x): x is string => !!x)
        const workoutEntries = weIds.length
          ? await onlineDataClient.list<WorkoutEntry>('workout_entries', {
              filters: [{ column: 'id', op: 'in', value: weIds }],
            })
          : []
        const workoutEntryById = new Map(workoutEntries.map((w) => [w.id, w]))
        await commitSessionProgression({
          routineId: session.routine_id,
          entries,
          setLogsByEntry,
          workoutEntryById,
          equipment,
        })
      }
    }

    // Advance the rotation pointers.
    if (session.routine_id) {
      const rotations = await routinesRepo.listRotations(session.routine_id)
      const lists = await Promise.all(rotations.map((r) => routinesRepo.listRotationWorkouts(r.id)))
      const advanced = advanceRotations(
        rotations.map((r, i) => ({
          id: r.id,
          currentIndex: r.current_index,
          workoutIds: (lists[i] ?? []).map((w) => w.workout_id),
        })),
      )
      for (const r of advanced) {
        await onlineDataClient.update('rotations', { current_index: r.currentIndex }, [
          { column: 'id', op: 'eq', value: r.id },
        ])
      }
    }

    await onlineDataClient.update<Session>(
      'sessions',
      { status: 'completed', completed_at: new Date().toISOString() },
      [{ column: 'id', op: 'eq', value: session.id }],
    )
  },

  abandon(sessionId: string): Promise<Session[]> {
    return onlineDataClient.update<Session>('sessions', { status: 'abandoned' }, [
      { column: 'id', op: 'eq', value: sessionId },
    ])
  },
}
