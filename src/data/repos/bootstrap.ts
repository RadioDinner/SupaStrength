/**
 * First-login bootstrap (BUILD_PLAN M1; HANDOFF "M1 resume"). There is no DB
 * signup trigger, so the app seeds the per-user singletons + the real home gym on
 * first login. Idempotent: safe to call on every login.
 *
 * Seeds (SPEC §7 inventory): default location "Home Gym", one 45 lb Olympic bar,
 * one pair each of 2.5/5/10/15/25/35/45 lb plates (stored as individual
 * quantities, so 2 each), and fixed dumbbells 15/20/25 (pairs → quantity 2).
 */
import { equipmentRepo } from './equipmentRepo'
import { profileRepo } from './profileRepo'
import { onlineDataClient } from '../online/supabaseDataClient'
import type { UserProfile, EquipmentPreferences } from '../types'

/** Home-gym plate denominations (lb) — one pair each → individual quantity 2. */
export const HOME_GYM_PLATES_LB = [45, 35, 25, 15, 10, 5, 2.5] as const
export const HOME_GYM_DUMBBELLS_LB = [15, 20, 25] as const
export const HOME_GYM_BARBELL_LB = 45

export interface BootstrapResult {
  profileCreated: boolean
  gymSeeded: boolean
  defaultLocationId: string | null
}

export async function ensureUserSetup(userId: string): Promise<BootstrapResult> {
  let profileCreated = false

  // 1. Profile singleton (idempotent upsert; user_id defaults to auth.uid()).
  const profile = await profileRepo.get(userId)
  if (!profile) {
    await onlineDataClient.upsert<UserProfile>('user_profiles', { user_id: userId }, 'user_id')
    profileCreated = true
  }

  // 2. Equipment preferences singleton.
  const prefs = await equipmentRepo.getPreferences(userId)
  if (!prefs) {
    await onlineDataClient.upsert<EquipmentPreferences>(
      'equipment_preferences',
      { user_id: userId },
      'user_id',
    )
  }

  // 3. Home gym — only if the user has no locations yet.
  const locations = await equipmentRepo.listLocations()
  if (locations.length > 0) {
    const def = locations.find((l) => l.is_default) ?? locations[0]
    return { profileCreated, gymSeeded: false, defaultLocationId: def?.id ?? null }
  }

  const gym = await equipmentRepo.createLocation('Home Gym', true)
  await equipmentRepo.createBarbell(gym.id, 'Olympic Barbell', HOME_GYM_BARBELL_LB, true)
  for (const denom of HOME_GYM_PLATES_LB) {
    await equipmentRepo.upsertPlate(gym.id, denom, 2)
  }
  for (const weight of HOME_GYM_DUMBBELLS_LB) {
    await equipmentRepo.upsertDumbbell(gym.id, weight, 2)
  }

  return { profileCreated, gymSeeded: true, defaultLocationId: gym.id }
}
