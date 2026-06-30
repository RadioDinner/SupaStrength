/**
 * Hand-written row types for the tables M1 touches. (Phase 0.3 will later
 * replace/augment these with `supabase gen types typescript` output once the
 * project is linked via the Supabase CLI.)
 *
 * Postgres `numeric` columns come back as JS `number` via PostgREST.
 */

export type Sex = 'male' | 'female'
export type UnitSystem = 'imperial' | 'metric'
export type PhotoCategory = 'front' | 'side' | 'back' | 'custom'
export type RoundingDirection = 'up' | 'down'
export type CeilingBehavior = 'hold_warn' | 'auto_switch_reps'

export type MovementType =
  | 'barbell'
  | 'dumbbell'
  | 'machine'
  | 'cable'
  | 'bodyweight'
  | 'weighted_bodyweight'
  | 'assisted'
  | 'timed_cardio'
export type LoadingStyle =
  | 'barbell'
  | 'dumbbell'
  | 'plate_loaded'
  | 'stack'
  | 'bodyweight'
  | 'banded'
  | 'timed'
export type LiftKey = 'squat' | 'bench' | 'deadlift' | 'ohp' | 'row'
export type MuscleRole = 'primary' | 'secondary'

export interface Exercise {
  id: string
  user_id: string | null
  slug: string
  name: string
  movement_type: MovementType
  loading_style: LoadingStyle
  default_barbell_id: string | null
  is_loaded: boolean
  is_unilateral: boolean
  lift_key: LiftKey | null
  instructions: string | null
  default_rest_seconds: number | null
  is_seed: boolean
  is_custom: boolean
  created_at: string
  updated_at: string
}

export interface MuscleGroup {
  id: number
  group_key: string
  display_name: string
  radar_order: number
}

export interface ExerciseMuscle {
  exercise_id: string
  muscle_group_id: number
  role: MuscleRole
  weight: number
}

export type RepScheme = 'straight' | 'double' | 'rpe'
export type SessionStatus = 'in_progress' | 'completed' | 'abandoned'

export interface Workout {
  id: string
  user_id: string
  name: string
  notes: string | null
  archived_at: string | null
  created_at: string
  updated_at: string
}

export interface WorkoutEntry {
  id: string
  user_id: string
  workout_id: string
  exercise_id: string
  position: number
  sets: number
  rep_scheme: RepScheme
  rep_target: number | null
  rep_range_low: number | null
  rep_range_high: number | null
  target_rpe: number | null
  rest_seconds: number | null
  last_set_amrap: boolean
  barbell_id_override: string | null
  ceiling_behavior_override: CeilingBehavior | null
  consolidation_enabled: boolean
  consolidation_sessions: number
  notes: string | null
  created_at: string
  updated_at: string
}

export interface Session {
  id: string
  user_id: string
  routine_id: string | null
  location_id: string | null
  performed_on: string
  started_at: string | null
  completed_at: string | null
  status: SessionStatus
  notes: string | null
  created_at: string
  updated_at: string
}

export interface SessionEntry {
  id: string
  user_id: string
  session_id: string
  workout_id: string | null
  workout_entry_id: string | null
  exercise_id: string
  position: number
  planned_sets: number | null
  planned_rep_scheme: RepScheme | null
  planned_rep_target: number | null
  planned_rep_low: number | null
  planned_rep_high: number | null
  planned_weight: number | null
  planned_rest_seconds: number | null
  last_set_amrap: boolean
  was_failure: boolean
  was_consolidation_hold: boolean
  created_at: string
  updated_at: string
}

export interface SetLog {
  id: string
  user_id: string
  session_entry_id: string
  set_index: number
  is_warmup: boolean
  is_completed: boolean
  planned_reps: number | null
  actual_reps: number | null
  planned_weight: number | null
  actual_weight: number | null
  rest_taken_seconds: number | null
  is_amrap: boolean
  amrap_reps: number | null
  rpe: number | null
  completed_at: string | null
  video_id: string | null
  created_at: string
  updated_at: string
}

export interface UserProfile {
  user_id: string
  display_name: string | null
  sex: Sex
  birthdate: string | null
  height_in: number | null
  bodyweight_lb: number | null
  bodyweight_updated_at: string | null
  unit_system: UnitSystem
  default_photo_category: PhotoCategory
  reminders_enabled: boolean
  show_post_workout_nudges: boolean
  video_retention_days: number
  photo_retention_days: number
  created_at: string
  updated_at: string
}

export interface EquipmentPreferences {
  user_id: string
  rounding_direction: RoundingDirection
  micro_plates_enabled: boolean
  ceiling_behavior: CeilingBehavior
  created_at: string
  updated_at: string
}

export interface Location {
  id: string
  user_id: string
  name: string
  is_default: boolean
  is_archived: boolean
  sort_order: number
  created_at: string
  updated_at: string
}

export interface Barbell {
  id: string
  user_id: string
  location_id: string
  name: string
  weight_lb: number
  is_default: boolean
  is_archived: boolean
  sort_order: number
  created_at: string
  updated_at: string
}

export interface PlateInventory {
  id: string
  user_id: string
  location_id: string
  denomination_lb: number
  quantity: number
  created_at: string
  updated_at: string
}

export interface Dumbbell {
  id: string
  user_id: string
  location_id: string
  weight_lb: number
  quantity: number
  is_adjustable: boolean
  created_at: string
  updated_at: string
}
