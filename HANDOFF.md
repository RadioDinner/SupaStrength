# HANDOFF.md — SupaStrength live cross-session state

> Repo-root, project-wide state document. Updated every session. For per-session
> detail see `Session log/NNN_<date>/session_log.md`.

## Where the project is

**🎉 PHASE 1 COMPLETE — M1–M8 all DONE. Design system — DONE.**

> **Post-Phase-1 polish (this session, on `main`):**
> - **Real type system** — replaced `system-ui` with self-hosted **Archivo +
>   Inter** (token-driven `--font-display`/`--font-num`/`--font-body`; swap a
>   direction by changing 3 tokens). The biggest single visual upgrade; the slop
>   detector was already clean, the missing font identity was the real issue.
> - **Warm-up ramp in the live session** — wired the tested `engine/warmups`
>   (empty bar → 55/70/85%, plate-rounded) as tappable guidance above the working
>   sets (not persisted). Closes the M5 "warmups not auto-generated" gap.
> - **Workout exercise reorder (↑/↓)** — `workoutsRepo.swapPositions` via a
>   collision-free 3-write temp-sentinel swap. Closes the M3 "append+delete only"
>   gap.
> - **Media-retention purge scheduled** — `9998_purge_media_cron.sql` (pg_cron
>   daily) + a `supabase/functions/purge-media` Edge Function alternative. Closes
>   the M8 "purge not scheduled" gap. (pg_cron isn't in the local PG build, so the
>   cron migration is unvalidated-locally but standard Supabase usage.) The user can run
real workouts on their phone end to end: build templates → schedule rotations →
log live sessions with auto-progression + plate calc + rest timer → see radar
analytics → capture form videos → track photos/measurements/reminders — all
online, multi-user-safe via RLS. **Next: live smoke-test against the real Supabase
project, then Phase 2 (offline/local-first) or polish.** Spec, data model,
migration, build plan done. User
completed account setup. Session 001 shipped the pure progression engine + plate
calculator (`src/engine/*`, 62 tests), M1 (auth/profile/equipment/shell) + auth
fixes, M2 (exercise library seed + browser), M3 (workout builder), M4 (routine
scheduler), M5 full (live session logging + plate calc + rest timer + **engine
auto-progression**), a bold dark+light design system, a live-session **redesign**
(impeccable critique → "the set is the hero"), and **M6 (analytics radar)**. The
app is a complete end-to-end auto-progressing workout logger with analytics.
typecheck + lint + build + 62 tests green.

### M8 — DONE (photos + measurements + reminders — Phase 1 exit)
- All tables (`body_measurements`, `progress_photos`, `reminders`) + the
  `reminders_due` view + the bump triggers + `purge_expired_media` RPC were
  already in `9999_init.sql`. M8 is the repos + UI:
- **`measurementsRepo`**: one mutable row/day (`upsert` on `user_id,taken_on`),
  typed girth columns + jsonb `extra`, and a **CSV importer** (header alias
  `date`/`taken_on`, label↔key mapping, quoted cells, unknown cols ignored).
  `parseCsv` is pure — **7 unit tests** in `tests/repos/measurementsCsv.test.ts`.
- **`photosRepo`**: categorized upload to the private `progress-photos` bucket
  (`{userId}/{photoId}.{ext}`) with orphan-object rollback, signed-URL reads,
  delete. **`remindersRepo`**: `ensureDefaults` (weigh-in 7d / measurements 14d /
  photos 28d, insert-if-missing), `listDue` (reads the view), `markDone` / `snooze`
  / `setEnabled`.
- **`features/progress/`**: `ProgressPage` (segmented Measurements / Photos /
  Reminders), `PhotosSection` (capture, grid, **side-by-side two-date compare**),
  + `DueNudges` exported and dropped at the top of **Home** so a completed session
  (which navigates to `/`) shows the due check-ins (the "post-workout nudge").
  Linked from Profile. CSS for the measure grid, history table, switch, photo
  grid/compare, reminder rows (actions wrap to their own line on mobile).
- **VALIDATED on PG16**: one-row-per-day upsert (200→199, total_rows=1); the
  measurement-insert **bump trigger** updates weigh_in + measurements
  `last_done_at`; `reminders_due` then shows those NOT due and photos (never
  logged) DUE. Exactly what the repos/hooks expect.
