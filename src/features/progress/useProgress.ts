/**
 * Body-progress hooks (BUILD_PLAN M8): measurements, photos, reminders.
 */
import { useEffect } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { format } from 'date-fns'
import { measurementsRepo, type MeasurementValues } from '../../data/repos/measurementsRepo'
import { photosRepo } from '../../data/repos/photosRepo'
import { profileRepo } from '../../data/repos/profileRepo'
import { remindersRepo } from '../../data/repos/remindersRepo'
import type { PhotoCategory } from '../../data/types'

// ── measurements ────────────────────────────────────────────────────────────
export function useRecentMeasurements(limit = 60) {
  return useQuery({
    queryKey: ['measurements', limit],
    queryFn: () => measurementsRepo.recent(limit),
  })
}

export function useSaveMeasurement() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: { takenOn: string; values: MeasurementValues }) =>
      measurementsRepo.save(input.takenOn, input.values),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['measurements'] })
      qc.invalidateQueries({ queryKey: ['reminders_due'] })
    },
  })
}

/**
 * Log a bodyweight for a date (end-of-workout weigh-in, backfill). Upserts
 * that day's measurement row (the DB trigger bumps the weigh-in reminder).
 * When the date is TODAY it also syncs the canonical profile bodyweight the
 * strength standards read (§9) — a backdated entry must not overwrite it.
 */
export function useLogBodyweight() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: { takenOn: string; bodyweightLb: number; userId: string }) => {
      await measurementsRepo.save(input.takenOn, { bodyweight: input.bodyweightLb })
      if (input.takenOn === format(new Date(), 'yyyy-MM-dd')) {
        await profileRepo.update(input.userId, { bodyweight_lb: input.bodyweightLb })
      }
    },
    onSuccess: (_, { userId }) => {
      qc.invalidateQueries({ queryKey: ['measurements'] })
      qc.invalidateQueries({ queryKey: ['reminders_due'] })
      qc.invalidateQueries({ queryKey: ['profile', userId] })
      qc.invalidateQueries({ queryKey: ['analytics', 'standards'] })
    },
  })
}

export function useImportMeasurementsCsv() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (text: string) => measurementsRepo.importCsv(text),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['measurements'] })
      qc.invalidateQueries({ queryKey: ['reminders_due'] })
    },
  })
}

// ── photos ──────────────────────────────────────────────────────────────────
export function useRecentPhotos(limit = 60) {
  return useQuery({ queryKey: ['photos', limit], queryFn: () => photosRepo.recent(limit) })
}

export function useUploadPhoto(userId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: {
      category: PhotoCategory
      customLabel?: string | null
      file: Blob
      takenOn?: string
    }) => photosRepo.upload({ ...input, userId }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['photos'] })
      qc.invalidateQueries({ queryKey: ['reminders_due'] })
    },
  })
}

export function useDeletePhoto() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (photo: { id: string; storage_path: string }) => photosRepo.delete(photo),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['photos'] }),
  })
}

/** Batch-sign every visible photo in a single request (path → url map). */
export function usePhotoUrls(storagePaths: string[]) {
  const key = [...storagePaths].sort().join('|')
  return useQuery({
    queryKey: ['photo_urls', key],
    queryFn: () => photosRepo.signedUrls(storagePaths),
    enabled: storagePaths.length > 0,
    staleTime: 1000 * 60 * 50,
    // Keep the prior map while re-signing after a photo is added/removed so
    // surviving thumbnails don't flash to their placeholder.
    placeholderData: (prev) => prev,
  })
}

// ── reminders ─────────────────────────────────────────────────────────────────
export function useDueReminders() {
  const qc = useQueryClient()
  // Ensure the three default reminders exist the first time we read them.
  useEffect(() => {
    remindersRepo.ensureDefaults().then(() => {
      qc.invalidateQueries({ queryKey: ['reminders_due'] })
    })
  }, [qc])
  return useQuery({ queryKey: ['reminders_due'], queryFn: () => remindersRepo.listDue() })
}

export function useReminderActions() {
  const qc = useQueryClient()
  const invalidate = () => qc.invalidateQueries({ queryKey: ['reminders_due'] })
  return {
    markDone: useMutation({ mutationFn: (id: string) => remindersRepo.markDone(id), onSuccess: invalidate }),
    snooze: useMutation({
      mutationFn: (v: { id: string; until: string | null }) => remindersRepo.snooze(v.id, v.until),
      onSuccess: invalidate,
    }),
    setEnabled: useMutation({
      mutationFn: (v: { id: string; enabled: boolean }) => remindersRepo.setEnabled(v.id, v.enabled),
      onSuccess: invalidate,
    }),
  }
}
