/**
 * Movement-type UI metadata shared by the exercise browser and the workout
 * builder's inline exercise creator: display labels plus the loading-style /
 * is-loaded defaults derived from each movement type.
 */
import type { LoadingStyle, MovementType } from '../../data/types'

export const MOVEMENTS: { value: MovementType; label: string }[] = [
  { value: 'barbell', label: 'Barbell' },
  { value: 'dumbbell', label: 'Dumbbell' },
  { value: 'machine', label: 'Machine' },
  { value: 'cable', label: 'Cable' },
  { value: 'bodyweight', label: 'Bodyweight' },
  { value: 'weighted_bodyweight', label: 'Weighted bodyweight' },
  { value: 'assisted', label: 'Assisted' },
  { value: 'timed_cardio', label: 'Cardio / timed' },
]

export const MOVEMENT_DEFAULTS: Record<MovementType, { loadingStyle: LoadingStyle; isLoaded: boolean }> = {
  barbell: { loadingStyle: 'barbell', isLoaded: true },
  dumbbell: { loadingStyle: 'dumbbell', isLoaded: true },
  machine: { loadingStyle: 'stack', isLoaded: true },
  cable: { loadingStyle: 'stack', isLoaded: true },
  bodyweight: { loadingStyle: 'bodyweight', isLoaded: false },
  weighted_bodyweight: { loadingStyle: 'plate_loaded', isLoaded: true },
  assisted: { loadingStyle: 'stack', isLoaded: false },
  timed_cardio: { loadingStyle: 'timed', isLoaded: false },
}

export const movementLabel = (m: MovementType) =>
  MOVEMENTS.find((x) => x.value === m)?.label ?? m
