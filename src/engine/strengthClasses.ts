/**
 * Strength-class ladder (Strength analysis page). Pure — no I/O.
 *
 * A 7-class ladder in the Symmetric-Strength style, chosen by the user from
 * reference screenshots (2026-07-02 session): Untrained → Novice →
 * Intermediate → Proficient → Advanced → Elite → World class, each with a
 * numeric "strength score" (30 / 45 / 60 / 75 / 90 / 112.5 / 125). Lifters
 * below the Untrained threshold read as **Subpar** — a band, not a slider
 * stop (there is no "compare to a Subpar lifter": it has no thresholds).
 *
 * Thresholds are bodyweight-RATIO form per (sex, lift), like the
 * `strength_standards` seed: expected 1RM = ratio × bodyweight. Male ratios
 * were calibrated so a 200 lb male reproduces the user's reference tables
 * (e.g. squat 135/205/270/340/395/510/565). Female ratios apply the house
 * seed's female/male proportions per lift, interpolated across the ladder.
 * Synthesized SupaStrength table — not a copy of any proprietary dataset.
 *
 * A lift's continuous score comes from piecewise-linear interpolation between
 * class thresholds (0 lb → 0; extrapolated past World class along the last
 * segment, capped at MAX_SCORE). Muscle-group scores are weighted averages of
 * the scores of the main lifts that train the group — groups none of the five
 * lifts meaningfully load (calves) stay unranked, as do groups whose lifts
 * haven't been logged.
 */
import type { LiftKey, Sex } from '../data/types'

/** Slider stops, weakest → strongest. */
export const STRENGTH_CLASSES = [
  'untrained',
  'novice',
  'intermediate',
  'proficient',
  'advanced',
  'elite',
  'world_class',
] as const
export type StrengthClass = (typeof STRENGTH_CLASSES)[number]

/** Bands a lifter can read as: every class, plus Subpar below Untrained. */
export const STRENGTH_BANDS = ['subpar', ...STRENGTH_CLASSES] as const
export type StrengthBand = (typeof STRENGTH_BANDS)[number]

export const CLASS_SCORE: Record<StrengthClass, number> = {
  untrained: 30,
  novice: 45,
  intermediate: 60,
  proficient: 75,
  advanced: 90,
  elite: 112.5,
  world_class: 125,
}

/** Ceiling for extrapolation past World class. */
export const MAX_SCORE = 150

export const BAND_LABEL: Record<StrengthBand, string> = {
  subpar: 'Subpar',
  untrained: 'Untrained',
  novice: 'Novice',
  intermediate: 'Intermediate',
  proficient: 'Proficient',
  advanced: 'Advanced',
  elite: 'Elite',
  world_class: 'World class',
}

/** One-line "who is this lifter" blurb per slider class (reference-app style). */
export const CLASS_BLURB: Record<StrengthClass, string> = {
  untrained: 'Has not trained for strength before. The majority of the population.',
  novice: 'Stronger than the average untrained lifter — typically a few months of training.',
  intermediate: 'Training consistently for a year or more. Most gym regulars land here.',
  proficient: 'Focused strength training for 2+ years — stronger than most gym regulars.',
  advanced: 'Multiple years of structured training and dieting; among the strongest in an average gym.',
  elite: 'Competitive at the national level after a lifetime of structured training.',
  world_class: 'Among the strongest in the world; competes internationally.',
}

type ClassRatios = Record<StrengthClass, number>

/**
 * Expected-1RM ratios (× bodyweight). Male column calibrated at 200 lb against
 * the reference tables; female column = male × house female/male factor curve.
 */
export const CLASS_RATIOS: Record<Sex, Record<LiftKey, ClassRatios>> = {
  male: {
    squat: {
      untrained: 0.675, novice: 1.025, intermediate: 1.35, proficient: 1.7,
      advanced: 1.975, elite: 2.55, world_class: 2.825,
    },
    bench: {
      untrained: 0.5, novice: 0.75, intermediate: 1.0, proficient: 1.275,
      advanced: 1.475, elite: 1.9, world_class: 2.1,
    },
    deadlift: {
      untrained: 0.775, novice: 1.175, intermediate: 1.55, proficient: 1.95,
      advanced: 2.275, elite: 2.925, world_class: 3.25,
    },
    ohp: {
      untrained: 0.325, novice: 0.5, intermediate: 0.65, proficient: 0.825,
      advanced: 0.95, elite: 1.225, world_class: 1.375,
    },
    row: {
      untrained: 0.425, novice: 0.625, intermediate: 0.825, proficient: 1.025,
      advanced: 1.2, elite: 1.55, world_class: 1.725,
    },
  },
  female: {
    squat: {
      untrained: 0.45, novice: 0.675, intermediate: 0.925, proficient: 1.225,
      advanced: 1.475, elite: 2.05, world_class: 2.25,
    },
    bench: {
      untrained: 0.275, novice: 0.4, intermediate: 0.55, proficient: 0.75,
      advanced: 0.9, elite: 1.225, world_class: 1.375,
    },
    deadlift: {
      untrained: 0.525, novice: 0.8, intermediate: 1.075, proficient: 1.4,
      advanced: 1.65, elite: 2.2, world_class: 2.45,
    },
    ohp: {
      untrained: 0.225, novice: 0.325, intermediate: 0.45, proficient: 0.575,
      advanced: 0.7, elite: 0.925, world_class: 1.025,
    },
    row: {
      untrained: 0.25, novice: 0.375, intermediate: 0.525, proficient: 0.7,
      advanced: 0.85, elite: 1.15, world_class: 1.275,
    },
  },
}

