/**
 * Analytics repository (BUILD_PLAN M6). Reads the derived `v_*` analytics views
 * (DATA_MODEL §5) and the `chart_preferences` UI-state singleton. Nothing here
 * is stored-derived: the radar recomputes from the views for every window, so
 * switching 7d→12wk re-queries rather than reading a cached aggregate.
 *
 * RLS (`security_invoker` views) scopes every read to the caller, so a second
 * user only ever sees their own metrics through these same calls.
 */
import { subDays } from 'date-fns'
import { onlineDataClient } from '../online/supabaseDataClient'
import type {
  ChartPreferences,
  FrequencyRow,
  MuscleStrength,
  MuscleVolumeWeekly,
  StrengthVsStandards,
  TimeWindow,
} from '../types'

/** Aggregated radar input: one entry per muscle group for the chosen window. */
export interface MuscleVolume {
  muscleGroupId: number
  hardSets: number
  hardSetsPrimary: number
  tonnageLb: number
  totalReps: number
}

export const CHART_PREFERENCE_DEFAULTS: Omit<
  ChartPreferences,
  'user_id' | 'created_at' | 'updated_at'
> = {
  volume_metric: 'hard_sets',
  time_window: '4wk',
  radar_mode: 'volume',
  weakest_view: 'relative',
  count_secondary: true,
}

/** Inclusive lower-bound `week_start` for a window, or null for "all time". */
function windowSince(window: TimeWindow, today: Date): string | null {
  switch (window) {
    case '7d':
      return iso(subDays(today, 7))
    case '4wk':
      return iso(subDays(today, 28))
    case '12wk':
      return iso(subDays(today, 84))
    case 'all':
      return null
  }
}

const iso = (d: Date) => d.toISOString().slice(0, 10)

export const analyticsRepo = {
  async getChartPreferences(): Promise<ChartPreferences | null> {
    // Singleton keyed by auth.uid(); RLS returns at most the caller's row.
    const rows = await onlineDataClient.list<ChartPreferences>('chart_preferences', { limit: 1 })
    return rows[0] ?? null
  },

  saveChartPreferences(
    patch: Partial<Omit<ChartPreferences, 'user_id' | 'created_at' | 'updated_at'>>,
  ): Promise<ChartPreferences[]> {
    // user_id defaults to auth.uid(); upsert on the PK keeps it a singleton.
    return onlineDataClient.upsert<ChartPreferences>('chart_preferences', patch, 'user_id')
  },

  /**
   * Volume per muscle group for a window, summed across the weekly view rows.
   * The view is week-grained, so the 7d window is approximate (it includes any
   * week whose Monday falls on/after the cutoff) — acceptable for a radar.
   */
  async muscleVolume(window: TimeWindow, today: Date): Promise<MuscleVolume[]> {
    const since = windowSince(window, today)
    const rows = await onlineDataClient.list<MuscleVolumeWeekly>('v_muscle_volume_weekly', {
      filters: since ? [{ column: 'week_start', op: 'gte', value: since }] : [],
    })
    const byGroup = new Map<number, MuscleVolume>()
    for (const r of rows) {
      const acc = byGroup.get(r.muscle_group_id) ?? {
        muscleGroupId: r.muscle_group_id,
        hardSets: 0,
        hardSetsPrimary: 0,
        tonnageLb: 0,
        totalReps: 0,
      }
      acc.hardSets += Number(r.hard_sets) || 0
      acc.hardSetsPrimary += Number(r.hard_sets_primary) || 0
      acc.tonnageLb += Number(r.tonnage_lb) || 0
      acc.totalReps += Number(r.total_reps) || 0
      byGroup.set(r.muscle_group_id, acc)
    }
    return [...byGroup.values()]
  },

  muscleStrength(): Promise<MuscleStrength[]> {
    return onlineDataClient.list<MuscleStrength>('v_muscle_strength', {})
  },

  strengthVsStandards(): Promise<StrengthVsStandards[]> {
    return onlineDataClient.list<StrengthVsStandards>('v_strength_vs_standards', {})
  },

  frequency(window: TimeWindow): Promise<FrequencyRow[]> {
    return onlineDataClient.list<FrequencyRow>('v_frequency', {
      filters: [{ column: 'time_window', op: 'eq', value: window }],
      order: [{ column: 'cnt', ascending: false }],
    })
  },
}
