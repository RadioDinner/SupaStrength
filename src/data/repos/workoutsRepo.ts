/**
 * Workout templates repository (BUILD_PLAN M3). A workout is an ordered list of
 * `workout_entries` — each an exercise + its *prescription* (sets, rep scheme,
 * rest, AMRAP). Working weight lives in the session (the engine), not the
 * template — with one seed: an optional `starting_weight` that prescribes the
 * first session until progression state exists (migration 9994).
 */
import { onlineDataClient } from '../online/supabaseDataClient'
import type { RepScheme, Workout, WorkoutEntry, WorkoutEntrySet } from '../types'

export interface NewEntry {
  exerciseId: string
  sets: number
  repScheme: RepScheme
  repTarget?: number | null
  repRangeLow?: number | null
  repRangeHigh?: number | null
  restSeconds?: number | null
  lastSetAmrap?: boolean
  startingWeight?: number | null
}

export const workoutsRepo = {
  list(): Promise<Workout[]> {
    return onlineDataClient.list<Workout>('workouts', {
      filters: [{ column: 'archived_at', op: 'is', value: null }],
      order: [{ column: 'created_at' }],
    })
  },

  get(id: string): Promise<Workout | null> {
    return onlineDataClient.getOne<Workout>('workouts', [{ column: 'id', op: 'eq', value: id }])
  },

  async create(name: string): Promise<Workout> {
    const rows = await onlineDataClient.insert<Workout>('workouts', { name: name.trim() })
    const row = rows[0]
    if (!row) throw new Error('Workout insert returned no row')
    return row
  },

  rename(id: string, name: string): Promise<Workout[]> {
    return onlineDataClient.update<Workout>('workouts', { name: name.trim() }, [
      { column: 'id', op: 'eq', value: id },
    ])
  },

  archive(id: string): Promise<Workout[]> {
    return onlineDataClient.update<Workout>('workouts', { archived_at: new Date().toISOString() }, [
      { column: 'id', op: 'eq', value: id },
    ])
  },

  // ── entries ──────────────────────────────────────────────────────────────
  listEntries(workoutId: string): Promise<WorkoutEntry[]> {
    return onlineDataClient.list<WorkoutEntry>('workout_entries', {
      filters: [{ column: 'workout_id', op: 'eq', value: workoutId }],
      order: [{ column: 'position' }],
    })
  },

  async addEntry(workoutId: string, entry: NewEntry): Promise<WorkoutEntry> {
    const existing = await this.listEntries(workoutId)
    const position = existing.reduce((max, e) => Math.max(max, e.position), -1) + 1
    const rows = await onlineDataClient.insert<WorkoutEntry>('workout_entries', {
      workout_id: workoutId,
      exercise_id: entry.exerciseId,
      position,
      sets: entry.sets,
      rep_scheme: entry.repScheme,
      rep_target: entry.repScheme === 'straight' ? (entry.repTarget ?? null) : null,
      rep_range_low: entry.repScheme === 'double' ? (entry.repRangeLow ?? null) : null,
      rep_range_high: entry.repScheme === 'double' ? (entry.repRangeHigh ?? null) : null,
      rest_seconds: entry.restSeconds ?? null,
      last_set_amrap: entry.lastSetAmrap ?? false,
      starting_weight: entry.startingWeight ?? null,
    })
    const row = rows[0]
    if (!row) throw new Error('Entry insert returned no row')
    return row
  },

  listEntriesByIds(ids: string[]): Promise<WorkoutEntry[]> {
    if (ids.length === 0) return Promise.resolve([])
    return onlineDataClient.list<WorkoutEntry>('workout_entries', {
      filters: [{ column: 'id', op: 'in', value: ids }],
    })
  },

  /** On-the-fly entry edits: sticky note, overload mode/knobs, set count. */
  updateEntry(entryId: string, patch: Partial<WorkoutEntry>): Promise<WorkoutEntry[]> {
    return onlineDataClient.update<WorkoutEntry>('workout_entries', patch, [
      { column: 'id', op: 'eq', value: entryId },
    ])
  },

  removeEntry(entryId: string): Promise<void> {
    return onlineDataClient.remove('workout_entries', [{ column: 'id', op: 'eq', value: entryId }])
  },

  // ── per-set targets (9993) ─────────────────────────────────────────────────
  listEntrySets(entryId: string): Promise<WorkoutEntrySet[]> {
    return onlineDataClient.list<WorkoutEntrySet>('workout_entry_sets', {
      filters: [{ column: 'workout_entry_id', op: 'eq', value: entryId }],
      order: [{ column: 'set_index' }],
    })
  },

  /**
   * Replace an entry's per-set targets: upsert rows 1..n on
   * (workout_entry_id, set_index), then drop any leftovers past n.
   */
  async saveEntrySets(
    entryId: string,
    rows: { targetReps: number; targetWeight: number | null }[],
  ): Promise<void> {
    if (rows.length > 0) {
      await onlineDataClient.upsert<WorkoutEntrySet>(
        'workout_entry_sets',
        rows.map((r, i) => ({
          workout_entry_id: entryId,
          set_index: i + 1,
          target_reps: r.targetReps,
          target_weight: r.targetWeight,
        })),
        'workout_entry_id,set_index',
      )
    }
    await onlineDataClient.remove('workout_entry_sets', [
      { column: 'workout_entry_id', op: 'eq', value: entryId },
      { column: 'set_index', op: 'gt', value: rows.length },
    ])
  },

  /**
   * Swap two entries' positions. The (workout_id, position) unique index is
   * DEFERRABLE, but the seam runs each update in its own transaction, so a
   * direct two-write swap would collide at commit. Route through a temporary
   * negative sentinel so every write is collision-free on its own.
   */
  async swapPositions(
    a: { id: string; position: number },
    b: { id: string; position: number },
  ): Promise<void> {
    const TEMP = -1
    const set = (id: string, position: number) =>
      onlineDataClient.update<WorkoutEntry>('workout_entries', { position }, [
        { column: 'id', op: 'eq', value: id },
      ])
    await set(a.id, TEMP)
    await set(b.id, a.position)
    await set(a.id, b.position)
  },
}
