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

export interface Routine {
  id: string
  user_id: string
  name: string
  is_active: boolean
  notes: string | null
  archived_at: string | null
  created_at: string
  updated_at: string
}

export interface Rotation {
  id: string
  user_id: string
  routine_id: string
  position: number
  name: string | null
  current_index: number
  created_at: string
  updated_at: string
}

export interface RotationWorkout {
  id: string
  user_id: string
  rotation_id: string
  workout_id: string
  position: number
  created_at: string
  updated_at: string
}

export type ProgressionMode = 'weight' | 'reps_fallback'

export interface ProgressionState {
  id: string
  user_id: string
  routine_id: string
  exercise_id: string
  current_weight: number | null
  target_line_weight: number | null
  pipeline_step_index: number
  step_completion_counter: number
  failure_counter: number
  current_failure_response_index: number
  consolidation_counter: number
  progression_mode: ProgressionMode
  weight_frozen: boolean
  last_session_entry_id: string | null
  created_at: string
  updated_at: string
}

export interface ProgressionEntryState {
  id: string
  user_id: string
  routine_id: string
  workout_entry_id: string
  current_rep_target: number | null
  current_rep_range_low: number | null
  current_rep_range_high: number | null
  current_set_count: number | null
  repset_pipeline_step_index: number
  repset_step_completion_counter: number
  last_session_entry_id: string | null
  created_at: string
  updated_at: string
}

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

// ---------------------------------------------------------------------------
// Body progress: photos + measurements + reminders (BUILD_PLAN M8).
// ---------------------------------------------------------------------------

export type ReminderType = 'weigh_in' | 'measurements' | 'photos'

/** The numeric measurement columns (everything except bodyweight/body_fat_pct). */
export type GirthField =
  | 'neck'
  | 'shoulders'
  | 'chest'
  | 'waist'
  | 'hips'
  | 'arm_l'
  | 'arm_r'
  | 'thigh_l'
  | 'thigh_r'
  | 'calf_l'
  | 'calf_r'
  | 'forearm_l'
  | 'forearm_r'

export type MeasurementField = 'bodyweight' | 'body_fat_pct' | GirthField

export interface BodyMeasurement {
  id: string
  user_id: string
  taken_on: string
  bodyweight: number | null
  body_fat_pct: number | null
  neck: number | null
  shoulders: number | null
  chest: number | null
  waist: number | null
  hips: number | null
  arm_l: number | null
  arm_r: number | null
  thigh_l: number | null
  thigh_r: number | null
  calf_l: number | null
  calf_r: number | null
  forearm_l: number | null
  forearm_r: number | null
  extra: Record<string, number>
  note: string | null
  created_at: string
  updated_at: string
}

export interface ProgressPhoto {
  id: string
  user_id: string
  storage_path: string
  category: PhotoCategory
  custom_label: string | null
  taken_on: string
  mime_type: string | null
  size_bytes: number | null
  created_at: string
  updated_at: string
  expires_at: string
}

export interface Reminder {
  id: string
  user_id: string
  type: ReminderType
  cadence_days: number
  last_done_at: string | null
  enabled: boolean
  snooze_until: string | null
  created_at: string
  updated_at: string
}

/** `reminders_due` view = a Reminder plus the computed due flags. */
export interface ReminderDue extends Reminder {
  is_due: boolean
  due_since: string | null
}

/** Form-video attached to a logged set (BUILD_PLAN M7). Private storage. */
export interface Video {
  id: string
  user_id: string
  set_log_id: string | null
  storage_path: string
  duration_seconds: number
  mime_type: string | null
  size_bytes: number | null
  created_at: string
  updated_at: string
  expires_at: string
}

// ---------------------------------------------------------------------------
// Analytics (BUILD_PLAN M6). UI state + the read-only shapes of the computed
// `v_*` analytics views (DATA_MODEL §5). Views are never written to.
// ---------------------------------------------------------------------------

export type VolumeMetric = 'hard_sets' | 'tonnage' | 'total_reps'
export type TimeWindow = '7d' | '4wk' | '12wk' | 'all'
export type RadarMode = 'volume' | 'strength'
export type WeakestView = 'relative' | 'standards'
export type StandardBand = 'beginner' | 'novice' | 'intermediate' | 'advanced' | 'elite'
export type FrequencyDimension = 'workout' | 'exercise' | 'muscle'

export interface ChartPreferences {
  user_id: string
  volume_metric: VolumeMetric
  time_window: TimeWindow
  radar_mode: RadarMode
  weakest_view: WeakestView
  count_secondary: boolean
  created_at: string
  updated_at: string
}

/** One row per (user, muscle_group, week) — `v_muscle_volume_weekly`. */
export interface MuscleVolumeWeekly {
  user_id: string
  muscle_group_id: number
  week_start: string
  hard_sets: number
  hard_sets_primary: number
  tonnage_lb: number
  total_reps: number
}

/** Per-muscle best est-1RM among primary lifts — `v_muscle_strength`. */
export interface MuscleStrength {
  user_id: string
  muscle_group_id: number
  strength_e1rm_lb: number
}

/** Main-lift est-1RM vs the seeded standards bracket — `v_strength_vs_standards`. */
export interface StrengthVsStandards {
  user_id: string
  lift_key: LiftKey
  best_e1rm_lb: number
  bodyweight_lb: number | null
  novice_lb: number
  intermediate_lb: number
  advanced_lb: number
  elite_lb: number
  standard_band: StandardBand
}

/** Completed-session counts by dimension/window — `v_frequency`. */
export interface FrequencyRow {
  user_id: string
  time_window: TimeWindow
  dimension: FrequencyDimension
  key: string
  label: string | null
  cnt: number
}