- **Photos storage path can't be tested here** (no device/live Storage) — same
  caveat as M7; flagged for a phone smoke-test. The `purge_expired_media` RPC
  exists but is **not yet scheduled** (needs a Supabase cron / Edge Function — a
  deploy step, deferred). `tsconfig.test.json` gained `vite/client` types (the new
  repo test transitively pulls in `import.meta.env`).

### M7 — DONE (form-video bones — scaffold only)
- **Storage seam** added to `DataClient` (`uploadFile` / `signedUrl` /
  `removeFiles`) + Supabase impl — the repo layer stays the only `getSupabase`
  consumer. The `form-videos` + `progress-photos` private buckets and their RLS
  (owner = first path segment) were already in `9999_init.sql`.
- **`videosRepo`**: `recordForSet({userId,setLogId,file,durationSeconds})` →
  uploads to `form-videos/{userId}/{videoId}.{ext}`, inserts a `videos` row,
  links it both ways to the set (`set_logs.video_id` + `videos.set_log_id`),
  and rolls back the orphaned object if the row insert fails. `getForSet`,
  `signedUrl` (60-min), `delete` (object + row; the `on delete set null` FK
  clears `set_logs.video_id`). 30 s cap enforced (`MAX_VIDEO_SECONDS`).
- **`features/session/VideoSheet`** + `useVideos` hooks: per **logged** set a 🎥
  button opens a sheet — native-camera capture (`<input capture>`, duration read
  client-side via a throwaway `<video>`, >30 s rejected) when empty, or scrub +
  **slow-mo** (0.25/0.5/1×) playback + delete when a clip exists. No analysis
  (clean seam for future pose/form work). CSS: `.setvid` + video sheet; the
  done-row layout was tightened so the 4th (🎥) button fits without overflow.
- **CANNOT be live-tested here** (no device camera, no live Supabase Storage):
  the upload / signed-URL / storage-RLS path is typecheck/build-verified only.
  **Smoke-test on a phone**: log a set → 🎥 → record ≤30 s → it uploads, attaches,
  and plays back with scrub + slow-mo; a 2nd user must not be able to fetch the
  path. Capture must happen **while the session is in progress** (completed-session
  `set_logs` are frozen by the immutability triggers, so `video_id` can't change
  after completion — post-completion video management is deferred).

