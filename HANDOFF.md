# HANDOFF.md — SupaStrength live cross-session state

> Repo-root, project-wide state document. Updated every session. For per-session
> detail see `Session log/NNN_<date>/session_log.md`.

## Where the project is

**Phase: planning complete → ready to build.** No app code yet. The repo holds
the locked spec, the verified data model + migration, and the build plan.

## Source-of-truth documents (authority chain)

1. `docs/SPEC.md` — locked product/technical spec for features #1–#8. **Start here.**
2. `docs/DATA_MODEL.md` — the Postgres schema explained (33 tables, RLS, views),
   with a worked walkthrough of every progression scenario.
3. `supabase/migrations/9999_init.sql` — single **re-runnable** initial migration
   (paste by hand into the Supabase SQL Editor). Descending-numbered per house rule.
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

Get user sign-off on `DATA_MODEL.md` + `BUILD_PLAN.md`, then execute
**Phase 0 scaffold** (Vite/TS app, Supabase project, Vercel, env, PWA, clean
data-access layer for future offline). Exercise library seed dataset TBD
(BUILD_PLAN recommends one).

## House rules (from new_session_instructions.md)

- Session log folder + `prompt_history.txt` every session (log every prompt).
- Migrations: descending 4-digit numbering, re-runnable. Next file: `9998_*`.
- This session works on `main` (per user's session-000 instruction).
