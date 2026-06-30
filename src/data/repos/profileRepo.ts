/**
 * Profile repository (BUILD_PLAN M1). UI → this repo → DataClient → Supabase.
 */
import { onlineDataClient } from '../online/supabaseDataClient'
import type { UserProfile } from '../types'

const TABLE = 'user_profiles'

export const profileRepo = {
  get(userId: string): Promise<UserProfile | null> {
    return onlineDataClient.getOne<UserProfile>(TABLE, [{ column: 'user_id', op: 'eq', value: userId }])
  },

  /**
   * Patch the profile. Updating `bodyweight_lb` also stamps
   * `bodyweight_updated_at` (M1 acceptance + §9 staleness warning).
   */
  async update(userId: string, patch: Partial<UserProfile>): Promise<UserProfile> {
    const values: Partial<UserProfile> = { ...patch }
    if (patch.bodyweight_lb !== undefined) {
      values.bodyweight_updated_at = new Date().toISOString()
    }
    const rows = await onlineDataClient.update<UserProfile>(TABLE, values, [
      { column: 'user_id', op: 'eq', value: userId },
    ])
    const row = rows[0]
    if (!row) throw new Error('Profile update affected no rows')
    return row
  },
}
