/**
 * The data-access seam (BUILD_PLAN 0.6).
 *
 * Features/UI talk to repos; repos talk to a `DataClient`. Today the only
 * implementation is Supabase-backed (`src/data/online`). In Phase 2 a
 * local-first store can implement the same interface so nothing above this line
 * changes. For now the surface is intentionally tiny (just a health check); it
 * grows table-by-table as milestones land.
 */

export interface PingResult {
  /** Row count of the read-all `muscle_groups` reference table. */
  muscleGroups: number
}

export interface DataClient {
  /**
   * Confirms connectivity + that the schema is live by reading the seeded,
   * read-all `muscle_groups` reference table.
   */
  ping(): Promise<PingResult>

  // TODO (milestones): query / insert / update / delete / rpc / subscribe.
}
