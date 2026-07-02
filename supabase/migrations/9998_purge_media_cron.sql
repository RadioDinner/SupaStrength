-- ============================================================================
-- 9998_purge_media_cron.sql  (BUILD_PLAN M8 — media retention enforcement)
-- ----------------------------------------------------------------------------
-- Schedules the existing purge_expired_media() routine (defined in
-- 9999_init.sql) to run daily, deleting expired form-videos (30d) and progress
-- photos (~1yr) — both the storage objects and their rows.
--
-- RE-RUNNABLE: named cron.schedule() calls upsert (pg_cron ≥1.4 — re-calling
-- with the same job name updates the job in place). Paste into the Supabase
-- SQL Editor after the init migration. pg_cron lives in the `postgres`
-- database; enable it once (this file does) — Supabase supports it.
--
-- Prefer this DB-native schedule over the Edge Function for simplicity; the
-- Edge Function in supabase/functions/purge-media is an alternative for teams
-- that want HTTP invocation / external observability.
-- ============================================================================

create extension if not exists pg_cron;

-- NOTE: no direct DML on cron.job here. The SQL Editor runs as `postgres`,
-- which may call cron.schedule()/cron.unschedule() but has no DELETE grant on
-- the cron.job table (a direct DELETE fails with 42501). Named schedules
-- upsert, so re-running the cron.schedule() below replaces any prior job with
-- this name.

-- Daily at 04:00 UTC.
select cron.schedule(
  'purge-expired-media',
  '0 4 * * *',
  $$ select public.purge_expired_media(); $$
);

-- Verify:
--   select jobname, schedule, active from cron.job where jobname = 'purge-expired-media';
--   select * from cron.job_run_details order by start_time desc limit 5;
