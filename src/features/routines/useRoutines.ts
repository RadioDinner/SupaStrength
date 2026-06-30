import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { routinesRepo, type EngineRotation } from '../../data/repos/routinesRepo'
import type { Rotation, RotationWorkout } from '../../data/types'

export function useRoutines() {
  return useQuery({ queryKey: ['routines'], queryFn: () => routinesRepo.list() })
}

export function useRoutine(id: string) {
  return useQuery({ queryKey: ['routine', id], queryFn: () => routinesRepo.get(id) })
}

export function useCreateRoutine() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (name: string) => routinesRepo.create(name),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['routines'] }),
  })
}

export function useSetActiveRoutine() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => routinesRepo.setActive(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['routines'] }),
  })
}

export function useArchiveRoutine() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => routinesRepo.archive(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['routines'] }),
  })
}

export interface ScheduleRow {
  rotation: Rotation
  workouts: RotationWorkout[]
}

/** Loads every rotation + its ordered workouts for a routine in one query. */
export function useRoutineSchedule(routineId: string) {
  return useQuery({
    queryKey: ['routine_schedule', routineId],
    queryFn: async (): Promise<ScheduleRow[]> => {
      const rotations = await routinesRepo.listRotations(routineId)
      const lists = await Promise.all(rotations.map((r) => routinesRepo.listRotationWorkouts(r.id)))
      return rotations.map((rotation, i) => ({ rotation, workouts: lists[i] ?? [] }))
    },
  })
}

export function useAddRotation(routineId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (name: string | null) => routinesRepo.addRotation(routineId, name),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['routine_schedule', routineId] }),
  })
}

export function useRemoveRotation(routineId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => routinesRepo.removeRotation(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['routine_schedule', routineId] }),
  })
}

export function useAddRotationWorkout(routineId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ rotationId, workoutId }: { rotationId: string; workoutId: string }) =>
      routinesRepo.addRotationWorkout(rotationId, workoutId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['routine_schedule', routineId] }),
  })
}

export function useRemoveRotationWorkout(routineId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => routinesRepo.removeRotationWorkout(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['routine_schedule', routineId] }),
  })
}

export function useAdvanceRoutine(routineId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (engineRotations: EngineRotation[]) => routinesRepo.advanceAll(engineRotations),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['routine_schedule', routineId] }),
  })
}
