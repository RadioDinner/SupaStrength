/**
 * Workout templates repository (BUILD_PLAN M3). A workout is an ordered list of
 * `workout_entries` — each an exercise + its *prescription* (sets, rep scheme,
 * rest, AMRAP). There is deliberately NO weight here: weight is born in the
 * session (the engine), never the template.
 */
import { onlineDataClient } from '../online/supabaseDataClient'
import type { RepScheme, Workout, WorkoutEntry } from '../types'

export interface NewEntry {
  exerciseId: string
  sets: number
  repScheme: RepScheme
  repTarget?: number | null
  repRangeLow?: number | null
  repRangeHigh?: number | null
  restSeconds?: number | null
  lastSetAmrap?: boolean
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
    })
    const row = rows[0]
    if (!row) throw new Error('Entry insert returned no row')
    return row
  },

  removeEntry(entryId: string): Promise<void> {
    return onlineDataClient.remove('workout_entries', [{ column: 'id', op: 'eq', value: entryId }])
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
