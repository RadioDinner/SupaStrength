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
import {
  commitSessionProgression,
  type CommitEquipment,
  type ProgressionOutcome,
} from './sessionCommit'
import { advanceRotations, nextGymDay } from '../../engine/schedule'
import { maxLoadableLb, type PlateStock } from '../../engine/plates'
import { advanceRepLadder } from '../../engine/repLadder'
import type {
  ExerciseE1rm,
  ProgressionEntryState,
  ProgressionState,
  Session,
  SessionEntry,
  SetLog,
  Video,
  WorkoutEntry,
  WorkoutEntrySet,
} from '../types'

/** What `complete()` hands back for the end-of-session payoff sheet. */
export interface CompletionReport {
  outcomes: ProgressionOutcome[]
  /**
   * All-time best e1RM per exercise from `v_exercise_e1rm`, read after the
   * completion writes (so it includes this session). Empty when the read fails —
   * the payoff sheet just skips its record badges.
   */
  bestE1rmByExercise: Record<string, number>
}

interface Resolved {
  plannedWeight: number | null
  plannedReps: number | null
  plannedSets: number
}

/** Routine prescription: read the climbed weight/reps; consume a consolidation hold.
 * Before any progression state exists, the template's starting weight (9994)
 * prescribes the opener; the engine's line takes over after the first commit. */
