/**
 * Live session repository (BUILD_PLAN M5b–c). Starts a session from the active
 * routine's next gym day (or a single workout) — snapshotting each entry's
 * prescription into immutable `session_entries` and generating working `set_logs`
 * — records per-set actuals, and completes the session (advancing the routine's
 * rotation pointers via the pure, tested `engine/schedule`).
 *
 * Engine-driven weight auto-progression (`progression_state` + applyProgression)
 * is M5d — see HANDOFF. For now weight is entered in-gym (the plate calculator
 * assists) and the rotation advances on completion.
 */
import { onlineDataClient } from '../online/supabaseDataClient'
import { workoutsRepo } from './workoutsRepo'
import { routinesRepo } from './routinesRepo'
import { advanceRotations, nextGymDay } from '../../engine/schedule'
import type { Session, SessionEntry, SetLog, WorkoutEntry } from '../types'

async function snapshotEntries(
  sessionId: string,
  entries: WorkoutEntry[],
  startPosition: number,
): Promise<number> {
  let position = startPosition
  for (const e of entries) {
    const plannedReps =
      e.rep_scheme === 'straight' ? e.rep_target : e.rep_scheme === 'double' ? e.rep_range_low : null

    const seRows = await onlineDataClient.insert<SessionEntry>('session_entries', {
      session_id: sessionId,
      workout_id: e.workout_id,
      workout_entry_id: e.id,
      exercise_id: e.exercise_id,
      position,
      planned_sets: e.sets,
      planned_rep_scheme: e.rep_scheme,
      planned_rep_target: e.rep_target,
      planned_rep_low: e.rep_range_low,
      planned_rep_high: e.rep_range_high,
      planned_weight: null,
      planned_rest_seconds: e.rest_seconds,
      last_set_amrap: e.last_set_amrap,
    })
    const se = seRows[0]
    position += 1
    if (!se) continue

    const setRows = Array.from({ length: Math.max(1, e.sets) }, (_, i) => ({
      session_entry_id: se.id,
      set_index: i + 1,
      is_warmup: false,
      is_completed: false,
      planned_reps: plannedReps,
      planned_weight: null,
      is_amrap: e.last_set_amrap && i === e.sets - 1,
    }))
    await onlineDataClient.insert<SetLog>('set_logs', setRows)
  }
  return position
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

  /** Start a session from a single workout (no routine context). */
  async startFromWorkout(workoutId: string, locationId: string | null): Promise<string> {
    const entries = await workoutsRepo.listEntries(workoutId)
    const rows = await onlineDataClient.insert<Session>('sessions', {
      location_id: locationId,
      status: 'in_progress',
      started_at: new Date().toISOString(),
    })
    const session = rows[0]
    if (!session) throw new Error('Session insert returned no row')
    await snapshotEntries(session.id, entries, 0)
    return session.id
  },

  /** Start the active routine's next gym day (the union of every rotation's head). */
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
      position = await snapshotEntries(session.id, entries, position)
    }
    return session.id
  },

  updateSetLog(id: string, patch: Partial<SetLog>): Promise<SetLog[]> {
    return onlineDataClient.update<SetLog>('set_logs', patch, [{ column: 'id', op: 'eq', value: id }])
  },

  /**
   * Complete the session (immutable thereafter) and advance the routine's rotation
   * pointers by one (pure `engine/schedule`). Engine weight/rep progression is M5d.
   */
  async complete(session: Session): Promise<void> {
    if (session.routine_id) {
      const rotations = await routinesRepo.listRotations(session.routine_id)
      const lists = await Promise.all(rotations.map((r) => routinesRepo.listRotationWorkouts(r.id)))
      const engineRotations = rotations.map((r, i) => ({
        id: r.id,
        currentIndex: r.current_index,
        workoutIds: (lists[i] ?? []).map((w) => w.workout_id),
      }))
      const advanced = advanceRotations(engineRotations)
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
