import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { profileRepo } from '../../data/repos/profileRepo'
import type { UserProfile } from '../../data/types'

export function useProfile(userId: string) {
  return useQuery({
    queryKey: ['profile', userId],
    queryFn: () => profileRepo.get(userId),
  })
}

export function useUpdateProfile(userId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (patch: Partial<UserProfile>) => profileRepo.update(userId, patch),
    onSuccess: (row) => qc.setQueryData(['profile', userId], row),
  })
}