/** Expected 1RM (lb) for a class at a bodyweight, rounded to `roundTo`. */
export function expectedE1rmLb(
  lift: LiftKey,
  cls: StrengthClass,
  bodyweightLb: number,
  sex: Sex,
  roundTo = 5,
): number {
  const raw = CLASS_RATIOS[sex][lift][cls] * bodyweightLb
  return Math.round(raw / roundTo) * roundTo
}

/**
 * Continuous strength score for one lift. Piecewise-linear through
 * (0 lb → 0) and every class threshold; past World class it continues along
 * the Elite→World-class slope, capped at MAX_SCORE.
 */
export function liftScore(
  lift: LiftKey,
  e1rmLb: number,
  bodyweightLb: number,
  sex: Sex,
): number {
  if (bodyweightLb <= 0 || e1rmLb <= 0) return 0
  const ratios = CLASS_RATIOS[sex][lift]
  let prev = { lb: 0, score: 0 }
  for (const c of STRENGTH_CLASSES) {
    const pt = { lb: ratios[c] * bodyweightLb, score: CLASS_SCORE[c] }
    if (e1rmLb <= pt.lb) {
      return prev.score + ((e1rmLb - prev.lb) / (pt.lb - prev.lb)) * (pt.score - prev.score)
    }
    prev = pt
  }
  // Past World class: continue along the Elite→World-class slope, capped.
  const elite = { lb: ratios.elite * bodyweightLb, score: CLASS_SCORE.elite }
  const slope = (prev.score - elite.score) / (prev.lb - elite.lb)
  return Math.min(MAX_SCORE, prev.score + (e1rmLb - prev.lb) * slope)
}

/** The band a score reads as (lower bound inclusive, like the DB view). */
export function bandForScore(score: number): StrengthBand {
  let band: StrengthBand = 'subpar'
  for (const c of STRENGTH_CLASSES) {
    if (score >= CLASS_SCORE[c]) band = c
  }
  return band
}

/** The 12 house muscle groups (muscle_groups.group_key). */
export const GROUP_KEYS = [
  'chest', 'back', 'shoulders', 'biceps', 'triceps', 'quads',
  'hamstrings', 'glutes', 'calves', 'core', 'traps', 'forearms',
] as const
export type GroupKey = (typeof GROUP_KEYS)[number]

/**
 * How much each main lift says about each muscle group (editorial weights,
 * Symmetric-Strength style). Groups with no entries (calves) can never be
 * ranked from the five main lifts and render unranked.
 */
export const MUSCLE_LIFT_WEIGHTS: Record<GroupKey, Partial<Record<LiftKey, number>>> = {
  chest: { bench: 1 },
  back: { row: 1, deadlift: 0.6 },
  shoulders: { ohp: 1, bench: 0.4, row: 0.3 },
  biceps: { row: 1 },
  triceps: { bench: 0.7, ohp: 0.6 },
  quads: { squat: 1, deadlift: 0.3 },
  hamstrings: { deadlift: 1, squat: 0.3 },
  glutes: { deadlift: 0.9, squat: 0.8 },
  calves: {},
  core: { squat: 0.3, deadlift: 0.4, ohp: 0.2, row: 0.2 },
  traps: { deadlift: 0.5, ohp: 0.3, row: 0.3 },
  forearms: { deadlift: 0.5, row: 0.4 },
}

/**
 * Per-group scores from whatever lift scores exist (logged lifts only).
 * A group is `null` (unranked) when none of its lifts have a score.
 */
export function muscleScores(
  lifts: Partial<Record<LiftKey, number>>,
): Record<GroupKey, number | null> {
  const out = {} as Record<GroupKey, number | null>
  for (const g of GROUP_KEYS) {
    let sum = 0
    let wsum = 0
    for (const [lift, w] of Object.entries(MUSCLE_LIFT_WEIGHTS[g]) as [LiftKey, number][]) {
      const s = lifts[lift]
      if (s !== undefined) {
        sum += s * w
        wsum += w
      }
    }
    out[g] = wsum > 0 ? sum / wsum : null
  }
  return out
}

/** Overall strength score: the mean of the logged lifts' scores. */
export function overallScore(lifts: Partial<Record<LiftKey, number>>): number | null {
  const vals = Object.values(lifts).filter((v): v is number => v !== undefined)
  if (vals.length === 0) return null
  return vals.reduce((a, b) => a + b, 0) / vals.length
}
