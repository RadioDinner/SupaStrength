-- 9992: per-set rest + custom-exercise RLS fix.
--
-- 1. `workout_entry_sets.rest_seconds` — rest AFTER that set, editable at the
--    divider between sets in the builder (set 1 → 1:00, set 2 → 0:30, …).
--    Null falls back to the entry-level `rest_seconds`.
-- 2. `set_logs.planned_rest_seconds` — the per-set rest snapshotted into the
--    session, so the in-gym rest timer counts the logged set's own rest.
-- 3. BUG FIX: `exercises.user_id` had no default (nullable = global seed), so
--    client inserts of custom exercises landed with user_id null and the
--    `exercises_insert` policy (`user_id = auth.uid()`) rejected them:
--    "new row violates row-level security policy". Default it to auth.uid():
--    authenticated inserts own their rows; seed scripts run in the SQL Editor
--    where auth.uid() is null, so seeds keep user_id null (global) as before.
--
-- Re-runnable: add column if not exists / alter column set default.
-- Paste any time after 9999_init.sql (and 9993 for workout_entry_sets).

alter table workout_entry_sets
  add column if not exists rest_seconds integer
    check (rest_seconds is null or rest_seconds >= 0);

alter table set_logs
  add column if not exists planned_rest_seconds integer
    check (planned_rest_seconds is null or planned_rest_seconds >= 0);

alter table exercises
  alter column user_id set default auth.uid();
