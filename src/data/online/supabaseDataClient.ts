/* eslint-disable @typescript-eslint/no-explicit-any */
import { getSupabase } from '../../lib/supabase'
import type { DataClient, ListOptions, PingResult, QueryFilter } from '../client'

/**
 * Supabase-backed implementation of the DataClient seam — the single place that
 * touches PostgREST. The repo layer is the only consumer; UI never imports this
 * (BUILD_PLAN import boundary).
 *
 * This is deliberately the one *loosely typed* boundary: the client is created
 * without a generated `Database` type yet, so the query builders are `any` here
 * and results are cast to the caller's row type `T`. Phase 0.3 will swap in
 * `supabase gen types typescript` to make the seam end-to-end typed.
 */

function applyFilters(builder: any, filters: QueryFilter[]): any {
  let q = builder
  for (const f of filters) {
    switch (f.op) {
      case 'eq':
        q = q.eq(f.column, f.value)
        break
      case 'neq':
        q = q.neq(f.column, f.value)
        break
      case 'gt':
        q = q.gt(f.column, f.value)
        break
      case 'gte':
        q = q.gte(f.column, f.value)
        break
      case 'lt':
        q = q.lt(f.column, f.value)
        break
      case 'lte':
        q = q.lte(f.column, f.value)
        break
      case 'in':
        q = q.in(f.column, (f.value as readonly unknown[]) ?? [])
        break
      case 'is':
        q = q.is(f.column, f.value)
        break
      case 'ilike':
        q = q.ilike(f.column, f.value as string)
        break
    }
  }
  return q
}

export const onlineDataClient: DataClient = {
  async ping(): Promise<PingResult> {
    const supabase = getSupabase()
    const { count, error } = await supabase
      .from('muscle_groups')
      .select('*', { count: 'exact', head: true })
    if (error) throw new Error(error.message)
    return { muscleGroups: count ?? 0 }
  },

  async list<T>(table: string, opts: ListOptions = {}): Promise<T[]> {
    const supabase = getSupabase()
    let query: any = supabase.from(table).select('*')
    query = applyFilters(query, opts.filters ?? [])
    for (const o of opts.order ?? []) {
      query = query.order(o.column, { ascending: o.ascending ?? true })
    }
    if (opts.limit != null) query = query.limit(opts.limit)
    const { data, error } = await query
    if (error) throw new Error(error.message)
    return (data ?? []) as T[]
  },

  async getOne<T>(table: string, filters: QueryFilter[]): Promise<T | null> {
    const supabase = getSupabase()
    const query = applyFilters(supabase.from(table).select('*'), filters)
    const { data, error } = await query.maybeSingle()
    if (error) throw new Error(error.message)
    return (data ?? null) as T | null
  },

  async insert<T>(table: string, values: Partial<T> | Partial<T>[]): Promise<T[]> {
    const supabase = getSupabase()
    const { data, error } = await supabase
      .from(table)
      .insert(values as any)
      .select('*')
    if (error) throw new Error(error.message)
    return (data ?? []) as T[]
  },

  async update<T>(table: string, values: Partial<T>, filters: QueryFilter[]): Promise<T[]> {
    const supabase = getSupabase()
    const query = applyFilters(supabase.from(table).update(values as any), filters)
    const { data, error } = await query.select('*')
    if (error) throw new Error(error.message)
    return (data ?? []) as T[]
  },

  async upsert<T>(
    table: string,
    values: Partial<T> | Partial<T>[],
    onConflict?: string,
  ): Promise<T[]> {
    const supabase = getSupabase()
    const { data, error } = await supabase
      .from(table)
      .upsert(values as any, onConflict ? { onConflict } : undefined)
      .select('*')
    if (error) throw new Error(error.message)
    return (data ?? []) as T[]
  },

  async remove(table: string, filters: QueryFilter[]): Promise<void> {
    const supabase = getSupabase()
    const query = applyFilters(supabase.from(table).delete(), filters)
    const { error } = await query
    if (error) throw new Error(error.message)
  },

  async rpc<T>(name: string, args?: Record<string, unknown>): Promise<T> {
    const supabase = getSupabase()
    const { data, error } = await supabase.rpc(name, args)
    if (error) throw new Error(error.message)
    return data as T
  },

  async uploadFile(
    bucket: string,
    path: string,
    file: Blob,
    opts?: { contentType?: string; upsert?: boolean },
  ): Promise<{ path: string }> {
    const supabase = getSupabase()
    const { data, error } = await supabase.storage.from(bucket).upload(path, file, {
      contentType: opts?.contentType,
      upsert: opts?.upsert ?? false,
    })
    if (error) throw new Error(error.message)
    return { path: data.path }
  },

  async signedUrl(bucket: string, path: string, expiresInSeconds = 3600): Promise<string> {
    const supabase = getSupabase()
    const { data, error } = await supabase.storage
      .from(bucket)
      .createSignedUrl(path, expiresInSeconds)
    if (error) throw new Error(error.message)
    return data.signedUrl
  },

  async removeFiles(bucket: string, paths: string[]): Promise<void> {
    const supabase = getSupabase()
    const { error } = await supabase.storage.from(bucket).remove(paths)
    if (error) throw new Error(error.message)
  },
}
