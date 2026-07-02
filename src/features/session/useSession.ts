import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { sessionsRepo } from '../../data/repos/sessionsRepo'
import { equipmentRepo } from '../../data/repos/equipmentRepo'
import type { Session, SetLog } from '../../data/types'

async function defaultLocationId(): Promise<string | null> {
  const locations = await equipmentRepo.listLocations()
  return (locations.find((l) => l.is_default) ?? locations[0])?.id ?? null
}

export function useActiveSession() {
  return useQuery({ queryKey: ['active_session'], queryFn: () => sessionsRepo.getActive() })
}

export function useSession(id: string) {
  return useQuery({ queryKey: ['session', id], queryFn: () => sessionsRepo.get(id) })
}

export function useSessionEntries(id: string) {
  return useQuery({
    queryKey: ['session_entries', id],
    queryFn: () => sessionsRepo.listEntries(id),
  })
}

export function useSetLogs(sessionId: string, entryIds: string[]) {
  const key = [...entryIds].sort().join(',')
  return useQuery({
    queryKey: ['set_logs', sessionId, key],
    queryFn: () => sessionsRepo.listSetLogs(entryIds),
    enabled: entryIds.length > 0,
  })
}

export function useRecentSessions(limit = 8) {
  return useQuery({ queryKey: ['recent_sessions'], queryFn: () => sessionsRepo.recent(limit) })
}

/** The session location's default bar + plate inventory + rounding prefs. */
export function useSessionEquipment(locationId: string | null, userId: string) {
  return useQuery({
    queryKey: ['session_equipment', locationId, userId],
    queryFn: async () => {
      const [barbells, plates, prefs] = await Promise.all([
        locationId ? equipmentRepo.listBarbells(locationId) : Promise.resolve([]),
        locationId ? equipmentRepo.listPlates(locationId) : Promise.resolve([]),
        equipmentRepo.getPreferences(userId),
      ])
      return {
        bar: barbells.find((b) => b.is_default) ?? barbells[0] ?? null,
        plates,
        prefs,
      }
    },
    enabled: !!userId,
  })
}

export function useStartFromWorkout() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (workoutId: string) =>
      sessionsRepo.startFromWorkout(workoutId, await defaultLocationId()),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['active_session'] }),
  })
}

export function useStartNextGymDay() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (routineId: string) =>
      sessionsRepo.startNextGymDay(routineId, await defaultLocationId()),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['active_session'] }),
  })
}

export function useUpdateSetLog() {
  // Fire-and-persist: the in-gym UI holds the live set state locally, so we don't
  // invalidate (a refetch mid-typing would clobber the input). The DB write is for
  // durability/resume; on a fresh load the query reads the saved values.
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Partial<SetLog> }) =>
      sessionsRepo.updateSetLog(id, patch),
  })
}

export function useDeleteSession() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (sessionId: string) => sessionsRepo.delete(sessionId),
    onSuccess: async (_, sessionId) => {
      // Everything derived from session data: the History list, the Home page's
      // last-session card (['sessions', 'recent', N]), and the analytics views
      // that aggregate the deleted set logs.
      qc.invalidateQueries({ queryKey: ['sessions'] })
      qc.invalidateQueries({ queryKey: ['analytics'] })
      // Await the History list refetch so the deleted row UNMOUNTS before its
      // detail caches are removed — removing a query that still has a mounted
      // observer makes TanStack rebuild it and refetch the deleted session.
      await qc.invalidateQueries({ queryKey: ['recent_sessions'] })
      qc.removeQueries({ queryKey: ['session', sessionId] })
      qc.removeQueries({ queryKey: ['session_entries', sessionId] })
      qc.removeQueries({ queryKey: ['set_logs', sessionId] })
    },
  })
}

export function useCompleteSession() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (session: Session) => sessionsRepo.complete(session),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['active_session'] })
      qc.invalidateQueries({ queryKey: ['recent_sessions'] })
      qc.invalidateQueries({ queryKey: ['routine_schedule'] })
    },
  })
}
