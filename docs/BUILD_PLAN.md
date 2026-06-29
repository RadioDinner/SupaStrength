# BUILD_PLAN.md

> Concrete, ordered, phased plan to build **SupaStrength** v1. Authority chain:
> `docs/SPEC.md` (locked) → `DATA_MODEL.md` (schema) → this plan (sequencing).
> Stack: Vite + React + TypeScript SPA on Vercel; Supabase (Postgres + Auth +
> Storage + RLS). Single user today, multi-user-ready via RLS (`user_id =
> auth.uid()`). Units: lbs/inches, `numeric` only (exact plate math).
>
> Numbering of phases matches the spec's build phasing (§2): **Phase 1 = online
> web**, **Phase 2 = offline**, **Phase 3 = Android (Capacitor)**. Phase 0 is the
> scaffold that precedes Phase 1.

---

## Guiding architectural rules (apply to every phase)

1. **The data-access layer is sacred.** No React component ever imports the
   Supabase client directly. All reads/writes go through a typed *repository*
   layer (`src/data/repos/*`) that returns domain types. This is the seam where
   Phase-2 offline (PowerSync/Electric/Dexie) slots in without touching UI.
2. **The progression engine is pure.** `solvePlates()`, `resolvePipeline()`,
   `applyProgression()`, `generateWarmups()` are deterministic pure functions
   over plain inputs in `src/engine/*` — no I/O, no Supabase, no React. They are
   the most heavily unit-tested code in the app and are reusable verbatim on
   native/offline.
3. **Sessions are immutable; nothing derived is stored.** All analytics are SQL
   views (`v_*`). The engine computes weights at session-build time and persists
   only into `progression_state` and `set_logs`/`session_entries`.
4. **Money flows through `numeric`, never `float`.** Enforced in TS by branding
   weight as a `Weight` type backed by integer "centi-pounds" or `Decimal`-style
   helpers in `src/engine/weight.ts` to avoid 2.5/1.25 rounding drift.
5. **Every migration is re-runnable & descending-numbered** (`9999_init.sql`,
   then `9998_*`, …) per `new_session_instructions.md`. `drop ... if exists`
   before every `create policy`/trigger/function.

---

## Phase 0 — Scaffold (foundation, ~1–2 sessions)

Goal: a deployed, authenticating, empty shell with the clean data layer in place
and the schema live. No features yet — just rails.

### 0.1 Project layout (Vite + React + TS)

```
SupaStrength/
├── docs/                      # SPEC.md, DATA_MODEL.md (authoritative)
├── supabase/
│   ├── migrations/            # 9999_init.sql … (descending, re-runnable)
│   ├── seed/                  # exercise-library + standards seed scripts (separate)
│   └── functions/             # Edge Functions (purge job, later Fitbit)
├── src/
│   ├── main.tsx               # app entry; mounts <App/>, registers PWA SW
│   ├── App.tsx                # router shell + auth gate
│   ├── lib/
│   │   ├── supabase.ts        # the ONE Supabase client (never imported by UI)
│   │   └── env.ts             # typed import.meta.env access + runtime validation
│   ├── data/                  # ← THE SEAM for Phase 2
│   │   ├── client.ts          # DataClient interface (read/write/subscribe)
│   │   ├── online/            # Supabase-backed impl of DataClient
│   │   ├── repos/             # exercisesRepo, workoutsRepo, sessionsRepo, …
│   │   └── types.ts           # generated DB types + domain types
│   ├── engine/                # PURE: plates, progression, warmups, weight
│   │   ├── weight.ts          # exact lb arithmetic (no float)
│   │   ├── plates.ts          # solvePlates()
│   │   ├── pipeline.ts        # resolvePipeline(), applyProgression()
│   │   ├── failure.ts         # failure-chain evaluation
│   │   ├── warmups.ts         # generateWarmups()
│   │   └── schedule.ts        # rotation pointer advance, "next gym day"
│   ├── features/              # one folder per milestone (auth, equipment, …)
│   │   └── <feature>/         # components + hooks + feature-local logic
│   ├── hooks/                 # cross-feature hooks (useSession, useAuth)
│   ├── components/            # shared dumb UI (Button, Sheet, NumberStepper)
│   ├── routes/                # route definitions
│   └── styles/
├── tests/                     # vitest unit + integration; e2e/ for Playwright
├── index.html
├── vite.config.ts             # + vite-plugin-pwa
├── tsconfig.json
├── .env.example
└── package.json
```

