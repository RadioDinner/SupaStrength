/**
 * Exercise library repository (BUILD_PLAN M2). Reads the global seed library +
 * the user's custom exercises (RLS exposes both), supports name search (trigram
 * index via ILIKE) + movement-type filter, and creates custom exercises that can
 * shadow a seed slug.
 */
import { onlineDataClient } from '../online/supabaseDataClient'
import type {
  Exercise,
  ExerciseMuscle,
  LoadingStyle,
  MovementType,
  MuscleGroup,
  MuscleRole,
} from '../types'

export interface ExerciseQuery {
  search?: string
  movementType?: MovementType | null
  limit?: number
}

const slugify = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')

export interface NewCustomExercise {
  name: string
  movementType: MovementType
  loadingStyle: LoadingStyle
  isLoaded: boolean
  isUnilateral?: boolean
  /** muscle_group_id → role (primary/secondary). At least one primary required. */
  muscles: { muscleGroupId: number; role: MuscleRole }[]
}

export const exercisesRepo = {
  list(q: ExerciseQuery = {}): Promise<Exercise[]> {
    const filters = []
    if (q.search?.trim()) {
      filters.push({ column: 'name', op: 'ilike' as const, value: `%${q.search.trim()}%` })
    }
    if (q.movementType) {
      filters.push({ column: 'movement_type', op: 'eq' as const, value: q.movementType })
    }
    return onlineDataClient.list<Exercise>('exercises', {
      filters,
      order: [{ column: 'name' }],
      limit: q.limit ?? 100,
    })
  },

  listMuscleGroups(): Promise<MuscleGroup[]> {
    return onlineDataClient.list<MuscleGroup>('muscle_groups', {
      order: [{ column: 'radar_order' }],
    })
  },

  listMusclesFor(exerciseId: string): Promise<ExerciseMuscle[]> {
    return onlineDataClient.list<ExerciseMuscle>('exercise_muscles', {
      filters: [{ column: 'exercise_id', op: 'eq', value: exerciseId }],
    })
  },

  /**
   * Create a custom exercise (owned; user_id defaults to auth.uid()) plus its
   * muscle map. The slug may shadow a seed slug — `unique (user_id, slug)` holds.
   */
  async createCustom(input: NewCustomExercise): Promise<Exercise> {
    const rows = await onlineDataClient.insert<Exercise>('exercises', {
      slug: slugify(input.name),
      name: input.name.trim(),
      movement_type: input.movementType,
      loading_style: input.loadingStyle,
      is_loaded: input.isLoaded,
      is_unilateral: input.isUnilateral ?? false,
      is_seed: false,
    })
    const exercise = rows[0]
    if (!exercise) throw new Error('Exercise insert returned no row')

    if (input.muscles.length > 0) {
      await onlineDataClient.insert<ExerciseMuscle>(
        'exercise_muscles',
        input.muscles.map((m) => ({
          exercise_id: exercise.id,
          muscle_group_id: m.muscleGroupId,
          role: m.role,
          weight: m.role === 'primary' ? 1.0 : 0.5,
        })),
      )
    }
    return exercise
  },
}
