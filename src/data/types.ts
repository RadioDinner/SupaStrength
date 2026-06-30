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