### 0.2 Tooling baseline

- `npm create vite@latest` → React + TS template; Node 20 LTS.
- Add: `@supabase/supabase-js`, `react-router-dom`, `@tanstack/react-query`
  (server-state cache that wraps the repo layer; gives us optimistic updates and
  a natural cache for Phase-2 offline), `recharts` (radar/charts), `zod`
  (runtime env + form validation), `vite-plugin-pwa`, `date-fns`.
- Dev: `vitest` + `@testing-library/react`, `playwright`, `eslint` +
  `typescript-eslint`, `prettier`, `husky` + `lint-staged` (pre-commit: lint +
  typecheck + unit tests on staged).
- TS strict mode on; `noUncheckedIndexedAccess` on.

### 0.3 Supabase project + env vars

- Create the Supabase project (one for `prod`; optionally a `dev` project so
  Vercel previews don't write prod). Capture URL + anon key.
- `.env.example`:
  ```
  VITE_SUPABASE_URL=
  VITE_SUPABASE_ANON_KEY=
  ```
  Only the **anon** key ships to the browser. Service-role key lives **only** in
  Vercel/Supabase server env (used by seed scripts + Edge Functions). `env.ts`
  zod-validates these at boot and throws a readable error if missing.
- Run `supabase login` / link locally for typegen; generate `src/data/types.ts`
  via `supabase gen types typescript`.

### 0.4 Schema migration (the big one)

- Author `supabase/migrations/9999_init.sql` from `DATA_MODEL.md`: all tables,
  the shared `set_updated_at()` trigger, `gen_random_uuid`, the 12-row
  `muscle_groups` idempotent upsert, every check constraint, every index, RLS
  enable+force, four policies/table (`user_id = auth.uid()`), read-all on global
  reference tables, immutability triggers (`prevent_completed_session_mutation`,
  `prevent_audit_mutation`, `assert_equipment_owner`), and RPCs
  (`set_default_location`, `set_default_barbell`). **Re-runnable** throughout.
- Storage: create private buckets `form-videos` and `progress-photos`; add
  `storage.objects` RLS (owner = first path segment) scoped `to authenticated`.
- Acceptance: paste into the Supabase SQL Editor; runs clean; **runs clean a
  second time** (re-runnable proof); `supabase gen types` produces compiling TS.

### 0.5 Vercel autodeploy + PWA

- Connect the GitHub repo to Vercel; framework preset = Vite. Set env vars in
  Vercel (prod + preview scopes). Pushes to `main` deploy prod; PRs get preview
  URLs.
- `vite-plugin-pwa` in `injectManifest`/`generateSW` `autoUpdate` mode with a
  **minimal** runtime caching config now (app shell precache only — *no* data
  caching yet; data caching is a Phase-2 decision so we don't bake in a stale
  strategy). Add manifest (name, icons, `display: standalone`, theme color) so
  "Add to Home Screen" works on the phone from day one.
- Acceptance: production URL loads, installs to phone home screen, shows app
  shell offline (data routes can fail gracefully for now).

### 0.6 The data-access seam (Phase-2 insurance)

- Define `DataClient` interface in `src/data/client.ts`:
  `query(table, filter)`, `insert`, `update`, `delete`, `rpc(name,args)`,
  `subscribe(table, cb)` (realtime now; the same signature is what a local store
  emits later).
- `src/data/online/` implements it over `supabase-js`. Repos
  (`exercisesRepo`, etc.) consume `DataClient`, never the raw client.
- React Query hooks call repos. **Rule enforced by ESLint custom rule / import
  boundary**: nothing under `src/features` may import from `src/lib/supabase`.
- Acceptance: a trivial "ping" repo round-trips through `DataClient` → Supabase
  → back, proving the seam compiles and works.

**Phase 0 exit criteria:** deployed PWA shell on Vercel; auth library wired (UI
in M1); full schema live and re-runnable; typed repo layer with one working
round-trip; CI runs lint + typecheck + unit on every PR.

---

## Phase 1 — Online MVP (the product)

Ordered milestones. Each ships behind the auth gate, end-to-end (DB → repo → UI),
with its own acceptance criteria. Build strictly in this order — later milestones
depend on data from earlier ones.

### M1 — Auth + Profile + Equipment/Location setup

**Build:** Supabase email/password (and magic-link) auth UI; protected router;
`user_profiles` editor (display_name, sex, birthdate, height_in, bodyweight_lb,
unit_system display-only); `locations` CRUD with exactly-one-default via
`set_default_location()` RPC; per-location `barbells`, `plate_inventory`
(individual quantities), `dumbbells`; `equipment_preferences`
(rounding_direction, micro_plates_enabled, ceiling_behavior).
Seed the user's home gym (one 45 lb bar; one pair each of 2.5/5/10/15/25/35/45;
dumbbells 15/20/25) as a one-tap "set up my home gym" action.

