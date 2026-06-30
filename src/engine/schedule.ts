/**
 * Routine / rotation scheduling (SPEC §3 "Routine", DATA_MODEL §6 schedule).
 *
 * Pointer-based (not calendar-based): a routine is one or more independent
 * rotations, each an ordered list of workouts with a `currentIndex` pointer. The
 * next gym day is the union over rotations of the workout at `currentIndex`;
 * completing a session advances every rotation's pointer by one (wrapping). Pure.
 */

export interface Rotation {
  id: string
  /** Pointer into `workoutIds` (0-based). */
  currentIndex: number
  /** Ordered workout ids in this rotation track. */
  workoutIds: string[]
}

export interface GymDayItem {
  rotationId: string
  workoutId: string
  /** Position within its rotation. */
  position: number
}

/**
 * The next gym day = the head workout of every (non-empty) rotation. Empty
 * rotations contribute nothing. The pointer is taken modulo length so an
 * out-of-range stored index is tolerated.
 */
export function nextGymDay(rotations: Rotation[]): GymDayItem[] {
  const out: GymDayItem[] = []
  for (const r of rotations) {
    const len = r.workoutIds.length
    if (len === 0) continue
    const pos = ((r.currentIndex % len) + len) % len
    out.push({ rotationId: r.id, workoutId: r.workoutIds[pos]!, position: pos })
  }
  return out
}

/**
 * Advance every rotation pointer by one (wrapping): `currentIndex =
 * (currentIndex + 1) mod count`. Empty rotations are left untouched. Returns new
 * rotation objects (no mutation).
 */
export function advanceRotations(rotations: Rotation[]): Rotation[] {
  return rotations.map((r) => {
    const len = r.workoutIds.length
    if (len === 0) return { ...r }
    const normalized = ((r.currentIndex % len) + len) % len
    return { ...r, currentIndex: (normalized + 1) % len }
  })
}
