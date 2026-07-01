/** Shared label + icon for the three cadenced check-in reminders. Kept separate
 *  so the lightweight DueNudges widget and the full ProgressPage can both use it
 *  without one dragging the other into its bundle. */
import { Camera, Ruler, Scale, type LucideIcon } from 'lucide-react'

export const REMINDER_META: Record<string, { label: string; Icon: LucideIcon }> = {
  weigh_in: { label: 'Weigh-in', Icon: Scale },
  measurements: { label: 'Measurements', Icon: Ruler },
  photos: { label: 'Progress photos', Icon: Camera },
}