**Acceptance:**
- New user can sign up, log in, log out; refresh preserves session.
- RLS verified: a second test user cannot read user 1's locations/profile.
- Creating a 2nd default location flips the old default atomically (≤1 default).
- Plate inventory stores individual quantities; UI shows derived pairs
  (`floor(qty/2)`).
- Profile bodyweight stamps `bodyweight_updated_at`.

### M2 — Seed exercise library + muscle map (data milestone, see strategy §below)

**Build:** Import ~800 global exercises (`user_id = null`, `is_seed = true`) with
`movement_type`, `loading_style`, `is_loaded`, `lift_key` for the 5 mains, and
`exercise_muscles` rows (primary 1.0 / secondary 0.5) mapped onto the 12 groups.
Custom-exercise creation UI (writes owned rows that shadow seed slugs).
Exercise browser with trigram name search + movement-type filter.

**Acceptance:**
- ≥800 global exercises present; every exercise has ≥1 primary muscle.
- All 5 `lift_key` lifts exist and are flagged `is_loaded`.
- Search "squat" returns barbell back squat; movement-type filter works.
- A second user sees all seeds (read) but cannot edit them; can create a custom
  exercise that shadows a seed slug (`unique (user_id, slug)` holds).

### M3 — Workout builder (templates)

**Build:** `workouts` CRUD; `workout_entries` editor (drag-order `position`,
`sets`, `rep_scheme` straight/double/rpe with the right target fields, `rest_seconds`,
`last_set_amrap`, `barbell_id_override`, `ceiling_behavior_override`,
`consolidation_enabled` + `consolidation_sessions`). Prescription only — **no
weight field anywhere in the builder** (weight is born in the session/engine).

**Acceptance:**
- Build "Workout A" with squat/bench/row; reorder persists via deferrable
  `(workout_id, position)` unique.
- Double-progression entry enforces `rep_range_low ≤ rep_range_high`.
- Straight entry requires `rep_target`; UI blocks invalid combos before save.
- Archiving a workout (soft `archived_at`) hides it without breaking any future
  session FKs.

### M4 — Routine / rotation scheduler

**Build:** `routines` CRUD (≤1 active per user); `rotations` (independent tracks)
each with ordered `rotation_workouts` and a `current_index` pointer. "Next gym
day" = union over rotations of the row at `position = current_index`. Pure
`engine/schedule.ts` computes the next day and the advance.

**Acceptance:**
- Routine with Rotation 1 = `[A, B]` and Rotation 2 = `[Shoulder Blowup]` (len 1)
  shows next day = `A + Shoulder Blowup`, then `B + Shoulder Blowup`, then `A…`.
