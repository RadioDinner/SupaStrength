import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { exercisesRepo, type ExerciseQuery, type NewCustomExercise } from '../../data/repos/exercisesRepo'

export function useExercises(query: ExerciseQuery) {
  return useQuery({
    queryKey: ['exercises', query.search ?? '', query.movementType ?? 'all'],
    queryFn: () => exercisesRepo.list(query),
  })
}

export function useMuscleGroups() {
  return useQuery({
    queryKey: ['muscle_groups'],
    queryFn: () => exercisesRepo.listMuscleGroups(),
    staleTime: Infinity,
  })
}

export function useExerciseMuscles(exerciseId: string | null) {
  return useQuery({
    queryKey: ['exercise_muscles', exerciseId],
    queryFn: () => exercisesRepo.listMusclesFor(exerciseId!),
    enabled: !!exerciseId,
  })
}

export function useCreateCustomExercise() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: NewCustomExercise) => exercisesRepo.createCustom(input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['exercises'] }),
  })
}
