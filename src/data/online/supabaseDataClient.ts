import { getSupabase } from '../../lib/supabase'
import type { DataClient, PingResult } from '../client'

/** Supabase-backed implementation of the DataClient seam. */
export const onlineDataClient: DataClient = {
  async ping(): Promise<PingResult> {
    const supabase = getSupabase()
    const { count, error } = await supabase
      .from('muscle_groups')
      .select('*', { count: 'exact', head: true })

    if (error) throw new Error(error.message)
    return { muscleGroups: count ?? 0 }
  },
}