- Advancing wraps each rotation: `current_index = (current_index+1) mod count`.
- Setting a routine active deactivates the previous one (partial-unique holds).
- `engine/schedule.ts` next-day/advance is unit-tested independent of DB.

### M5 — Live session logging + progression engine + plate calc + rest timer (the headline)

This is the core; build it in sub-steps.

**M5a — Pure engine (no UI):** in `src/engine/`, implement and exhaustively
unit-test against the spec §6 worked walkthrough:
- `weight.ts` exact lb math (no float).
- `plates.ts` `solvePlates(target, barbell, inventory, {rounding, micros})` →
  symmetric per-side, respects pair quantities, returns closest achievable +
  the actual loaded total and the over/under delta.
- `pipeline.ts` `resolvePipeline()` (most-specific scope wins: exercise →
  workout → routine) + `applyProgression(state, step, completionResult)`
  implementing `dimension/applies_to/weight_mode/amount/every_n/cap/on_cap/reset`.
- `failure.ts` failure-condition + chainable responses (repeat w/ limit, deload
  lb/%/reps, drop set), driven by `failure_counter`.
- `warmups.ts` ramp `{0,55,70,85}%` gated by threshold basis.
- `schedule.ts` (from M4).
Cover **every** row of the SPEC §4 table and DATA_MODEL §6 walkthrough as named
test cases (StrongLifts linear, OHP-cap-150, bench every-2nd, double-prog
3×8–12, shoulders reps→sets, last-set AMRAP, repeat-indefinitely, repeat-3-then-
deload-10%, gap-workout/consolidation, scope inheritance).

**M5b — Session build:** "Start next gym day" creates a `sessions` row
(`in_progress`), snapshots each entry into `session_entries` (planned_* from the
resolved pipeline + shared weight read from `progression_state`), generating
`set_logs` (warmups + working sets) with planned values.

