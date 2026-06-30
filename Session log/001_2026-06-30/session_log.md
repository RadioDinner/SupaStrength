# Session 001 — 2026-06-30

Kicked off Phase 1 ("build the MVP"). Working on `main` per the user's standing
instruction ("Always commit directly to main"; remote `main` was at the same
commit as the provisioned working branch). Big build session: shipped the pure
progression **engine (M5a)** with exhaustive tests + an adversarial verification
pass, and completed **M1** (auth + profile + equipment + app shell) end to end.

## What shipped (commits, newest first)

- `M1: auth + profile + equipment + app shell` — data seam (list/getOne/insert/
  update/upsert/remove/rpc) + Supabase impl; `auth.ts` + `useAuth` context;
  `profileRepo`/`equipmentRepo`/`bootstrap.ensureUserSetup` (idempotent home-gym
  seed); AuthScreen, ProfilePage, EquipmentPage, AppShell (bottom-tab nav),
  BootstrapGate, gates in `App.tsx`, `AuthProvider` in `main.tsx`, UI primitives,
  CSS. HANDOFF + this session log.
- `Engine: warmup-ceiling fix + plate cleanup` — adversarial-verification
  outcomes: warmups no longer emit rungs ≥ working weight / duplicates; plate
  `loadedTotalLb` computed one way; DATA_MODEL §6 "Shoulders" reset-placement
  corrected.
- `37754c3 M5a: pure progression engine + plate calc + exhaustive tests` — the
  headline `src/engine/*` (weight/plates/pipeline/failure/warmups/schedule/
  prescribe) + vitest infra + 58→59 table-driven tests covering every SPEC §4 /
  DATA_MODEL §6 scenario; engine coverage ~98%.

## Directional decisions

- **Built the engine first, before the rest of Phase 1.** It's pure and the most
  verifiable thing in the app (no DB needed), so it banks a high-confidence,
  fully-tested core. M1 followed (structurally correct; not yet run against the
  live DB from here — no env in this environment).
- **Engine encoding rules settled** (now in HANDOFF "Engine encoding notes"):
  `reset` applies at step *fire* (atomic with effect), not at a cap transition;
  the failure cursor advances *past* an applied deload; consolidation compares the
  pound delta not `step.amount`; multi-entry same-day weight dedupe is M5d
  orchestration, not in the pure engine.
- **Adversarial verification via 4 parallel subagents** (one per scenario
  cluster), each hand-tracing the actual code vs the locked spec (not the tests,
  to avoid shared blind spots). Verdict: engine is spec-correct everywhere; found
  & fixed one real bug (warmup rungs ≥ working weight) and one doc bug (shoulders
  reset placement). The Workflow tool hit a permission-stream hiccup, so this ran
  as background Agents instead.
- **Branch:** committed directly to `main` (user instruction + project
  convention). The provisioned `claude/mvp-phase-1-94oidw` branch and `main` were
  the same commit at session start.

## Continued — auth fixes + M2

After the engine + M1 commits, the user hit live-auth friction and we kept going:

- **Auth-redirect fix** (`Fix auth redirect…`): magic-link / confirmation now use
  `emailRedirectTo = window.location.origin`; Vite dev/preview moved to :3000 to
  match Supabase's default Site URL; README documents Auth → URL Configuration.
- **Email rate-limit doc** + **in-app password recovery** (`Add in-app password
  recovery…`): detect `PASSWORD_RECOVERY` → `ResetPasswordScreen`; "Forgot
  password?" on the sign-in screen; `sendPasswordRecovery`/`updatePassword`.
  Root cause of the user's hang was a misconfigured Supabase **Site URL**
  (`http://…vercel.app:3000` — should be `https://…vercel.app`, no port).
- **M2 seed** (`M2 seed: generate exercise library SQL…`): vendored
  free-exercise-db, generator → `exercises_seed.sql` (873 exercises, 2416 muscle
  links, 5 lift_keys). **Validated on real local Postgres, run twice.**
