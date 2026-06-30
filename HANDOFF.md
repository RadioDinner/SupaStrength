# HANDOFF.md — SupaStrength live cross-session state

> Repo-root, project-wide state document. Updated every session. For per-session
> detail see `Session log/NNN_<date>/session_log.md`.

## Where the project is

**Phase 0 — DONE. M1 — DONE. M2 — DONE. M5a engine — DONE (built early, fully
tested).** Spec, data model, migration, build plan done. User completed account
setup (Vercel project, migration run, env vars). Session 001 shipped the pure
progression engine + plate calculator (the headline, `src/engine/*`) with 59
adversarially-verified unit tests, completed M1 end-to-end (auth, profile,
equipment, app shell) + auth-redirect/recovery fixes, and shipped M2 (exercise
library seed + browser UI). typecheck + lint + build + test all green.

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
populates, and smoke-test M1+M2 against the live project (sign up, profile/gym
edit, search "squat" → barbell squat, create a custom exercise, RLS with a 2nd
user). Then **M3 — workout builder** (`workouts` + `workout_entries`: ordered
prescription — sets, rep scheme, rest, AMRAP — NO weight field), then **M4 —
routine/rotation scheduler** (use the built `engine/schedule`), then **M5b–M5d**
(wire the built engine into session build / live logging / commit+advance),
then M6 (radar) → M7/M8.

Engine reuse: M4/M5 should import `src/engine` and follow the "Engine encoding
notes" above — the pure functions are done and tested; the remaining work is the
DB orchestration around them.

## House rules (from new_session_instructions.md)

- Session log folder + `prompt_history.txt` every session (log every prompt).
- Migrations: descending 4-digit numbering, re-runnable. Next file: `9998_*`.
- Work commits directly to `main` (per the user's standing instruction).