**M5c — In-gym UI:** per-set logging (actual_reps, actual_weight, RPE,
AMRAP reps); **inline plate calculator** (tap a set → plates-per-side from
`solvePlates` using session location's barbell/inventory + prefs); **rest timer**
(per-entry `rest_seconds`, resolved/inherited); on-the-fly edits to
rest/reps/sets/weight with **"save to workout"** → `session_overrides`
(+ optional persist to `workout_entries`).

**M5d — Commit + advance:** completing the session: engine computes each entry's
verdict (success/failure), writes `progression_state` (the shared
`(routine_id, exercise_id)` line — squat in A and B advance the *same* row),
handles consolidation holds, writes `audit_log` rows, advances every rotation
pointer, flips session to `completed` (immutable). A standalone plate calculator
tool (§6 [P2]) also ships here.

**Acceptance:**
- Engine unit tests: 100% of the §6 walkthrough scenarios pass.
- Squat advances identically whether performed in Workout A or B (one shared
  `progression_state` row; second workout reads the climbed weight).
- Plate calc: target 185 with 45 bar → 45/25/... per side correct; 187.5 with
  micros enabled → loadable; >320 → triggers `ceiling_behavior` (hold+warn).
- Round-up forcing +10 over a desired +5 on a consolidation-enabled entry sets
  `consolidation_counter` and re-prescribes the held weight next session
  (`was_consolidation_hold = true`), logging a `gap_workout` audit row.
- A failed entry (below target reps) holds weight and re-prescribes; chained
  rule deloads on the configured attempt.
- Completed sessions reject edits (`prevent_completed_session_mutation`); audit
  rows reject update/delete.
- Resume: refreshing mid-session restores the `in_progress` session.

### M6 — Analytics radar (#4 volume / #5 strength)

**Build:** the SQL views (`v_set_log_metrics`, `v_muscle_volume_weekly`,
`v_exercise_e1rm`, `v_muscle_strength`, `v_strength_vs_standards`,
`reminders_due`), all `security_invoker = true`. Seed `strength_standards`
(separate seed). Recharts radar over the 12 groups with: volume metric toggle
(hard sets / tonnage / total reps), time window (7d/4wk/12wk/all), volume↔strength
mode, weakest-area toggle (relative-to-you min-max 0–100 vs relative-to-standards
percentile for the 5 mains by sex/bodyweight). "Most often" lists
(workouts/exercises/muscles). `chart_preferences` persists UI state.

**Acceptance:**
- Radar renders 12 spokes in `radar_order`; secondary muscles weighted 0.5.
- Switching window 7d→12wk recomputes from views (no stored aggregates).
- Strength view shows est-1RM (Epley) per primary-muscle best; bodyweight/timed
  lifts excluded.
- Standards view places the user in a band; warns if `bodyweight_updated_at` is
  stale.
- RLS holds through views (a 2nd user sees only their own metrics).

### M7 — Video bones (#6, scaffold only)

**Build:** native-camera capture (`<input capture>`), 30 s cap, upload to private
`form-videos/{user_id}/{video_id}.ext`, link to a `set_logs` row via
`videos.set_log_id`, scrub + slow-mo playback. `expires_at` = now()+30d (plain
column). **No** analysis. (Confirm phone OS [O-2] before polishing — native
capture works on both.)

**Acceptance:**
- Record/upload a ≤30 s clip; rejects >30 s.
- Clip attaches to a specific logged set and plays back with scrub + slow-mo.
- Storage RLS: 2nd user cannot fetch user 1's video path.

### M8 — Photos + measurements + reminders (#8, sensible defaults)

**Build:** `progress_photos` (front/side/back/custom, private bucket, side-by-side
compare, ~1 yr retention); `body_measurements` (typed columns + jsonb tail, one
row/day, mutable, CSV import); `reminders` (weigh-in 7d / measurements 14d /
photos 28d) surfaced via `reminders_due` view as **post-workout on-screen nudges**
+ dashboard (no push v1). An Edge Function purge job enforces video/photo
retention.

**Acceptance:**
- Photo upload categorized; compare two dates side-by-side.
- One measurement row per day (`unique (user_id, taken_on)`); CSV import works;
  typos editable.
- Reminder shows "due" via the view (never stored); logging a measurement bumps
  `last_done_at`; snooze respected.
- Purge job removes expired rows/objects on schedule.

**Phase 1 exit criteria:** the user can run real workouts on their phone end to
end — build templates, schedule rotations, log live sessions with auto
progression + plate calc + rest timer, see radar analytics, capture form videos,
and track photos/measurements — all online, multi-user-safe via RLS.

---

## Exercise library seeding strategy (M2 detail)

**Recommended dataset: `yuhonas/free-exercise-db`** (public-domain/Unlicense,
~870 exercises as flat JSON with `name`, `force`, `level`, `mechanic`,
`equipment`, `primaryMuscles`, `secondaryMuscles`, `category`, `images`). It is
the cleanest, license-clear, no-API-needed option and lands right at our ~800
target. (wger is a fallback but is GPL/API-gated with messier multilingual muscle
data; free-exercise-db's flat JSON is simpler to map deterministically.)

**Pipeline (a Node script in `supabase/seed/`, run with the service-role key —
seed rows are loaded *separately* from the schema migration):**

1. **Fetch & pin** the JSON at a specific commit/tag (vendor it into
   `supabase/seed/data/` so seeding is reproducible and offline).
2. **Map `equipment` → `movement_type` + `loading_style`:**
   | source equipment | movement_type | loading_style | is_loaded |
   |---|---|---|---|
   | barbell / e-z curl bar | barbell | barbell | true |
   | dumbbell | dumbbell | dumbbell | true |
   | machine | machine | stack | true |
   | cable | cable | stack | true |
   | body only | bodyweight | bodyweight | false |
   | (weighted variants: dips/pullups w/ "weighted") | weighted_bodyweight | plate_loaded | true |
   | bands | (machine) | banded | false |
   | kettlebells | dumbbell | dumbbell | true |
   | medicine ball / foam roll / other | bodyweight | bodyweight | false |
   | exercise ball | bodyweight | bodyweight | false |
   `default_rest_seconds` defaulted by movement_type (compound barbell 180,
   accessory 90). `is_unilateral` inferred from name ("single-arm", "one-leg").
3. **Map source muscles → our 12 groups.** free-exercise-db uses a fixed
   vocabulary; build a static lookup table in the seed script:
   | source muscle | our group_key |
   |---|---|
   | chest | chest |
   | lats, middle back, lower back | back |
   | shoulders | shoulders |
   | biceps | biceps |
   | triceps | triceps |
   | quadriceps | quads |
   | hamstrings | hamstrings |
   | glutes | glutes |
   | calves | calves |
   | abdominals | core |
   | traps | traps |
   | forearms | forearms |
   | neck | (→ traps) |
   `primaryMuscles` → `exercise_muscles.role='primary', weight=1.0`;
   `secondaryMuscles` → `role='secondary', weight=0.5`. De-dupe so one role per
   (exercise, group); if a muscle appears in both, primary wins. Any exercise
   that ends up with zero mapped primaries gets a manual fallback (logged by the
   script for review) — never ship an exercise with no primary (M2 acceptance).
4. **Assign `lift_key`** to the 5 mains by matching canonical slugs
   (`barbell-full-squat`→squat, `barbell-bench-press`→bench, `barbell-deadlift`→
   deadlift, `standing-military-press`/OHP→ohp, `bent-over-barbell-row`→row);
   set `is_loaded=true` on those.
5. **Slugs:** stable slug = kebab-cased source name; `is_seed=true`,
   `user_id=null`. Idempotent upsert on the partial-unique `(slug) where user_id
   is null` so re-running the seed updates rather than duplicates.
6. **Images** from the dataset are *not* loaded into our storage in v1 (out of
   scope); keep the option open (store URL in a future column).

**Strength standards seed (M6):** separate seed into `strength_standards`. Pick a
published novice→elite table by sex + bodyweight bracket (the exact dataset is an
acknowledged open item, §13). The schema already supports **both** absolute-lb
and ×-bodyweight-ratio forms, so the dataset choice does **not** force a
migration — seed whichever shape the chosen source uses, by `lift_key/sex/bw
bracket`, with `source` provenance.

---

## Phase 2 — Offline readiness (local-first + background sync)

Phase 1's `DataClient` seam is what makes this a swap, not a rewrite. Evaluate in
this order; do a small spike before committing:

- **PowerSync (recommended first evaluation).** Purpose-built for Supabase/
  Postgres ↔ SQLite local-first with a managed sync service and conflict
  handling. Lowest custom-sync code; respects RLS via its sync rules. Best fit
  given we're already all-in on Supabase. Tradeoff: hosted service + sync-rule
  authoring.
- **ElectricSQL (second).** Postgres → local sync with shapes; strong
  local-first story. More moving parts to self-host; good if we want OSS control.
- **Dexie + custom sync (fallback).** Dexie (IndexedDB) as the local store with
  a hand-rolled change-queue and last-write-wins / per-table merge against
  Supabase. Most control, most code, most risk on conflict edge cases —
  acceptable because we're single-user (conflicts are rare).

**Readiness work to keep Phase 1 ready for any of the three:**
- Keep **all** mutations idempotent and id-generated **client-side** (UUIDs minted
  in the repo layer, not by the DB default) so offline inserts have stable keys
  to sync. (Schema already uses client-mintable `uuid` PKs.)
- Keep the **pure engine** the single source of computed weights so an offline
  session commit produces identical `progression_state`/`set_logs` as online.
- Model writes as **append/replace whole aggregates** where feasible (a session +
  its entries + set_logs commit as one unit) to simplify sync.
- Have `DataClient.subscribe` already in the interface so the local store's
  reactive queries (PowerSync/Electric live queries) drop in behind it.
- Defer the PWA **data**-caching strategy until now (Phase 0 only precaches the
  shell) — the sync layer owns data offline, not the service worker.

Acceptance for Phase 2 (when built): full session can be logged with airplane
mode on; reconnect syncs cleanly; `progression_state` matches what online would
have produced; no duplicate rows after reconnect.

---

## Phase 3 — Android via Capacitor

- Wrap the existing PWA build with **Capacitor** (the SPA build output is the
  webview content). Add the Android platform; keep the same React/engine/data
  code.
- Swap **native plugins** where the web API is weaker: Camera (form video /
  photos), Filesystem (local video buffering), Local Notifications (replaces the
  v1 on-screen-only reminders → real push-style nudges), Preferences (token
  storage), Network (offline detection feeding Phase-2 sync).
- Confirm phone OS [O-2] here (native capture already works cross-platform).
- CI: Gradle build of the Android artifact; signing config in CI secrets.
- Acceptance: installable APK; camera + notifications work natively; offline
  sync (Phase 2) operational inside the wrap.

---

## Testing approach (all phases)

- **Unit (Vitest) — the engine is the crown jewel.** Every SPEC §4 / DATA_MODEL
  §6 progression scenario is a named, table-driven test:
  `solvePlates` (incl. micro-plates, pair-quantity limits, >320 ceiling,
  round-up/down), `resolvePipeline` scope inheritance, `applyProgression`
  (every_n / caps / on_cap / reset / double-progression loop), failure chains,
  warmup ramps, `weight.ts` exact arithmetic (golden tests proving no float
  drift on 2.5/1.25 math), schedule pointer advance/wrap. Target ≥90% coverage
  in `src/engine`.
- **Component (React Testing Library):** builder validation (rep-scheme field
  rules), in-session set logging, inline plate-calc rendering, radar toggles.
- **Data-layer / RLS integration:** a test Supabase project (or local
  `supabase start`) with two seeded users; assert each user can only
  read/write their own rows, seeds are read-only-shared, completed sessions and
  audit rows are immutable, and `set_default_location`/pointer-advance RPCs
  behave atomically. Run these in CI against an ephemeral DB so the migration is
  exercised on every PR (also proving it stays re-runnable).
- **Views correctness:** fixture sessions → assert `v_muscle_volume_weekly`,
  `v_exercise_e1rm`, `v_muscle_strength`, `v_strength_vs_standards`,
  `reminders_due` return expected numbers (secondary 0.5 weighting, Epley e1RM,
  hard-set counts, window boundaries).
- **E2E (Playwright):** the golden path on a mobile viewport — sign up → set up
  home gym → seed library present → build Workout A → make a routine → log a full
  session (with plate calc + rest timer) → complete → verify squat climbed and
  the rotation advanced → see it on the radar. One smoke E2E per milestone.
- **CI gate (GitHub Actions / Vercel checks):** lint + typecheck + unit on every
  PR (fast); RLS/view integration + E2E on PRs to `main`. Pre-commit (husky)
  runs lint + typecheck + staged unit tests. Migration applied to ephemeral DB
  in CI to catch non-re-runnable SQL.

---

## Milestone dependency graph (quick reference)

```
Phase 0 (scaffold) ─▶ M1 auth/profile/equipment
                         └▶ M2 seed library ─▶ M3 workout builder ─▶ M4 scheduler
                                                                        └▶ M5 live session + engine + plates + timer  ← headline
                                                                              └▶ M6 analytics radar
                                                                              └▶ M7 video bones
                                                                              └▶ M8 photos/measurements/reminders
Phase 2 (offline) swaps behind DataClient ─▶ Phase 3 (Capacitor) wraps the PWA
```

---

Relevant authoritative files (absolute paths):
- Spec (locked): `/home/user/SupaStrength/docs/SPEC.md`
- Schema reference: provided `DATA_MODEL.md` (to be saved at `/home/user/SupaStrength/docs/DATA_MODEL.md`)
- Standing orders: `/home/user/SupaStrength/new_session_instructions.md`, `/home/user/SupaStrength/CLAUDE.md`

Note: per instructions I did not write any files; the above is the complete BUILD_PLAN.md content, returned as my message. The repo is currently greenfield (no `src/`, `package.json`, or `supabase/migrations/` yet), so this plan starts from an empty scaffold.
