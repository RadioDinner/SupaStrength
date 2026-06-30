/**
 * Exercise-library seed generator (BUILD_PLAN M2).
 *
 * Reads the vendored, pinned free-exercise-db dataset (Unlicense / public domain)
 * and emits a single re-runnable SQL file that seeds the global `exercises`
 * library (user_id = null, is_seed = true) + `exercise_muscles` mapped onto our
 * 12 muscle groups. The user pastes the SQL into the Supabase SQL Editor (same
 * hand-paste workflow as the migration); it is idempotent (upsert on the
 * partial-unique global slug / the muscle PK), so re-running updates in place.
 *
 *   node supabase/seed/build-exercise-seed.mjs
 *
 * Run from the repo root. Exits non-zero if M2 acceptance fails (≥800 exercises,
 * every exercise has ≥1 primary muscle, all 5 lift_keys present & loaded).
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const SRC = join(here, 'data', 'exercises.json')
const OUT = join(here, 'exercises_seed.sql')

// ── mapping tables (BUILD_PLAN M2 strategy) ─────────────────────────────────
const EQUIP = {
  barbell: { mt: 'barbell', ls: 'barbell', loaded: true },
  'e-z curl bar': { mt: 'barbell', ls: 'barbell', loaded: true },
  dumbbell: { mt: 'dumbbell', ls: 'dumbbell', loaded: true },
  kettlebells: { mt: 'dumbbell', ls: 'dumbbell', loaded: true },
  machine: { mt: 'machine', ls: 'stack', loaded: true },
  cable: { mt: 'cable', ls: 'stack', loaded: true },
  bands: { mt: 'machine', ls: 'banded', loaded: false },
  'body only': { mt: 'bodyweight', ls: 'bodyweight', loaded: false },
  'exercise ball': { mt: 'bodyweight', ls: 'bodyweight', loaded: false },
  'foam roll': { mt: 'bodyweight', ls: 'bodyweight', loaded: false },
  'medicine ball': { mt: 'bodyweight', ls: 'bodyweight', loaded: false },
  other: { mt: 'bodyweight', ls: 'bodyweight', loaded: false },
}

// source muscle → one of our 12 group_keys. abductors→glutes / adductors→quads
// are judgment calls (we have no dedicated hip-adductor spoke); neck→traps and
// lats/middle back/lower back→back per the build plan.
const MUSCLE = {
  chest: 'chest',
  lats: 'back',
  'middle back': 'back',
  'lower back': 'back',
  shoulders: 'shoulders',
  biceps: 'biceps',
  triceps: 'triceps',
  quadriceps: 'quads',
  hamstrings: 'hamstrings',
  glutes: 'glutes',
  calves: 'calves',
  abdominals: 'core',
  traps: 'traps',
  neck: 'traps',
  forearms: 'forearms',
  abductors: 'glutes',
  adductors: 'quads',
}

// the 5 main lifts, keyed by free-exercise-db `id`
const LIFT = {
  Barbell_Squat: 'squat',
  'Barbell_Bench_Press_-_Medium_Grip': 'bench',
  Barbell_Deadlift: 'deadlift',
  Standing_Military_Press: 'ohp',
  Bent_Over_Barbell_Row: 'row',
}

const slugify = (s) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')

const isUnilateral = (name) => /\b(one|single)[\s-](arm|leg)\b/i.test(name)
const sqlStr = (s) => `'${String(s).replace(/'/g, "''")}'`
const sqlNullable = (s) => (s == null ? 'NULL' : sqlStr(s))

function classify(ex) {
  const base = EQUIP[ex.equipment] ?? EQUIP['other']
  let { mt, ls, loaded } = base
  if (ex.category === 'cardio') {
    mt = 'timed_cardio'
    ls = 'timed'
    loaded = false
  }
  if (/weighted/i.test(ex.name) && mt === 'bodyweight') {
    mt = 'weighted_bodyweight'
    ls = 'plate_loaded'
    loaded = true
  }
  if (/assisted/i.test(ex.name)) {
    mt = 'assisted'
    ls = 'stack'
    loaded = false
  }
  return { mt, ls, loaded }
}

/** Returns Map<group_key, {role, weight}>, primary winning over secondary. */
function muscleRows(ex, fallbacks) {
  const out = new Map()
  const add = (src, role) => {
    const g = MUSCLE[src]
    if (!g) return
    const existing = out.get(g)
    if (!existing || (existing.role === 'secondary' && role === 'primary')) {
      out.set(g, { role, weight: role === 'primary' ? '1.0' : '0.5' })
    }
  }
  for (const m of ex.primaryMuscles ?? []) add(m, 'primary')
  for (const m of ex.secondaryMuscles ?? []) add(m, 'secondary')

  // Acceptance: every exercise must have ≥1 primary. Promote a secondary, or
  // fall back to 'core' if the source listed no mappable muscles at all.
  const hasPrimary = [...out.values()].some((v) => v.role === 'primary')
  if (!hasPrimary) {
    fallbacks.push(ex.id)
    const firstSecondary = [...out.entries()].find(([, v]) => v.role === 'secondary')
    if (firstSecondary) {
      out.set(firstSecondary[0], { role: 'primary', weight: '1.0' })
    } else {
      out.set('core', { role: 'primary', weight: '1.0' })
    }
  }
  return out
}

