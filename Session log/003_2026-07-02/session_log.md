# Session 003 — 2026-07-02

Running log; updated as the session progresses. All work committed directly to
`main` per the user's standing instruction for this session.

## What shipped (commits on main)

- `ba4eb2a` **History: delete completed sessions** — migrations 9996 (owner may
  hard-delete a completed session; audit_log append-only trigger lets FK
  set-null cascades through) + 9995 (child immutability triggers allow
  reference-DETACH writes — fixes pre-existing bug where `purge_expired_media()`
  aborted on any expired clip attached to completed history). Repo/hook/UI with
  confirm dialog; eager form-video cleanup on delete. Verified on scratch
  Postgres 16 (9 assertions).
- `bca66c1` **Fix 9998** — user hit `42501 permission denied for table job`:
  dropped the direct `delete from cron.job` (SQL Editor's postgres role has no
  DML grant there); named `cron.schedule()` upserts.
- `1143538` **Routine rename + inline custom exercises + starting weight
  (9994)** — rename in routine builder header; exercise picker can create a
  custom exercise inline; `workout_entries.starting_weight` seeds the first
  session until progression state exists.
- `6b03f17` **Per-set targets + rep-ladder overload + notes (9993)** —
  `workout_entry_sets` (per-set weight × reps), `overload_mode='rep_ladder'`
  with rep_cap / increment_lb / reps_after_increment (each set that hits its
  target climbs a rep, failed sets hold; all-at-cap → weight steps, reps reset;
  written back to the rows so the builder shows live state; excluded from the
  shared engine line; runs for routine AND single-workout sessions). Sticky
  note = `workout_entries.notes` surfaced in builder+session;
  `session_entries.notes` = per-occurrence note, shown in History. Pure engine
  module `engine/repLadder.ts` + 10 tests.
- `da633b7` **Builder set-table layout** — per the user's screenshot of their
  old tracker: always-editable SET | PREVIOUS | LB | REPS grid per exercise,
  sticky-note banner, rest dividers, ADD SET; saves on the fly. PREVIOUS =
  newest completed actuals per template entry (`sessionsRepo.lastActuals`,
  30-session lookback). Per-set rows now plan sessions for ANY entry that has
  them (typed targets = manual mode; ladder auto-advances).
- `a2f2054` **Add-flow = edit-flow, per-set rest, RLS fix (9992)** — picking an
  exercise adds it instantly (3×8, rest 3:00) and you edit in the same table;
  per-set `rest_seconds` editable at the divider (snapshots to
  `set_logs.planned_rest_seconds`; in-gym timer counts the logged set's own
  rest); BUG FIX: `exercises.user_id` now defaults to `auth.uid()` — custom
  exercise creation previously always failed RLS ("new row violates row-level
  security policy"). Add-set is a quiet right-aligned text button.
- (this commit) **Backfill sessions** — History → "Log past session": pick a
  workout, set date/start time/duration, fill sets (prefilled from targets,
  all marked done by default), save → lands as completed. Deliberately does
  NOT advance progression/ladders/rotations. Partial-failure cleanup deletes
  the orphan session so it can't hijack Resume.

## Migrations pending user paste (descending order)

`9998` (re-paste the fix) → `9996` → `9995` → `9994` → `9993` → `9992`.
All re-runnable; all verified on a local Postgres 16 with Supabase shims
(auth/storage schemas, authenticated role for RLS tests).

## Directional decisions

- Committing to `main` all session (user instruction).
- Rep ladder: sets climb INDEPENDENTLY (a failed set holds while others climb);
  weight steps only when every set is at cap and hits it. Inferred from the
  user's 9/8/5 example; flagged to user as a one-line rule change if wrong.
- Deleting history does not roll back progression (dialog copy says so).
- Backfill does not advance progression — history repair, not training state.
- Typed per-set targets are "manual mode" for engine entries: they stay fixed
  until edited; only rep_ladder auto-advances them.
- Session-scoped notes freeze with the session (immutability); sticky notes
  live on the template and stay editable.

## Known issues / notes for next session

- `auth.users → audit_log` ON DELETE CASCADE would still abort account
  deletion (audit rows refuse DELETE) — pre-existing, out of scope today.
- Re-running an OLD migration file can revert newer `create or replace`
  function bodies — the descending numbering convention (run newest LAST)
  handles it; worth remembering when re-pasting.
- No Supabase credentials in this environment → UI changes verified by
  typecheck/lint/tests/build + DB-level Postgres assertions, not by clicking
  through. User should eyeball the new builder/backfill screens on device.
- HomePage "last session" card uses keys ['sessions','recent',1]; delete and
  backfill invalidate the ['sessions'] prefix.

## Open questions

- Payoff sheet doesn't yet show "Next time" for rep-ladder entries (engine
  outcomes only) — possible polish.
- Per-set rest is displayed in the builder; SessionPage rest timer uses it,
  but set cards don't show per-set rest values.
