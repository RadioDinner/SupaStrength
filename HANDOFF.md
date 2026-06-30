# HANDOFF.md — SupaStrength live cross-session state

> Repo-root, project-wide state document. Updated every session. For per-session
> detail see `Session log/NNN_<date>/session_log.md`.

## Where the project is

**Phase 0 — DONE. M1–M4 — DONE. M5a engine — DONE. M5b/M5c (live session) — DONE.
M5d (engine auto-progression) — TODO.** Spec, data model, migration, build plan
done. User completed account setup. Session 001 shipped the pure progression
engine + plate calculator (`src/engine/*`, 59 adversarially-verified tests), M1
(auth/profile/equipment/shell) + auth fixes, M2 (exercise library seed + browser),
M3 (workout builder), M4 (routine scheduler), and M5b/M5c (live session logging
with the inline plate calculator + rest timer). The app is now a usable
end-to-end workout logger. typecheck + lint + build + test all green.

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

### M5d — TODO (engine auto-progression)
On `complete`, for each entry compute success/failure and run
`engine/applyProgression`/`applyFailure` over `progression_state` +
`progression_entry_state` (default pipeline derived from `rep_scheme`: straight →
linear +5, double → double-progression), init those rows on first encounter,
dedupe the weight advance per (session, exercise), write `audit_log`, honor
consolidation. Then prescribe `planned_weight` from `progression_state` at
session build (currently null → manual). Follow the "Engine encoding notes".

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

**Run `supabase/seed/exercises_seed.sql`** in the SQL Editor so the Exercises tab
populates, and smoke-test M1–M4 against the live project (build a workout, make a
routine with rotations, see the next gym day cycle on "Advance"). Then the
headline: **M5b–M5d** — `sessionsRepo` (engine-wired):
- **M5b session build:** "Start next gym day" → create a `sessions` row, snapshot
  each head workout's entries into `session_entries` (resolve weight from
  `progression_state`, reps/sets from `progression_entry_state`, knobs via the
  `progression_settings` scope chain), generate warmups + working `set_logs`.
- **M5c in-gym UI:** per-set logging (actual reps/weight/RPE/AMRAP), **inline
  plate calculator** (`engine/solvePlates` over the session location's bar +
  inventory + prefs), **rest timer**, on-the-fly edits → `session_overrides`.
- **M5d commit + advance:** `engine/applyProgression` + `applyFailure` write
  `progression_state`/`progression_entry_state`, consolidation holds, audit rows,
  advance every rotation pointer (`engine/advanceRotations`), flip session
  `completed` (immutable).
Then M6 (radar) → M7/M8. The engine functions are done + tested — M5 is the DB
orchestration around them (follow the "Engine encoding notes").

Note: M5 needs `progression_settings` / pipelines / failure rules rows to exist
per entry. Decide the default-progression seeding (e.g. a default "+5 every time"
pipeline at routine scope on first session) as part of M5b.

Engine reuse: M4/M5 should import `src/engine` and follow the "Engine encoding
notes" above — the pure functions are done and tested; the remaining work is the
DB orchestration around them.

## House rules (from new_session_instructions.md)

- Session log folder + `prompt_history.txt` every session (log every prompt).
- Migrations: descending 4-digit numbering, re-runnable. Next file: `9998_*`.
- Work commits directly to `main` (per the user's standing instruction).
