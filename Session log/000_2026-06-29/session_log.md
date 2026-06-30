# Session 000 — 2026-06-29

Bootstrap + full planning + Phase-0 scaffold + start of M1. Worked on `main`
(per the session-000 instruction). Long session; ended with a break mid-M1.

## What shipped (commits, newest first)

- `f8ad2e9` Update HANDOFF: Phase 0 scaffold built; account-side setup pending
- `9684ebe` Scaffold Vite + React + TS app (Phase 0) — Vercel/Supabase ready
- `ae367f9` Fix ambiguous user_id in v_frequency view; validate migration on PG16
- `03d550c` Add verified data model, init migration, build plan, design review
- `5bc74fe` Finalize v1 spec: lock #6 video, defer #7 sync, light-spec #8
- `2c59d99` Lock analytics (#4/#5) + stack (Vite/TS/Vercel/Supabase)
- `716f25b` Lock plate calc + equipment (#2/#3) + home-gym inventory + loadable math
- `5f0d811` Lock progression engine fully: scope/inheritance + presets + gap-workout
- `c2775cf` Lock progression engine: unified step-pipeline model + foundations
- `2e44feb` Add living product/technical spec (docs/SPEC.md)
- `a109fbc` Log session 000 planning prompt
- `7ea9bff` Add session 000 log
- `7592ca0` Add new_session_instructions standing orders and CLAUDE.md
- (uncommitted at break → committed with this log) `src/data/types.ts` — first
  M1 data-layer file (row types for profile/equipment tables).

## Directional decisions

- **Process:** plan exhaustively before building. Grilled all 8 features to a
  locked `docs/SPEC.md`. Then a 10-agent design pass produced + adversarially
  verified `docs/DATA_MODEL.md`, `supabase/migrations/9999_init.sql`,
  `docs/BUILD_PLAN.md`, `docs/DESIGN_REVIEW.md`.
- **Engine:** progression = ordered **step pipeline** (weight/reps/sets dims) with
  caps/on-cap/reset; **weight shared per (routine, exercise)**, rep/set state per
  (routine, workout_entry); settings inherit routine→workout→exercise; failure
  chainable; gap-workout consolidation opt-in.
- **Stack:** Vite + React + TS SPA → Vercel; Supabase (Postgres/Auth/Storage/RLS).
  Phasing online → offline → Android. Data-access **seam** so features never touch
  Supabase directly (Phase-2 offline insurance).
- **Migration** validated on local PG16 (fresh + re-runnable). Hit one real bug in
  prod paste (ambiguous `user_id` in `v_frequency`) → fixed + re-validated.

## Where we stopped (mid-M1)

Phase 0 fully done: app scaffolded, builds/lints green; user created the Vercel
project, ran the migration, set env vars — reported "everything green."
**M1 (auth + profile + equipment) just started** — only `src/data/types.ts`
written so far. See `HANDOFF.md` → "M1 — in progress" for the exact resume plan.

## Next session

Resume M1 per `HANDOFF.md`: expand the DataClient seam, add the Supabase auth
wrapper + `useAuth`, profile/equipment repos + a `ensureUserSetup` bootstrap
(seeds the user's real home-gym inventory), then the auth gate + profile +
equipment screens + app shell/nav. Then M2 (seed the exercise library).

## Project notes for future-me

- House rules live in `new_session_instructions.md` / `CLAUDE.md`. Log every
  prompt to `prompt_history.txt`; migrations descending + re-runnable (next file
  `9998_*`); keep `HANDOFF.md` current.
- Local PG16 harness exists for validating migrations before paste (see prior
  session approach: stub `auth`/`storage`/roles, run twice).
- No signup trigger in the DB — the app bootstraps profile/prefs/default-gym on
  first login. User-owned inserts can omit `user_id` (defaults to `auth.uid()`).
