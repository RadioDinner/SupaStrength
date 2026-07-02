import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { workoutsRepo, type NewEntry } from '../../data/repos/workoutsRepo'
import { exercisesRepo } from '../../data/repos/exercisesRepo'
import type { WorkoutEntry } from '../../data/types'

export function useWorkouts() {
  return useQuery({ queryKey: ['workouts'], queryFn: () => workoutsRepo.list() })
}

export function useWorkout(id: string) {
  return useQuery({ queryKey: ['workout', id], queryFn: () => workoutsRepo.get(id) })
}

export function useCreateWorkout() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (name: string) => workoutsRepo.create(name),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['workouts'] }),
  })
}

export function useArchiveWorkout() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => workoutsRepo.archive(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['workouts'] }),
  })
}

export function useWorkoutEntries(workoutId: string) {
  return useQuery({
    queryKey: ['workout_entries', workoutId],
    queryFn: () => workoutsRepo.listEntries(workoutId),
  })
}

/** Exercise names for a set of ids (for rendering entries). */
export function useExercisesByIds(ids: string[]) {
  const key = [...ids].sort().join(',')
  return useQuery({
    queryKey: ['exercises_by_id', key],
    queryFn: () => exercisesRepo.listByIds(ids),
    enabled: ids.length > 0,
  })
}

export function useAddEntry(workoutId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (entry: NewEntry) => workoutsRepo.addEntry(workoutId, entry),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['workout_entries', workoutId] }),
  })
}

/** Workout entries by id — the session page uses this for sticky notes. */
export function useWorkoutEntriesByIds(ids: string[]) {
  const key = [...ids].sort().join(',')
  return useQuery({
    queryKey: ['workout_entries_by_id', key],
    queryFn: () => workoutsRepo.listEntriesByIds(ids),
    enabled: ids.length > 0,
  })
}

export function useUpdateEntry(workoutId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ entryId, patch }: { entryId: string; patch: Partial<WorkoutEntry> }) =>
      workoutsRepo.updateEntry(entryId, patch),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['workout_entries', workoutId] })
      qc.invalidateQueries({ queryKey: ['workout_entries_by_id'] })
    },
  })
}

export function useEntrySets(entryId: string, enabled = true) {
  return useQuery({
    queryKey: ['workout_entry_sets', entryId],
    queryFn: () => workoutsRepo.listEntrySets(entryId),
    enabled,
  })
}

export function useSaveEntrySets(workoutId: string, entryId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (rows: { targetReps: number; targetWeight: number | null }[]) =>
      workoutsRepo.saveEntrySets(entryId, rows),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['workout_entry_sets', entryId] })
      qc.invalidateQueries({ queryKey: ['workout_entries', workoutId] })
    },
  })
}

export function useRemoveEntry(workoutId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (entryId: string) => workoutsRepo.removeEntry(entryId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['workout_entries', workoutId] }),
  })
}

export function useMoveEntry(workoutId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (v: { a: { id: string; position: number }; b: { id: string; position: number } }) =>
      workoutsRepo.swapPositions(v.a, v.b),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['workout_entries', workoutId] }),
  })
}
