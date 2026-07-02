/**
 * Analytics hooks (BUILD_PLAN M6). React Query over `analyticsRepo`. The radar
 * recomputes from the views per window; `chart_preferences` is an optimistic,
 * persisted UI-state singleton.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { analyticsRepo } from '../../data/repos/analyticsRepo'
import type { ChartPreferences, TimeWindow } from '../../data/types'

export function useChartPreferences() {
  return useQuery({
    queryKey: ['chart_preferences'],
    queryFn: () => analyticsRepo.getChartPreferences(),
  })
}

type PrefPatch = Partial<Omit<ChartPreferences, 'user_id' | 'created_at' | 'updated_at'>>

export function useSaveChartPreferences() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (patch: PrefPatch) => analyticsRepo.saveChartPreferences(patch),
    // Optimistic: the controls flip instantly, server reconciles in the back.
    onMutate: async (patch) => {
      await qc.cancelQueries({ queryKey: ['chart_preferences'] })
      const prev = qc.getQueryData<ChartPreferences | null>(['chart_preferences'])
      qc.setQueryData<ChartPreferences | null>(['chart_preferences'], (cur) =>
        cur ? { ...cur, ...patch } : cur,
      )
      return { prev }
    },
    onError: (_e, _patch, ctx) => {
      if (ctx) qc.setQueryData(['chart_preferences'], ctx.prev)
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ['chart_preferences'] }),
  })
}

export function useMuscleVolume(window: TimeWindow) {
  return useQuery({
    queryKey: ['analytics', 'volume', window],
    queryFn: () => analyticsRepo.muscleVolume(window, new Date()),
  })
}

export function useMuscleStrength() {
  return useQuery({
    queryKey: ['analytics', 'strength'],
    queryFn: () => analyticsRepo.muscleStrength(),
  })
}

export function useLiftE1rms() {
  return useQuery({
    queryKey: ['analytics', 'lift_e1rms'],
    queryFn: () => analyticsRepo.liftE1rms(),
  })
}

export function useStrengthVsStandards() {
  return useQuery({
    queryKey: ['analytics', 'standards'],
    queryFn: () => analyticsRepo.strengthVsStandards(),
  })
}

export function useFrequency(window: TimeWindow) {
  return useQuery({
    queryKey: ['analytics', 'frequency', window],
    queryFn: () => analyticsRepo.frequency(window),
  })
}
