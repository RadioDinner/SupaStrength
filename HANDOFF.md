# HANDOFF.md — SupaStrength live cross-session state

> Repo-root, project-wide state document. Updated every session. For per-session
> detail see `Session log/NNN_<date>/session_log.md`.

## Where the project is

**Phase 0 — DONE. M1 — in progress (paused mid-build).** Spec, data model,
migration, build plan done. App scaffolded, builds + lints clean. User completed
account setup: Vercel project created, migration run, env vars set — reported
"everything green." M1 (auth + profile + equipment) has begun.

### M1 — in progress (resume here)
Done: `src/data/types.ts` (row types for profile/equipment tables).
Remaining (in order):
1. Expand the seam: `src/data/client.ts` (`list/getOne/insert/update/upsert/
   remove/rpc`) + implement in `src/data/online/supabaseDataClient.ts`.
2. `src/data/auth.ts` (wraps `supabase.auth`) + `src/hooks/useAuth.tsx`
   (context: status/user/session + signIn/signUp/signOut).
3. `src/data/repos/profileRepo.ts`, `equipmentRepo.ts`, and
   `bootstrap.ts::ensureUserSetup(userId)` — idempotent; seeds the real home gym
   (plates 2.5/5/10/15/25/35/45 ×2, dumbbells 15/20/25 ×2, one 45 Olympic bar,
   default location "Home Gym"). No DB signup trigger exists, so this runs on
   first login. User-owned inserts may omit `user_id` (defaults to `auth.uid()`).
4. Screens: `features/auth/AuthScreen`, `features/settings/ProfilePage`,
   `features/equipment/EquipmentPage`, a `routes` app-shell w/ nav, auth gate +
   bootstrap gate in `App.tsx`, wrap `AuthProvider` in `main.tsx`.
Acceptance: sign in, see/edit profile, see/edit the seeded gym.
Note: email confirmation may be ON in Supabase Auth — if sign-up stalls, disable
"Confirm email" (Auth → Providers → Email) for this personal app, or click the
emailed link.

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

Finish Phase-0 account setup (user-side, see README "Deploy to Vercel" +
"Supabase setup"): create Vercel project (import repo, Vite preset), create
Supabase project, set `VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY` in Vercel,
run `supabase/migrations/9999_init.sql` in the SQL Editor. Home screen should
then show "Connected ✓". After that, start **M1** (auth + profile + equipment)
and the **M2** exercise-library seed (BUILD_PLAN recommends a dataset).

## House rules (from new_session_instructions.md)

- Session log folder + `prompt_history.txt` every session (log every prompt).
- Migrations: descending 4-digit numbering, re-runnable. Next file: `9998_*`.
- This session works on `main` (per user's session-000 instruction).
