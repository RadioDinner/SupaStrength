/**
 * Routine / rotation scheduler repository (BUILD_PLAN M4). A routine is one or
 * more independent rotations; each rotation is an ordered list of workouts with a
 * `current_index` pointer. "Next gym day" = the head of every rotation; completing
 * a session advances every pointer. The pointer math is the pure, tested
 * `engine/schedule` — this repo just persists it.
 */
import { onlineDataClient } from '../online/supabaseDataClient'
import { advanceRotations, nextGymDay, type Rotation as EngineRotation } from '../../engine/schedule'
import type { Rotation, RotationWorkout, Routine } from '../types'

export const routinesRepo = {
  list(): Promise<Routine[]> {
    return onlineDataClient.list<Routine>('routines', {
      filters: [{ column: 'archived_at', op: 'is', value: null }],
      order: [{ column: 'created_at' }],
    })
  },

  get(id: string): Promise<Routine | null> {
    return onlineDataClient.getOne<Routine>('routines', [{ column: 'id', op: 'eq', value: id }])
  },

  async create(name: string): Promise<Routine> {
    const rows = await onlineDataClient.insert<Routine>('routines', { name: name.trim() })
    const row = rows[0]
    if (!row) throw new Error('Routine insert returned no row')
    return row
  },

  /**
   * Activate a routine, deactivating any other active one first (the partial
   * unique `(user_id) where is_active` allows ≤1 active per user, and is not
   * deferrable — so deactivate, then activate, in that order).
   */
  async setActive(id: string): Promise<void> {
    await onlineDataClient.update<Routine>('routines', { is_active: false }, [
      { column: 'is_active', op: 'eq', value: true },
    ])
    await onlineDataClient.update<Routine>('routines', { is_active: true }, [
      { column: 'id', op: 'eq', value: id },
    ])
  },

  archive(id: string): Promise<Routine[]> {
    return onlineDataClient.update<Routine>('routines', { archived_at: new Date().toISOString() }, [
      { column: 'id', op: 'eq', value: id },
    ])
  },

  // ── rotations ────────────────────────────────────────────────────────────
  listRotations(routineId: string): Promise<Rotation[]> {
    return onlineDataClient.list<Rotation>('rotations', {
      filters: [{ column: 'routine_id', op: 'eq', value: routineId }],
      order: [{ column: 'position' }],
    })
  },

  async addRotation(routineId: string, name: string | null): Promise<Rotation> {
    const existing = await this.listRotations(routineId)
    const position = existing.reduce((max, r) => Math.max(max, r.position), -1) + 1
    const rows = await onlineDataClient.insert<Rotation>('rotations', {
      routine_id: routineId,
      position,
      name,
      current_index: 0,
    })
    const row = rows[0]
    if (!row) throw new Error('Rotation insert returned no row')
    return row
  },

  removeRotation(id: string): Promise<void> {
    return onlineDataClient.remove('rotations', [{ column: 'id', op: 'eq', value: id }])
  },

  // ── rotation workouts ──────────────────────────────────────────────────────
  listRotationWorkouts(rotationId: string): Promise<RotationWorkout[]> {
    return onlineDataClient.list<RotationWorkout>('rotation_workouts', {
      filters: [{ column: 'rotation_id', op: 'eq', value: rotationId }],
      order: [{ column: 'position' }],
    })
  },

  async addRotationWorkout(rotationId: string, workoutId: string): Promise<RotationWorkout> {
    const existing = await this.listRotationWorkouts(rotationId)
    const position = existing.reduce((max, rw) => Math.max(max, rw.position), -1) + 1
    const rows = await onlineDataClient.insert<RotationWorkout>('rotation_workouts', {
      rotation_id: rotationId,
      workout_id: workoutId,
      position,
    })
    const row = rows[0]
    if (!row) throw new Error('Rotation workout insert returned no row')
    return row
  },

  removeRotationWorkout(id: string): Promise<void> {
    return onlineDataClient.remove('rotation_workouts', [{ column: 'id', op: 'eq', value: id }])
  },

  /**
   * Advance every rotation pointer by one (the pure `engine/schedule` advance),
   * persisting the new `current_index`. Normally driven by session completion;
   * exposed here so the routine can be stepped/previewed.
   */
  async advanceAll(engineRotations: EngineRotation[]): Promise<void> {
    const advanced = advanceRotations(engineRotations)
    for (const r of advanced) {
      await onlineDataClient.update<Rotation>('rotations', { current_index: r.currentIndex }, [
        { column: 'id', op: 'eq', value: r.id },
      ])
    }
  },
}

export { nextGymDay }
export type { EngineRotation }
