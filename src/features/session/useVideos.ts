/**
 * Form-video hooks (BUILD_PLAN M7). React Query over `videosRepo`.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { videosRepo } from '../../data/repos/videosRepo'
import type { Video } from '../../data/types'

export function useVideoUrl(storagePath: string | null) {
  return useQuery({
    queryKey: ['video_url', storagePath],
    queryFn: () => videosRepo.signedUrl(storagePath!),
    enabled: !!storagePath,
    staleTime: 1000 * 60 * 50, // signed for 60 min; refetch before expiry
  })
}

export function useSetVideo(setLogId: string | null) {
  return useQuery({
    queryKey: ['set_video', setLogId],
    queryFn: () => videosRepo.getForSet(setLogId!),
    enabled: !!setLogId,
  })
}

export function useRecordVideo(userId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: { setLogId: string; file: Blob; durationSeconds: number }) =>
      videosRepo.recordForSet({ ...input, userId }),
    onSuccess: (video) => {
      qc.setQueryData(['set_video', video.set_log_id], video)
    },
  })
}

export function useDeleteVideo() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (video: Video) => videosRepo.delete(video),
    onSuccess: (_v, video) => {
      qc.setQueryData(['set_video', video.set_log_id], null)
    },
  })
}
