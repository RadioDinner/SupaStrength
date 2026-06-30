import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { equipmentRepo } from '../../data/repos/equipmentRepo'
import type { EquipmentPreferences } from '../../data/types'

export function useLocations() {
  return useQuery({ queryKey: ['locations'], queryFn: () => equipmentRepo.listLocations() })
}

export function useBarbells(locationId: string | null) {
  return useQuery({
    queryKey: ['barbells', locationId],
    queryFn: () => equipmentRepo.listBarbells(locationId!),
    enabled: !!locationId,
  })
}

export function usePlates(locationId: string | null) {
  return useQuery({
    queryKey: ['plates', locationId],
    queryFn: () => equipmentRepo.listPlates(locationId!),
    enabled: !!locationId,
  })
}

export function useDumbbells(locationId: string | null) {
  return useQuery({
    queryKey: ['dumbbells', locationId],
    queryFn: () => equipmentRepo.listDumbbells(locationId!),
    enabled: !!locationId,
  })
}

export function usePreferences(userId: string) {
  return useQuery({
    queryKey: ['equipment_preferences', userId],
    queryFn: () => equipmentRepo.getPreferences(userId),
  })
}

export function useUpsertPlate(locationId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ denominationLb, quantity }: { denominationLb: number; quantity: number }) =>
      equipmentRepo.upsertPlate(locationId, denominationLb, quantity),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['plates', locationId] }),
  })
}

export function useUpsertDumbbell(locationId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ weightLb, quantity }: { weightLb: number; quantity: number }) =>
      equipmentRepo.upsertDumbbell(locationId, weightLb, quantity),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['dumbbells', locationId] }),
  })
}

export function useUpsertPreferences(userId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (patch: Partial<EquipmentPreferences>) =>
      equipmentRepo.upsertPreferences({ user_id: userId, ...patch }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['equipment_preferences', userId] }),
  })
}

export function useCreateLocation() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (name: string) => equipmentRepo.createLocation(name),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['locations'] }),
  })
}

export function useSetDefaultLocation() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (locationId: string) => equipmentRepo.setDefaultLocation(locationId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['locations'] }),
  })
}