### M6 — DONE (analytics radar)
- **Schema was already in `9999_init.sql`** — all 7 `v_*` views
  (`v_set_log_metrics`, `v_muscle_volume_weekly`, `v_exercise_e1rm`,
  `v_muscle_strength`, `v_strength_vs_standards`, `v_frequency`, `reminders_due`,
  all `security_invoker`) + `chart_preferences` + `strength_standards` + the
  `muscle_groups` `radar_order` seed. So **no new migration** was needed (the
  HANDOFF's old "author them as `9998_*`" step was superseded — they ship in init).
- **`supabase/seed/strength_standards_seed.sql`** — re-runnable (delete-by-source
  + insert), **ratio-form** novice→elite for the 5 mains × 2 sexes (10 rows);
  `v_strength_vs_standards` resolves ratio→lb via the user's bodyweight at query
  time, so one all-bodyweight bracket covers everyone. Source tag
  `supastrength-ratio-v1` (synthesized; not a copy of a proprietary table). User
  must paste it into the SQL Editor (like the exercises seed).
- **`analyticsRepo`** reads the views (window-filters `v_muscle_volume_weekly` by
  `week_start` and sums in JS; `v_frequency` by `time_window`) + get/upsert
  `chart_preferences`. **`useAnalytics`** hooks (optimistic prefs). Recharts dep
  added (`recharts@3`).
- **`features/analytics/AnalyticsPage`** + "Stats" tab (`/analytics`, 6 tabs now):
  Recharts radar over the 12 groups in `radar_order` (volume↔strength mode,
  metric toggle, 7d/4wk/12wk/all window, count-secondary), a **weakest-areas**
  panel (relative-to-you bars **or** strength-vs-standards bands with a
  stale-bodyweight warning), and "most often" workout/exercise/muscle lists. All
  UI state persists in `chart_preferences`. CSS added (segmented controls, bars,
  std bands, freq lists).
- **VALIDATED on real PG16** (Supabase-stubbed): init migration + both seeds +
  fixtures (squat 315×5, bench 225×5, +warmup) → every view returns correct
  numbers (warmup excluded; e1RM squat 367.5 / bench 262.5; primaries 3 hard sets,
  secondaries 1.5; squat & bench → `intermediate` band off the ratio seed at
  200 lb bw; frequency counts right). The standards seed ran **twice** cleanly.
  **This is the first live exercise of the analytics view layer — it works.**
- Design verified by headless-Chromium static previews of the Stats screen in
  both themes (sent to the user). Note: the radar tick fill uses `var(--muted)`
  (a defined token; an earlier `var(--text-dim)` typo was fixed).

### M5b/M5c — DONE (live session logging)
- `sessionsRepo`: `startFromWorkout` / `startNextGymDay` (snapshot entries →
  `session_entries` + `set_logs`), `updateSetLog`, `complete` (advances the
  routine's rotation pointers via `engine/schedule`, flips session to completed).
- `features/session/`: SessionPage (entry-level working weight, **inline plate
  calculator** = `engine/solvePlates` over the location's bar+inventory+prefs,
  **rest timer**, per-set rep logging + done toggle, AMRAP field), Start buttons
  on Workouts (single) + Routine builder ("Start this day"), resume-active banner,
  `/session/:id` route.
- **Weight is entered manually this slice** (the plate calc assists); engine
  auto-progression is M5d. **Not run against the live DB from here.**

### Design system — DONE (impeccable pass)
`PRODUCT.md` + `DESIGN.md` (register: product; vibe bold/high-energy; ref
Hevy/Strong). `src/styles/index.css` is a tokenized **OKLCH** system with
first-class **dark + light** themes (`useTheme`, persisted, pre-paint inline
script in `index.html`, toggle in the app bar). One electric-indigo accent,
tabular numerals, AA contrast, reduced-motion fallback, no AI-slop tells.
Verified by rendering the session screen in both themes via headless Chromium.
The `impeccable` skill lives in `.agents/skills/impeccable` — run
`$impeccable polish <screen>` / `critique` / `live` for further per-screen work.

### M5d — DONE (engine auto-progression)
- `engine/presets.ts` `defaultPipeline` derives a pipeline from `rep_scheme`
  (straight → linear +5; double → double progression; rpe → none) — pure, tested.
- `data/repos/sessionCommit.ts` `commitSessionProgression`: on complete, per
  exercise, evaluate success/failure from `set_logs`, run `applyProgression` /
  `applyFailure` over `progression_state` (weight, deduped once per exercise via
  the heaviest "driving" entry) + `progression_entry_state` (rep/set per entry),
  cold-starting the weight line from what was lifted; upserts both.
- `sessionsRepo.startNextGymDay` now prescribes `planned_weight`/reps from
  `progression_state`/`progression_entry_state` and consumes consolidation holds;
  `SessionPage` prefills the weight input from the prescription.
- **Open items / not-yet-done in M5d:** `audit_log` rows are NOT written yet
  (deferred — progression values are correct without them); only the driving
  entry advances weight (multi-appearance-same-day handled, common single-entry
  case is the tested path); warmups not auto-generated in the session; single
  **workout** sessions (no routine) stay manual (no `progression_state`).
- **CRITICAL: not yet run against a live DB.** The engine is exhaustively unit
  tested, but the `sessionCommit`/`sessionsRepo` DB wiring (verdict eval, upserts,
  cold-start, consolidation consume) has only been typecheck/build verified.
  First real routine session → complete → next session should smoke-test that the
  weight climbed. Watch the upsert on-conflict targets
  (`routine_id,exercise_id` / `routine_id,workout_entry_id`).

### M4 — DONE
- `routinesRepo`: routines (≤1 active via deactivate-then-activate), rotations,
  rotation_workouts; `advanceAll` + `nextGymDay` delegate to the pure, tested
  `engine/schedule`.
- `features/routines/`: Routines list (create / make-active) + builder
  (`/routines/:id`) — add rotations, add workouts to each, see the computed
  "next gym day" (head of every rotation) with the current pointer highlighted,
  and an "Advance to next day (skip)" button that persists the wrapped pointers.
- Nav: added "Routines" tab; **dropped Equipment from the tab bar** (5-tab cap) —
  it's now reached from the Profile page. Append+delete only (no reorder yet).
- **Caveat:** not run against the live DB from here.

### M3 — DONE
- `workoutsRepo` (workouts + workout_entries: ordered prescription, NO weight).
- `features/workouts/`: Workouts list (create/archive) + builder (`/workouts/:id`)
  — add exercises via a search picker, set sets / rep scheme (straight | double) /
  rest / last-set AMRAP, with client validation (straight needs rep_target;
  double needs low ≤ high). "Workouts" nav tab; Home checklist links to it.
- **Caveat:** not run against the live DB from here. Reorder of entries was left
  out of the MVP (append + delete only) to avoid the deferred-unique dance —
  add via a swap-RPC or temp-position shuffle later.
- Per user (session 001): keep to the M-plan order; "really sweet workout app"
  polish comes as the milestones land, not by reordering them.

### M2 — DONE
- Seed: `supabase/seed/` — vendored, pinned free-exercise-db (Unlicense);
  `build-exercise-seed.mjs` emits a re-runnable `exercises_seed.sql` (873
  exercises + 2416 muscle links, 5 lift_keys, 0 zero-primary). **Validated on
  real Postgres, run twice (re-runnable).** User pastes the SQL into the SQL
  Editor after the migration (README step 5).
- UI: `exercisesRepo` (ILIKE name search + movement filter + custom-exercise
  create), `features/exercises/` browser (search/filter/expandable muscles +
  instructions), custom-exercise form (shadows seed slugs), "Exercises" nav tab.
  Added `ilike` op to the DataClient seam.
- **Caveat:** not run against the live DB from here. Browser shows exercises only
  after the user pastes `exercises_seed.sql`.

### M1 — DONE
- Data seam expanded: `src/data/client.ts` (`list/getOne/insert/update/upsert/
  remove/rpc`) + `src/data/online/supabaseDataClient.ts`.
- Auth: `src/data/auth.ts` (wraps `supabase.auth`) + `src/hooks/useAuth.tsx`
  (`AuthProvider` + `useAuth`: status/user/session + signIn/signUp/magic-link/out).
- Repos + bootstrap: `profileRepo`, `equipmentRepo`,
  `bootstrap.ts::ensureUserSetup` (idempotent; seeds the home gym — 45 bar, plates
  2.5/5/10/15/25/35/45 ×2, dumbbells 15/20/25 ×2, default "Home Gym").
- Screens: `features/auth/AuthScreen`, `features/settings/ProfilePage`,
  `features/equipment/EquipmentPage` (plate quantities → derived pairs, prefs,
  live max-loadable readout from the engine), `routes/AppShell` (bottom-tab nav),
  `routes/BootstrapGate`, auth+bootstrap gates in `App.tsx`, `AuthProvider` in
  `main.tsx`.
- **Caveat:** built structurally + typechecked/built clean, but NOT yet run
  against the live Supabase project from this session (no env here). First real
  login should be smoke-tested. Email confirmation may be ON — if sign-up stalls,
  disable "Confirm email" (Auth → Providers → Email) or click the emailed link.

### M5a engine — DONE (`src/engine/*`, pure, no I/O)
`weight` (exact centi-pound math), `plates` (solvePlates exact subset-sum,
dumbbell snap, maxLoadable), `pipeline` (resolvePipeline + applyProgression state
machine), `failure` (chainable responses), `warmups`, `schedule`, `prescribe`
(consolidation hold). 59 tests in `tests/engine/` cover every SPEC §4 / §6
scenario; engine coverage ~98%. A 4-agent adversarial pass confirmed correctness;
one real bug fixed (warmup rungs could meet/exceed working weight) + one doc fix.

### Engine encoding notes (read before wiring M5b–M5d)
- **`reset` applies at step FIRE, not at a cap transition** — atomic with the
  step's own effect. Double progression resets reps on its *weight* step; the
  shoulders ladder resets reps on its *sets* step. DATA_MODEL §6 "Shoulders" was
  corrected to put `reset:reps_to_base` on the sets step (the literal old
  encoding on the reps step would reset every completion and break the ramp).
- **Failure cursor advances PAST an applied deload**, so a long chain
  `[repeat3, deload, repeat3, deload]` holds at the next response instead of
  double-deloading.
- **Consolidation compares the pound delta** (computed lb increment), not the raw
  `step.amount` (which is a % for pct modes).
- **Multi-entry same-day weight dedupe is NOT in the pure engine** — it is
  session-commit orchestration (M5d): one weight advance per (session, exercise)
  via the driving entry; rep/set advances per entry.
- The engine works on a single entry's resolved pipeline + states; M5b–M5d wire it
  to `progression_state` / `progression_entry_state` / sessions.

## Source-of-truth documents (authority chain)

1. `docs/SPEC.md` — locked product/technical spec for features #1–#8. **Start here.**
2. `docs/DATA_MODEL.md` — the Postgres schema explained (33 tables, RLS, views),
   with a worked walkthrough of every progression scenario.
3. `supabase/migrations/9999_init.sql` — single **re-runnable** initial migration
   (paste by hand into the Supabase SQL Editor). Descending-numbered per house rule.
   ✅ Validated on local PG16 with Supabase stubs: runs clean on a fresh DB and is
   idempotent on re-run (33 tables / 7 views / 124 policies).
4. `docs/BUILD_PLAN.md` — phased, ordered roadmap (Phase 0 scaffold → Phase 1 MVP).
5. `docs/DESIGN_REVIEW.md` — the 22-finding adversarial audit + how each was fixed.

## Key locked decisions (quick recall)

- **Stack:** Vite + React + TypeScript SPA → Vercel; Supabase (Postgres/Auth/
  Storage/RLS). PWA-ready. Single user now, multi-user-ready via RLS.
- **Phasing:** online web → offline (local-first) → Android (Capacitor).
- **Engine:** progression = ordered **step pipeline** (weight/reps/sets dims).
  **Working weight is shared per (routine, exercise)**; rep/set live state is
  per (routine, workout_entry). Settings inherit routine→workout→exercise.
- **Equipment:** one pair each 2.5–45 + dumbbells 15/20/25 + one 45 bar →
  loadable 45–320 lb in 5 lb steps. Round up/down is a user setting; gap-workout
  consolidation is opt-in.
- **Analytics:** 12 muscle groups; volume (sets/wk default, tonnage, reps);
  strength = Epley est-1RM + standards on the 5 main lifts.
- **#7 sync:** deferred to backlog. **#8:** light-spec defaults.

## Next step

**✅ Live-DB prerequisites are DONE (user, around session 002 / 2026-07-01):**
`9999_init.sql` pasted, **both** seeds run (`exercises_seed.sql` +
`strength_standards_seed.sql`), and the Supabase **Site URL** fixed
(`https://supa-strength.vercel.app`, no port). The DB is loaded and reachable.

**So the one remaining gate is the live smoke-test itself** — it has NOT run yet
(session 002's PowerShell kept crashing before it started). Smoke-test the whole
loop end-to-end against the live DB: sign up → build a workout → make a routine
with rotations → make it active → "Start this day" → log sets (plate calc + rest
timer) → Complete → start the next day and confirm the weight **climbed** (M5d)
and the rotation advanced. First live exercise of the `sessionCommit` wiring —
watch the upsert on-conflict targets (`routine_id,exercise_id` /
`routine_id,workout_entry_id`) and RLS with a 2nd user. Then check the Stats
screen's "vs standards" bands resolve off the strength_standards seed.

**Phase 1 is COMPLETE (M1–M8).** The remaining work is operational + Phase 2:

1. **Live smoke-test against the real Supabase project** — the single biggest
   open item. Everything below the engine (M1–M8 DB wiring) is typecheck/build/
   PG16-validated but has **never run against the live project from here**. Paste
   the migration + the two seeds (exercises + strength_standards), then exercise
   the whole loop: sign up → build workout → routine → live session (log sets,
   plate calc, rest timer, form video) → complete → confirm the weight **climbed**
   (M5d) → Stats radar → log a measurement/photo → see the reminder bump. Watch
   RLS with a 2nd user and the upsert on-conflict targets.
2. **Schedule `purge_expired_media`** (Supabase cron / Edge Function) to enforce
   the 30-day video / 1-year photo retention — a deploy step, not code.
3. **Phase 2**: offline/local-first (implement the `DataClient` seam against a
   local store) → Android (Capacitor). Or more `$impeccable` polish per screen.

Engine reuse: M4/M5 should import `src/engine` and follow the "Engine encoding
notes" above — the pure functions are done and tested; the remaining work is the
DB orchestration around them.

## House rules (from new_session_instructions.md)

- Session log folder + `prompt_history.txt` every session (log every prompt).
- Migrations: descending 4-digit numbering, re-runnable. Next file: `9998_*`.
- Work commits directly to `main` (per the user's standing instruction).