async function resolvePlanned(routineId: string, we: WorkoutEntry): Promise<Resolved> {
  const ws = await onlineDataClient.getOne<ProgressionState>('progression_state', [
    { column: 'routine_id', op: 'eq', value: routineId },
    { column: 'exercise_id', op: 'eq', value: we.exercise_id },
  ])
  let plannedWeight = ws?.current_weight ?? we.starting_weight ?? null
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
  perSet?: WorkoutEntrySet[],
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

  // Per-set targets (9993) plan each set individually; otherwise the entry's
  // uniform prescription stamps every set.
  const setRows = perSet?.length
    ? perSet.map((t, i) => ({
        session_entry_id: se.id,
        set_index: t.set_index,
        is_warmup: false,
        is_completed: false,
        planned_reps: t.target_reps,
        planned_weight: t.target_weight,
        is_amrap: e.last_set_amrap && i === perSet.length - 1,
      }))
    : Array.from({ length: Math.max(1, resolved.plannedSets) }, (_, i) => ({
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

/**
 * Per-set targets for a batch of entries, keyed by entry id. Any entry with
 * rows plans its sessions from them — typed targets are what you get next
 * time. Rep-ladder entries additionally auto-advance them on completion;
 * engine-mode entries treat them as fixed manual targets.
 */
async function entrySetsByEntry(entries: WorkoutEntry[]): Promise<Map<string, WorkoutEntrySet[]>> {
  const ids = entries.map((e) => e.id)
  const m = new Map<string, WorkoutEntrySet[]>()
  if (ids.length === 0) return m
  const rows = await onlineDataClient.list<WorkoutEntrySet>('workout_entry_sets', {
    filters: [{ column: 'workout_entry_id', op: 'in', value: ids }],
    order: [{ column: 'set_index' }],
  })
  for (const r of rows) {
    const a = m.get(r.workout_entry_id) ?? []
    a.push(r)
    m.set(r.workout_entry_id, a)
  }
  return m
}

/**
 * Advance rep-ladder entries (9993) after completion: each set that hit its
 * target climbs a rep; when every set conquers the cap, the weight steps and
 * reps reset. Advanced targets write BACK to `workout_entry_sets`, so the
 * builder shows live state. Runs for routine AND single-workout sessions;
 * entries with incomplete ladder config (missing cap/increment/floor) hold.
 */
async function advanceLadders(
  ladderEntries: SessionEntry[],
  workoutEntryById: Map<string, WorkoutEntry>,
  setLogsByEntry: Map<string, SetLog[]>,
): Promise<void> {
  for (const se of ladderEntries) {
    const we = se.workout_entry_id ? workoutEntryById.get(se.workout_entry_id) : undefined
    if (!we || we.rep_cap == null || we.increment_lb == null || we.reps_after_increment == null)
      continue
    const targetRows = await onlineDataClient.list<WorkoutEntrySet>('workout_entry_sets', {
      filters: [{ column: 'workout_entry_id', op: 'eq', value: we.id }],
      order: [{ column: 'set_index' }],
    })
    if (targetRows.length === 0) continue

    const results = (setLogsByEntry.get(se.id) ?? [])
      .filter((l) => !l.is_warmup)
      .map((l) => ({ setIndex: l.set_index, achievedReps: l.actual_reps, completed: l.is_completed }))
    const advanced = advanceRepLadder(
      targetRows.map((r) => ({
        setIndex: r.set_index,
        targetReps: r.target_reps,
        targetWeight: r.target_weight,
      })),
      { repCap: we.rep_cap, incrementLb: we.increment_lb, repsAfterIncrement: we.reps_after_increment },
      results,
    )
    for (const row of targetRows) {
      const next = advanced.find((a) => a.setIndex === row.set_index)
      if (!next) continue
      if (next.targetReps !== row.target_reps || next.targetWeight !== row.target_weight) {
        await onlineDataClient.update<WorkoutEntrySet>(
          'workout_entry_sets',
          { target_reps: next.targetReps, target_weight: next.targetWeight },
          [{ column: 'id', op: 'eq', value: row.id }],
        )
      }
    }
  }
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

  /**
   * The most recent completed actuals per template entry, keyed
   * workout_entry_id → set_index → { weightLb, reps } — the builder's
   * PREVIOUS column. Looks back over the last 30 completed sessions.
   */
  async lastActuals(
    workoutEntryIds: string[],
  ): Promise<Record<string, Record<number, { weightLb: number | null; reps: number | null }>>> {
    if (workoutEntryIds.length === 0) return {}
    const recent = await this.recent(30)
    if (recent.length === 0) return {}
    const sessionIds = recent.map((s) => s.id)
    const sessionRank = new Map(sessionIds.map((sid, i) => [sid, i])) // 0 = newest
    const ses = await onlineDataClient.list<SessionEntry>('session_entries', {
      filters: [
        { column: 'session_id', op: 'in', value: sessionIds },
        { column: 'workout_entry_id', op: 'in', value: workoutEntryIds },
      ],
    })
    const newestByWe = new Map<string, SessionEntry>()
    for (const e of ses) {
      if (!e.workout_entry_id) continue
      const cur = newestByWe.get(e.workout_entry_id)
      if (
        !cur ||
        (sessionRank.get(e.session_id) ?? Infinity) < (sessionRank.get(cur.session_id) ?? Infinity)
      ) {
        newestByWe.set(e.workout_entry_id, e)
      }
    }
    if (newestByWe.size === 0) return {}
    const weBySessionEntry = new Map([...newestByWe.entries()].map(([we, e]) => [e.id, we]))
    const logs = await this.listSetLogs([...weBySessionEntry.keys()])
    const out: Record<string, Record<number, { weightLb: number | null; reps: number | null }>> = {}
    for (const l of logs) {
      if (l.is_warmup || !l.is_completed) continue
      const we = weBySessionEntry.get(l.session_entry_id)
      if (!we) continue
      ;(out[we] ??= {})[l.set_index] = { weightLb: l.actual_weight, reps: l.actual_reps }
    }
    return out
  },

  listSetLogs(entryIds: string[]): Promise<SetLog[]> {
    if (entryIds.length === 0) return Promise.resolve([])
    return onlineDataClient.list<SetLog>('set_logs', {
      filters: [{ column: 'session_entry_id', op: 'in', value: entryIds }],
      order: [{ column: 'set_index' }],
    })
  },

  /** Start a session from a single workout (no routine context → the template's
   * starting weight if set, else manual weight). */
  async startFromWorkout(workoutId: string, locationId: string | null): Promise<string> {
    const entries = await workoutsRepo.listEntries(workoutId)
    const rows = await onlineDataClient.insert<Session>('sessions', {
      location_id: locationId,
      status: 'in_progress',
      started_at: new Date().toISOString(),
    })
    const session = rows[0]
    if (!session) throw new Error('Session insert returned no row')
    const perSetByEntry = await entrySetsByEntry(entries)
    let position = 0
    for (const e of entries) {
      const perSet = perSetByEntry.get(e.id)
      if (perSet?.length) {
        await snapshotEntry(
          session.id,
          e,
          position++,
          {
            plannedWeight: perSet[0]!.target_weight,
            plannedReps: null,
            plannedSets: perSet.length,
          },
          perSet,
        )
      } else {
        await snapshotEntry(session.id, e, position++, {
          plannedWeight: e.starting_weight ?? null,
          plannedReps: e.rep_scheme === 'double' ? e.rep_range_low : e.rep_target,
          plannedSets: e.sets,
        })
      }
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
      const perSetByEntry = await entrySetsByEntry(entries)
      for (const e of entries) {
        const perSet = perSetByEntry.get(e.id)
        if (perSet?.length) {
          // Rep-ladder entries prescribe their own per-set targets — the
          // shared engine line doesn't apply to them.
          await snapshotEntry(
            session.id,
            e,
            position++,
            {
              plannedWeight: perSet[0]!.target_weight,
              plannedReps: null,
              plannedSets: perSet.length,
            },
            perSet,
          )
        } else {
          const resolved = await resolvePlanned(routineId, e)
          await snapshotEntry(session.id, e, position++, resolved)
        }
      }
    }
    return session.id
  },

  updateSetLog(id: string, patch: Partial<SetLog>): Promise<SetLog[]> {
    return onlineDataClient.update<SetLog>('set_logs', patch, [{ column: 'id', op: 'eq', value: id }])
  },

  /**
   * Complete the session: flip it to completed (compare-and-swap), then run
   * engine auto-progression (routine sessions) and advance the rotation
   * pointers. Returns the payoff-sheet report (progression outcomes + all-time
   * e1RM bests).
   *
   * The CAS flip comes FIRST so completion wins exactly once: a retry after a
   * partial failure — or a double tap — matches 0 rows and returns a no-op
   * report instead of advancing the weight line and rotation pointers a second
   * time. The trade-off is deliberate: if a later step fails, that advance is
   * lost for this session (the weight holds — safe, self-correcting) rather
   * than doubled (corrupted training state).
   */
  async complete(session: Session): Promise<CompletionReport> {
    const flipped = await onlineDataClient.update<Session>(
      'sessions',
      { status: 'completed', completed_at: new Date().toISOString() },
      [
        { column: 'id', op: 'eq', value: session.id },
        { column: 'status', op: 'eq', value: 'in_progress' },
      ],
    )
    if (flipped.length === 0) return { outcomes: [], bestE1rmByExercise: {} }

    const entries = await this.listEntries(session.id)
    let outcomes: ProgressionOutcome[] = []

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

    // Rep-ladder entries (9993) progress per set, independent of the shared
    // engine line — for routine AND single-workout sessions alike.
    const isLadder = (e: SessionEntry) =>
      !!e.workout_entry_id &&
      workoutEntryById.get(e.workout_entry_id)?.overload_mode === 'rep_ladder'
    await advanceLadders(entries.filter(isLadder), workoutEntryById, setLogsByEntry)

    // M5d: engine auto-progression (routine sessions with equipment only) —
    // over the non-ladder entries.
    if (session.routine_id && session.location_id) {
      const engineEntries = entries.filter((e) => !isLadder(e))
      const equipment = engineEntries.length ? await loadEquipment(session) : null
      if (equipment) {
        outcomes = await commitSessionProgression({
          routineId: session.routine_id,
          entries: engineEntries,
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

    // Record check for the payoff sheet — read the aggregated bests now that this
    // session's sets count. Garnish only: a failed read must not fail completion.
    let bestE1rmByExercise: Record<string, number> = {}
    const exerciseIds = [...new Set(entries.map((e) => e.exercise_id))]
    if (exerciseIds.length) {
      try {
        const rows = await onlineDataClient.list<ExerciseE1rm>('v_exercise_e1rm', {
          filters: [{ column: 'exercise_id', op: 'in', value: exerciseIds }],
        })
        bestE1rmByExercise = Object.fromEntries(
          rows.filter((r) => r.best_e1rm_lb != null).map((r) => [r.exercise_id, r.best_e1rm_lb]),
        )
      } catch {
        // ignore — the sheet shows without record badges
      }
    }

    return { outcomes, bestE1rmByExercise }
  },

  abandon(sessionId: string): Promise<Session[]> {
    return onlineDataClient.update<Session>('sessions', { status: 'abandoned' }, [
      { column: 'id', op: 'eq', value: sessionId },
    ])
  },

  /** The "as it happens" note on one exercise of a live session (9993). */
  updateEntryNotes(sessionEntryId: string, notes: string | null): Promise<SessionEntry[]> {
    return onlineDataClient.update<SessionEntry>('session_entries', { notes }, [
      { column: 'id', op: 'eq', value: sessionEntryId },
    ])
  },

  /**
   * Hard-delete a session (History → Delete). The DB cascade removes its
   * entries and set logs (migration 9996 allows owner deletes of completed
   * sessions); progression already applied by the session is NOT rolled back.
   *
   * Form videos need eager cleanup: the cascade only detaches them (both link
   * columns go null), leaving the row + storage object reachable by nothing in
   * the UI. Snapshot them before the delete, clean up after — best-effort,
   * object before row, because purge_expired_media() keys its storage deletes
   * off the rows (a row must never die before its object) and picks up
   * whatever this leaves behind at expires_at.
   */
  async delete(sessionId: string): Promise<void> {
    let videos: Video[] = []
    try {
      const entries = await this.listEntries(sessionId)
      const logs = await this.listSetLogs(entries.map((e) => e.id))
      const videoIds = [...new Set(logs.map((l) => l.video_id).filter((v): v is string => !!v))]
      if (videoIds.length) {
        videos = await onlineDataClient.list<Video>('videos', {
          filters: [{ column: 'id', op: 'in', value: videoIds }],
        })
      }
    } catch {
      videos = [] // the snapshot must never block the delete itself
    }

    await onlineDataClient.remove('sessions', [{ column: 'id', op: 'eq', value: sessionId }])

    if (videos.length) {
      await onlineDataClient
        .removeFiles(
          'form-videos',
          videos.map((v) => v.storage_path),
        )
        .catch(() => {})
      await onlineDataClient
        .remove('videos', [{ column: 'id', op: 'in', value: videos.map((v) => v.id) }])
        .catch(() => {})
    }
  },
}