- **M2 UI** (`M2 UI: exercise browser…`): exercisesRepo + browser (ILIKE search,
  movement filter, expandable muscles/instructions) + custom-exercise creator +
  "Exercises" nav tab; `ilike` op added to the DataClient seam.

## Continued — M3 workout builder

- User flagged the app "looks like a setup list," then clarified: **don't change
  the M-plan, keep building it in order** — "sweet workout app" polish comes as
  the milestones land. I briefly started an out-of-order M5 session slice + home
  reframe, then reverted both and stayed on plan.
- **M3 shipped** (`M3: workout builder`): `workoutsRepo` + `features/workouts/`
  (list/create/archive + builder with exercise search picker, sets/rep-scheme/
  rest/AMRAP, client validation), "Workouts" nav tab, shared `useDebounced` hook.
  Home checklist updated to reflect M2 done + link to the builder.

## Continued — M4 routine scheduler

- **M4 shipped** (`M4: routine/rotation scheduler`): `routinesRepo` (routines ≤1
  active, rotations, rotation_workouts) delegating next-day/advance to the pure,
  tested `engine/schedule`; `features/routines/` list + builder showing the
  computed "next gym day" + a skip/advance button that wraps the pointers.
- Nav reorganized to 5 tabs (Home / Workouts / Routines / Exercises / Profile);
  Equipment moved under Profile.

## Continued — M5b/M5c live session + impeccable skill

- **M5b/M5c shipped** (`M5b/M5c: live session logging`): `sessionsRepo`
  (start from workout / next gym day → session_entries + set_logs; complete →
  advance rotation via engine/schedule); `features/session/` SessionPage with the
  **inline plate calculator** (engine `solvePlates`), **rest timer**, per-set rep
  logging + done toggle + AMRAP; Start buttons + resume banner; `/session/:id`.
  The app is now a real end-to-end workout logger. Weight is manual this slice;
  engine auto-progression = M5d.
- User ran `npx skills add pbakaus/impeccable` — installed the **impeccable**
  frontend-design skill to `.agents/skills/impeccable/`; committed so it persists
  in this ephemeral env. Available to invoke for a UI-polish pass (the "really
  sweet workout app" goal).

## Continued — impeccable design pass (dark + light themes)

- User ran `npx impeccable install` (no-op) and `npx skills add pbakaus/impeccable`
  again. Followed the skill's flow: interview (AskUserQuestion) → **bold &
  high-energy**, **Hevy/Strong** reference, **dark now + light/dark toggle**.
- Wrote `PRODUCT.md` + `DESIGN.md`; rewrote `index.css` as a tokenized OKLCH
  design system with first-class dark + light themes; `useTheme` (persisted,
  pre-paint script) + app-bar toggle. Elevated app bar / tab bar / cards /
  buttons / inputs / set rows / plate readout / rest timer.
- Verified by headless-Chromium screenshots of the session screen in both themes
  (sent to the user). `Design: bold dark+light theme system...`.

## Open questions / next step

- **Smoke-test M1 against the live Supabase project** (sign up / login / refresh
  persistence / profile + gym edit / RLS with a 2nd user). Not runnable from this
  environment (no env vars / DB).
- Next milestone: **M2** — seed the ~800-exercise library (`free-exercise-db`)
  via a `supabase/seed/` Node script + exercise browser UI. Then M3/M4, then wire
  the built engine into **M5b–M5d** (session build / live logging / commit+
  advance), then M6 radar.

## Project notes for future-me

- Engine is pure + done; M5b–M5d is DB orchestration around it. Follow the
  "Engine encoding notes" in HANDOFF.
- Test infra: `npm test` (vitest run), `npm run coverage` (engine thresholds
  90/90/90/85, excludes index/types barrels). `npm run typecheck` now also checks
  `tests/` via `tsconfig.test.json`.
- `src/data/online/supabaseDataClient.ts` is the one deliberately loosely-typed
  boundary (no generated `Database` type yet — Phase 0.3 swaps in
  `supabase gen types`).
- Subagents inherit the standing orders and created a stray `001_2026-06-30b`
  session folder during verification; removed it. Watch for this when fanning out
  agents in this repo.