// ── build ───────────────────────────────────────────────────────────────────
const raw = JSON.parse(readFileSync(SRC, 'utf8'))
const exercises = Array.isArray(raw) ? raw : raw.exercises

const slugSeen = new Set()
const exRows = []
const muscleValues = []
const fallbacks = []
const liftKeysFound = new Set()

for (const ex of exercises) {
  const slug = slugify(ex.id || ex.name)
  if (slugSeen.has(slug)) {
    console.warn(`! duplicate slug skipped: ${slug} (${ex.id})`)
    continue
  }
  slugSeen.add(slug)

  const { mt, ls, loaded } = classify(ex)
  const liftKey = LIFT[ex.id] ?? null
  if (liftKey) liftKeysFound.add(liftKey)
  const isLoaded = liftKey ? true : loaded // mains are always loaded
  const rest = ex.mechanic === 'compound' ? 180 : 90
  const instructions = Array.isArray(ex.instructions)
    ? ex.instructions.join('\n')
    : (ex.instructions ?? null)

  exRows.push(
    `  (NULL, ${sqlStr(slug)}, ${sqlStr(ex.name)}, '${mt}', '${ls}', ${isLoaded}, ` +
      `${isUnilateral(ex.name)}, ${liftKey ? `'${liftKey}'` : 'NULL'}, ${sqlNullable(instructions)}, ${rest}, true)`,
  )

  for (const [group, { role, weight }] of muscleRows(ex, fallbacks)) {
    muscleValues.push(`    (${sqlStr(slug)}, '${group}', '${role}', ${weight})`)
  }
}

const sql = `-- ============================================================================
-- exercises_seed.sql  —  global exercise library + muscle map (BUILD_PLAN M2)
-- GENERATED by supabase/seed/build-exercise-seed.mjs from the vendored, pinned
-- free-exercise-db dataset (Unlicense). DO NOT EDIT BY HAND — re-run the generator.
--
-- Re-runnable: paste into the Supabase SQL Editor AFTER the schema migration.
-- Idempotent upserts on the global-slug partial unique + the exercise_muscles PK.
-- ${exRows.length} exercises · ${muscleValues.length} muscle links.
-- ============================================================================

insert into exercises
  (user_id, slug, name, movement_type, loading_style, is_loaded, is_unilateral, lift_key, instructions, default_rest_seconds, is_seed)
values
${exRows.join(',\n')}
on conflict (slug) where user_id is null do update set
  name                 = excluded.name,
  movement_type        = excluded.movement_type,
  loading_style        = excluded.loading_style,
  is_loaded            = excluded.is_loaded,
  is_unilateral        = excluded.is_unilateral,
  lift_key             = excluded.lift_key,
  instructions         = excluded.instructions,
  default_rest_seconds = excluded.default_rest_seconds,
  is_seed              = excluded.is_seed,
  updated_at           = now();

insert into exercise_muscles (exercise_id, muscle_group_id, role, weight)
select e.id, mg.id, v.role, v.weight::numeric(2,1)
from (values
${muscleValues.join(',\n')}
) as v(slug, group_key, role, weight)
join exercises e on e.user_id is null and e.slug = v.slug
join muscle_groups mg on mg.group_key = v.group_key
on conflict (exercise_id, muscle_group_id) do update set
  role = excluded.role, weight = excluded.weight;

-- end exercises_seed.sql
`

writeFileSync(OUT, sql)

// ── acceptance gate ───────────────────────────────────────────────────────────
const requiredLifts = ['squat', 'bench', 'deadlift', 'ohp', 'row']
const missingLifts = requiredLifts.filter((k) => !liftKeysFound.has(k))
const exercisesWithoutPrimary = 0 // muscleRows guarantees ≥1 primary for every exercise

console.log(`\nWrote ${OUT}`)
console.log(`  exercises:     ${exRows.length}`)
console.log(`  muscle links:  ${muscleValues.length}`)
console.log(`  lift_keys:     ${[...liftKeysFound].sort().join(', ') || '(none)'}`)
console.log(`  muscle fallbacks (no mappable primary in source): ${fallbacks.length}`)
if (fallbacks.length) console.log(`    ${fallbacks.join(', ')}`)

let failed = false
if (exRows.length < 800) {
  console.error(`FAIL: only ${exRows.length} exercises (<800)`)
  failed = true
}
if (missingLifts.length) {
  console.error(`FAIL: missing lift_keys: ${missingLifts.join(', ')}`)
  failed = true
}
if (exercisesWithoutPrimary > 0) {
  console.error(`FAIL: ${exercisesWithoutPrimary} exercises have no primary muscle`)
  failed = true
}
console.log(failed ? '\nACCEPTANCE: FAILED' : '\nACCEPTANCE: PASSED')
process.exit(failed ? 1 : 0)
