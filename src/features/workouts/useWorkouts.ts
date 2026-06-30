import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { workoutsRepo, type NewEntry } from '../../data/repos/workoutsRepo'
import { exercisesRepo } from '../../data/repos/exercisesRepo'

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

export function useRemoveEntry(workoutId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (entryId: string) => workoutsRepo.removeEntry(entryId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['workout_entries', workoutId] }),
  })
}
