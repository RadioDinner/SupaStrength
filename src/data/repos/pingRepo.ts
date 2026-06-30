import { onlineDataClient } from '../online/supabaseDataClient'
import type { PingResult } from '../client'

/**
 * Trivial repo proving the seam round-trips: UI → repo → DataClient → Supabase.
 * Real repos (exercisesRepo, workoutsRepo, sessionsRepo, …) follow this shape.
 */
export const pingRepo = {
  check(): Promise<PingResult> {
    return onlineDataClient.ping()
  },
}
