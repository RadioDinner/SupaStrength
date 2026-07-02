# HANDOFF.md — SupaStrength live cross-session state

> Repo-root, project-wide state document. Updated every session. For per-session
> detail see `Session log/NNN_<date>/session_log.md`.

## Where the project is

**🎉 PHASE 1 COMPLETE — M1–M8 all DONE. Design system — v2 ("calibrated instrument"). Per-set training control (session 003) live in prod.**

> **Session 003 (2026-07-02) — deletion, per-set training control, notes,
> backfill; 5 new migrations ALL APPLIED by the user** (direct-to-main
> authorized for the whole session; detail in
> `Session log/003_2026-07-02/session_log.md`):
> - **DB state:** user confirmed running every pending migration — the live
>   schema now includes `9996` (owner hard-delete of completed sessions;
>   audit_log lets FK set-null cascades through), `9995` (child immutability
>   triggers allow reference-detach writes — un-broke `purge_expired_media()`,
>   which aborted on any expired clip attached to completed history), `9994`
>   (`workout_entries.starting_weight`), `9993` (`workout_entry_sets` per-set
>   targets, rep-ladder overload columns, `session_entries.notes`), `9992`
>   (per-set `rest_seconds`, `set_logs.planned_rest_seconds`, and the
>   `exercises.user_id default auth.uid()` RLS fix), plus the fixed `9998`
>   (named `cron.schedule()` upsert instead of DML on `cron.job` — 42501).
> - **History:** delete completed sessions (confirmed dialog; eager form-video
>   cleanup; progression NOT rolled back) and **"Log past session"** backfill
>   (date/time/duration + fill sets; lands completed; deliberately does NOT
>   advance progression/ladders/rotations).
> - **Builder = set-table layout** (per the user's old-tracker screenshot):
>   per-exercise SET | PREVIOUS | LB | REPS grid, always editable, saves on
>   the fly; PREVIOUS = newest completed actuals (`sessionsRepo.lastActuals`);
>   per-set rest editable at the divider between rows; quiet "Add set" link;
>   adding an exercise drops it in instantly (3×8, rest 3:00) — same surface.
> - **Overload per entry:** `overload_mode='rep_ladder'` — each set that hits
>   its target climbs a rep (failed sets HOLD, independently — inferred from
>   the user's 9/8/5 example); all-at-cap → weight +increment, reps reset to
>   floor; advanced targets write back to `workout_entry_sets` (builder shows
>   live state); excluded from the shared engine line; runs for routine AND
>   single-workout sessions. Pure module `engine/repLadder.ts` (10 tests).
>   Typed per-set targets on ENGINE entries = fixed manual targets.
> - **Notes:** sticky per-exercise (`workout_entries.notes`, banner in builder
>   + pinned line in session) and per-occurrence (`session_entries.notes`,
>   "note for today" in session, shown in History detail).
> - Routine **rename**; exercise picker **creates custom exercises inline**
>   (the RLS bug that broke ALL custom-exercise creation is fixed in 9992).
> - **Bodyweight weigh-in** at workout completion ("Finish & lock?" sheet,
>   placeholder = profile weight) and on the backfill form —
>   `useLogBodyweight()` merge-upserts that day's `body_measurements` row
>   (DB trigger bumps the weigh-in reminder) and syncs the canonical
>   `user_profiles.bodyweight_lb` ONLY when dated today (backdates must not
>   overwrite the §9 standards weight). Best-effort: never blocks completion.
> - **93 tests green**; every migration verified re-runnable on a scratch
>   Postgres 16 with Supabase shims (incl. RLS check under `authenticated`).
> - **Known issues / next-session candidates:** `auth.users → audit_log`
>   cascade still blocks full account deletion (pre-existing); payoff sheet
>   shows no "Next time" line for ladder entries; UI not click-tested from
>   this env (no Supabase creds) — user hasn't reported device testing of the
>   new builder/backfill/bodyweight screens yet, expect screenshot-driven
>   tweaks; possible "count backfill toward progression" toggle.
> - Session commits (all on main): `ba4eb2a`, `bca66c1`, `1143538`, `6b03f17`,
>   `da633b7`, `a2f2054`, `05cf0e2`, `2408e69`, `4970e92` + the wrap commit.

> **Session 002b (later, same session) — FULL VISUAL TEARDOWN → v2 "calibrated
> instrument"** (user directive: tear the visual design down, rebuild clean /
> professional / sharp, kill the rounded "vibe-coded" look; direct-to-main
> authorized):
> - **New system** (all in `src/styles/index.css` tokens + skins; markup mostly
>   untouched): true-neutral chassis (light = **pure white**, dark = graphite,
>   chroma 0), primary actions = **ink keys** (`--action`/`--on-action`), ONE
>   **amber signal lamp** (`--accent`: bronze `oklch(0.52 0.11 80)` light /
>   amber `oklch(0.78 0.14 85)` dark) reserved for live + selected state,
>   **JetBrains Mono for every numeral** (`--font-num`), Inter-only UI type,
>   **radius 0 everywhere**, hairline borders, `--shadow: none`, no backdrop
>   blur, gradients flattened. Fonts swapped in `main.tsx` (archivo/oswald/
>   space-grotesk deps removed); favicon/icon recolored; theme-color metas
>   split dark/light (`#0c0c0c` / `#ffffff`); PWA manifest colors updated.
> - **Palette AA-verified by script** (OKLCH→sRGB WCAG, 38 pairs, both themes).
>   `impeccable` slop detector: 0 findings. DESIGN.md rewritten; PRODUCT.md
>   brand personality updated to v2 (v1 "bold high-energy" replaced).
> - **3-lens adversarial review (drift / layout / craft) → 22 findings, ALL
>   addressed**, notably: amber leaks purged (radar + std gauge + freq counts →
>   ink data marks; badges/status--wait/std bands → neutral, with a new
>   `.badge--live` for active routine/next-day), `.linkbtn` → ink underline,
>   sticky `.sprogress` offset fixed to sit flush under the opaque appbar
>   (`max(12px, safe-top) + 57px`), rest-timer + payoff-stats got mono-width
>   escape hatches (flex-wrap), switch knob re-machined (16px + 1px edge, true
>   2px inset), skeletons squared (TSX inline radius), `.plate` chips mono
>   ("the trust moment"), input focus unified to the crisp amber edge, chrome
>   unified on `--bg`, spinner squared.
> - typecheck / lint / build / **83 tests** green after everything.
> - **NOT yet re-run:** the full `impeccable audit`/`critique` scoring against
>   v2 (the old 15/20 / 31/40 scores graded v1 and are obsolete). The live
>   smoke-test gate is unchanged. Session-002 screenshots in older docs show v1.

> **Session 002b (2026-07-01, second session that day) — design-backlog P1s + adversarial review:**
> - **Completion payoff sheet (crit P1)** — "Finish & lock" now ends in a real
>   payoff sheet instead of a silent redirect: sets / volume (tonnage) / duration
>   stats, per-exercise best set + Epley e1RM, a **PR badge** (ties-or-beats the
>   all-time best from `v_exercise_e1rm`, fetched post-completion; a first-ever
>   exercise counts as a PR), and **"Next time: X lb (±Δ)"** from the engine's
>   advanced weight line. `summarizeSession` is pure
>   (`src/features/session/summary.ts`, 14 unit tests);
>   `sessionsRepo.complete()` now returns a `CompletionReport`
>   (`ProgressionOutcome[]` out of `commitSessionProgression` + e1RM bests).
> - **onComplete error handling (crit P1)** — try/catch mirrors the toggleSet
>   contract: toast on failure, confirm sheet stays open for retry, navigation
>   only from the payoff sheet (which renders ahead of the status guard).
> - **Adversarial review (31-agent workflow, 3-skeptic majority votes) found + fixed:**
>   - **[P1] `complete()` retry double-advanced progression/rotations** — the
>     status flip is now a **compare-and-swap that runs FIRST**
>     (`where status='in_progress'`); a retry or double-tap matches 0 rows and
>     no-ops. Deliberate trade-off: a failure *after* the flip loses that
>     session's advance (weight holds — safe, self-correcting) instead of
>     doubling it (training-state corruption).
>   - **[P2] completion raced in-flight set-log writes** — onComplete now waits
>     (bounded, 6 s) on `queryClient.isMutating()` before completing, so the DB
>     verdict matches the screen and no late PATCH hits the immutability trigger.
>   - **[P3] payoff delta semantics** — delta now compares next vs the
>     **pre-advance weight line** (`ProgressionOutcome.fromLb`), not the lifted
>     max, so direction is right when the lifter overrides the weight input.
>   - **[P3] phantom-set PRs** — new **`9997_e1rm_completed_sets_only.sql`**
>     gates `est_1rm_lb` on `is_completed` (un-logged sets keep their actuals on
>     undo and could grant/suppress PRs). **Validated on local PG16** (Supabase
>     stubs + fixture: phantom 315×5 no longer beats completed 225×5; ran twice
>     → re-runnable). **USER MUST PASTE 9997 into the SQL Editor.**
>   - **[P3] payoff numerals** now on `--font-num`/`--tnum` per the type system.
>   - One finding empirically refuted (`.payoff__stats` fits at 320px — measured
>     with the real fonts), so no flex-wrap was added.
> - **Audit P1s:** `.linkbtn` 44 px tap target (inline-flex; all 5 call sites
>   verified); `aria-pressed` + Check icon on the secondary-muscle chips
>   (`.chip--toggle` gained `gap`); dead `.setrow--done` rule deleted
>   (`pop` keyframes stay — `.logbtn` uses them); DESIGN.md Motion section now
>   sanctions the Home lobby entrance (doc/code drift resolved).
> - Payoff verified visually via headless Chromium in both themes at 390/320 px
>   panel widths. typecheck / lint / build green; **tests 83** (69 + 14 summary).
> - **Observed, NOT fixed (needs a deliberate decision):**
>   `v_muscle_volume_weekly` still counts un-completed sets' tonnage/reps —
>   same phantom family as the e1RM fix. Single-workout (no-routine) sessions
>   get payoff stats but no next-time lines (no progression state — as designed).

> **Session 002 (2026-07-01) — full `impeccable` design-quality pass (on `main`, 9 commits):**
> - **`/impeccable audit`** → `docs/design-audit-2026-07-01.md` (13/20; 0 P0 / 7
>   P1 / 9 P2 / 10 P3; NOT AI slop). **All 7 P1s then fixed** across colorize,
>   harden, layout, optimize.
> - **colorize** — AA contrast tokens (light `--good`/`--warn` on-tint, `--faint`
>   as text) fixed via WCAG-scripted OKLCH values.
> - **harden** — a shared focus-trap dialog (`src/hooks/useDialog.ts`) for both
>   bottom-sheets; reminder-switch a11y name + 44px + tokenized knob; rest-timer
>   SR live region; `ConfirmDialog` gating photo delete.
> - **layout** — the logged-set card no longer overflows (grouped actions +
>   `flex-wrap`); verified at 320/390px via headless Chrome.
> - **optimize** — route-split (React.lazy); Recharts deferred to the Analytics
>   chunk; **initial bundle 267 → 153 kB gzip (−43%)**; photo signed-URLs batched
>   (N+1→1); progress fills `width`→`scaleX`. (`DueNudges`/`reminderMeta` were
>   split out of `ProgressPage` so Home's import doesn't defeat the lazy split.)
> - **animate home** — restrained dashboard entrance + hero-number settle +
>   nav-row micro-interactions (reduced-motion safe).
> - **`/impeccable critique`** → `.impeccable/critique/2026-07-01T...__supastrength-app.md`
>   (**27/40**, dual-agent, NOT AI slop; weakness = domain fluency of the gym
>   loop). **Both P1s shipped:** rest timer **auto-starts on log**; **per-set
>   weight** shown on every set card (ramp/back-off now expressible).
> - **Critique P2s — ALL DONE:** (1) optimistic **rollback + toast** on set-log
>   failure (`useToast` + `ToastProvider`); (2) **confirm-gated** Archive workout
>   + Remove rotation (recoverable per-item removes left fast); (3) nav **6→5**
>   (dropped the Exercises tab → Profile entry-point) + a persistent **"return to
>   session"** bar while a session is in progress.
> - **`/impeccable polish` — DONE:** `pop` overshoot removed (no-bounce),
>   Spinner→SkeletonList on both builders, ‹›/"+"→Lucide, `.antoggle` deleted
>   (→ `.toggle--compact`), "Done/Later"→"Did it/Snooze".
> - **Both evals RE-RUN on the fixed code — scores moved up:**
>   - **Audit 13/20 → 15/20** (every dimension now 3/4; A11y 2→3, Responsive 2→3).
>     Findings **26 → 16**, **P1s 7 → 2**. All original 7 P1s verified resolved
>     (contrast clean both themes, width→scaleX confirmed, Recharts split, set-card
>     wrap, modal focus, toggle 44px). Report: `docs/design-audit-2026-07-01.md`
>     (older 13/20 snapshot; the 15/20 detail is in this HANDOFF + the run log).
>   - **Critique 27/40 → 31/40** ("Acceptable" → **"Good"**). Snapshot:
>     `.impeccable/critique/2026-07-01T18-36-19Z__supastrength-app.md` (trend 27→31).
> - Tests **69 green**. Prereqs for the live smoke-test are done (migration + both
>   seeds in; Site URL fixed) — the live run is still the operational gate.
>
> **NEXT-SESSION DESIGN BACKLOG:** items 1–6 (completion payoff, onComplete
> try/catch, `.linkbtn` 44px, `aria-pressed` chips, dead `.setrow--done` CSS,
> DESIGN.md motion drift) **all shipped in session 002b** (see block above).
> Remaining:
> 1. **[audit/crit P2s]** theme-color meta (light), elite-band light contrast,
>    equipment stepper aria-labels, photo-delete 32px + video-delete confirm,
>    per-reminder button context, exercise-instructions clip; **[crit P2]** confirm
>    remove-exercise/remove-workout, numeric rep entry + per-set weight override.
> 2. **[new, from 002b review]** decide whether `v_muscle_volume_weekly` should
>    also exclude un-completed sets' tonnage/reps (phantom-set family).

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

**⚠️ New paste needed (session 002b):** `9997_e1rm_completed_sets_only.sql`
(one `create or replace view`, re-runnable) — without it the payoff sheet's PR
badge can be fooled by logged-then-unchecked sets. Also confirm
`9998_purge_media_cron.sql` was pasted (it schedules the media purge).

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
4. **Design (post-v2):** re-run `/impeccable audit` + `critique` against the
   **v2 "calibrated instrument"** system — the recorded 15/20 audit and 31/40
   critique scores graded v1 and are void. Then work the remaining P2 backlog
   (see the design-backlog block above) under v2's rules: amber = live/selected
   only, data marks in ink, radius 0, hairlines, mono numerals.

Engine reuse: M4/M5 should import `src/engine` and follow the "Engine encoding
notes" above — the pure functions are done and tested; the remaining work is the
DB orchestration around them.

## House rules (from new_session_instructions.md)

- Session log folder + `prompt_history.txt` every session (log every prompt).
- Migrations: descending 4-digit numbering, re-runnable. Next file: `9996_*`.
- Work commits directly to `main` (per the user's standing instruction) — except
  remote Claude sessions, which push to their designated `claude/*` branch
  (002b used `claude/supastrength-kickoff-veem2a`).
