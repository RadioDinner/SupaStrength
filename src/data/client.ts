/**
 * The data-access seam (BUILD_PLAN 0.6).
 *
 * Features/UI talk to repos; repos talk to a `DataClient`. Today the only
 * implementation is Supabase-backed (`src/data/online`). In Phase 2 a
 * local-first store can implement the same interface so nothing above this line
 * changes. The surface grows table-by-table as milestones land.
 */

export interface PingResult {
  /** Row count of the read-all `muscle_groups` reference table. */
  muscleGroups: number
}

export type FilterOp = 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte' | 'in' | 'is' | 'ilike'

export interface QueryFilter {
  column: string
  op: FilterOp
  value: unknown
}

export interface OrderBy {
  column: string
  ascending?: boolean
}

export interface ListOptions {
  filters?: QueryFilter[]
  order?: OrderBy[]
  limit?: number
}

/**
 * Generic, table-name-keyed CRUD. Row types are supplied by the caller (the repo
 * layer) — `T` is the domain row shape. `user_id` is omitted on user-owned
 * inserts; Postgres defaults it to `auth.uid()` (DATA_MODEL §4).
 */
export interface DataClient {
  /**
   * Confirms connectivity + that the schema is live by reading the seeded,
   * read-all `muscle_groups` reference table.
   */
  ping(): Promise<PingResult>

  list<T>(table: string, opts?: ListOptions): Promise<T[]>
  getOne<T>(table: string, filters: QueryFilter[]): Promise<T | null>
  insert<T>(table: string, values: Partial<T> | Partial<T>[]): Promise<T[]>
  update<T>(table: string, values: Partial<T>, filters: QueryFilter[]): Promise<T[]>
  upsert<T>(
    table: string,
    values: Partial<T> | Partial<T>[],
    onConflict?: string,
  ): Promise<T[]>
  remove(table: string, filters: QueryFilter[]): Promise<void>
  rpc<T>(name: string, args?: Record<string, unknown>): Promise<T>

  // --- Storage (private buckets: form-videos, progress-photos) — M7/M8 -------
  /** Upload a file to a private bucket at `path`. Returns the stored path. */
  uploadFile(
    bucket: string,
    path: string,
    file: Blob,
    opts?: { contentType?: string; upsert?: boolean },
  ): Promise<{ path: string }>
  /** Time-limited signed URL for reading a private object. */
  signedUrl(bucket: string, path: string, expiresInSeconds?: number): Promise<string>
  /** Batch signed URLs for many objects in one request (path → url). */
  signedUrls(
    bucket: string,
    paths: string[],
    expiresInSeconds?: number,
  ): Promise<Record<string, string>>
  /** Remove objects from a bucket. */
  removeFiles(bucket: string, paths: string[]): Promise<void>

  // TODO (Phase 2 offline): subscribe(table, cb) for reactive local queries.
}
