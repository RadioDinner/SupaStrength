# Session 003b — 2026-07-02 (remote Claude session)

Branch: `claude/muscle-groups-lift-comparison-50qojl` (remote sessions push to
their designated `claude/*` branch, not main).

## What shipped

**New feature: Strength analysis page** (`/analytics/strength`, linked from a
key row at the top of Stats) — the Symmetric-Strength-style analysis the user
asked for with reference screenshots:

1. **Interactive body map** (`features/analytics/BodyMap.tsx`) — front + back
   anatomy SVGs (male/female per profile sex), each of the 12 house muscle
   groups filled by its estimated strength band and tappable (keyboard
   accessible, one focusable control per view×group; selection = amber stroke).
   Tapping opens a detail panel: band + score + the main lifts that drive that
   group (logged → e1RM + band; unlogged → called out).
2. **Class slider** (`Compare to a lifter`) — 7 stops from the user's
   screenshots: Untrained 30 / Novice 45 / Intermediate 60 / Proficient 75 /
   Advanced 90 / Elite 112.5 / World class 125. Per main lift, paired bars:
   your e1RM (ink) vs the expected 1RM at the selected class **at your
   bodyweight/sex** (steel blue), with signed lb deltas (good/bad text).
   Defaults to the user's own overall class.
3. **Strongest & weakest muscle lists** (tap → selects on the map) and an
   **Estimated one-rep maxes** list with band badges (neutral ink badges per
   the v2 "no band rainbow" precedent).

**Engine** (`src/engine/strengthClasses.ts`, pure, 15 tests): ratio-form
thresholds per (sex, lift, class) — male calibrated so 200 lb reproduces the
reference tables exactly (test-pinned); female = house seed's female/male
proportions interpolated across the ladder. Continuous lift score by piecewise
linear interpolation (0 lb → 0, extrapolated past World class, capped at 150);
`bandForScore` (Subpar below Untrained); editorial lift→muscle weights
(12 groups; calves not rankable from the 5 mains — stays neutral, like the
reference app greys them); `muscleScores` (weighted mean over logged lifts
only), `overallScore` (mean).

**Data** — `analyticsRepo.liftE1rms()` + `useLiftE1rms`: best e1RM per
lift_key from lift-tagged exercises × `v_exercise_e1rm`, resolved client-side
(needs no standards seed / bodyweight / sex). **No new migrations or seeds.**

**Vendored** (`features/analytics/bodyPaths.ts`, generated): body-map path
data from react-native-body-highlighter v3.2.0 (MIT, ELABBASSI Hicham),
attribution in the file header. Front adductors fold into quads, back
adductors into hamstrings (no house adductor group).

**Design**: new ordinal class ramp `--class-0..7` — ONE hue (blued steel 245),
monotone lightness, pale→deep on white / dim→bright on graphite; **validated
by the dataviz ordinal checks in both themes** (ΔL ≥ 0.06 per step, near-
surface end ≥ 2:1). Amber stays selection-only (map selection stroke, slider
tick, knob focus ring). Verified by headless-Chromium screenshots: both
themes at 390px + empty-state at 320px (no horizontal overflow, no console
errors).

## Decisions

- **7 slider classes, not 9**: the user supplied tables for exactly these 7.
  Subpar exists as a *band* (below Untrained) on the map/legend but is not a
  slider stop (it has no thresholds). **Exceptional** (between Advanced and
  Elite in the reference legend) was NOT included — no table was provided.
  The engine types make adding it a data-only change if the user sends it.
- Class ladder lives **client-side** (pure engine module), not in
  `strength_standards`: the DB table's fixed 4-band columns don't fit a
  7-class ladder, the user hand-pastes migrations, and nothing else queries
  it. The existing standards seed/view stay untouched (Stats "vs standards"
  panel unchanged).
- Band badges stay **neutral ink** (v2 precedent in `.std__band`); the ramp
  colors only the body map + legend swatches.
- "Them" comparison bars wear a fixed mid-ramp step (`--class-4`), never
  repainted by the slider (color follows the entity).

## Open questions / next steps

- Does the user want the **Exceptional** class added (needs its table)?
- Reference app also shows a **symmetry score** and a **"Relative strengths"**
  diverging chart (per-lift % vs your overall score) — natural follow-ups,
  not built this session.
- Live smoke-test still outstanding (unchanged from HANDOFF).
- The user may want the muscle-map feature surfaced elsewhere (e.g. Home).

## Notes for future sessions

- Preview harness pattern (esbuild + hook-stub plugin + Playwright at
  `/opt/pw-browsers/chromium`, global playwright-core under
  `/opt/node22/lib/node_modules`) worked well for screenshotting a hook-driven
  page without live Supabase.
- `npm ci` needed at container start (fresh clone).
