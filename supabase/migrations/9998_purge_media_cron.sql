-- ============================================================================
-- 9998_purge_media_cron.sql  (BUILD_PLAN M8 — media retention enforcement)
-- ----------------------------------------------------------------------------
-- Schedules the existing purge_expired_media() routine (defined in
-- 9999_init.sql) to run daily, deleting expired form-videos (30d) and progress
-- photos (~1yr) — both the storage objects and their rows.
--
-- RE-RUNNABLE: drops the job by name before (re)creating it. Paste into the
-- Supabase SQL Editor after the init migration. pg_cron lives in the `postgres`
-- database; enable it once (this file does) — Supabase supports it.
--
-- Prefer this DB-native schedule over the Edge Function for simplicity; the
-- Edge Function in supabase/functions/purge-media is an alternative for teams
-- that want HTTP invocation / external observability.
-- ============================================================================

create extension if not exists pg_cron;

-- Idempotent: remove any prior schedule for this job before re-creating it.
delete from cron.job where jobname = 'purge-expired-media';

-- Daily at 04:00 UTC.
select cron.schedule(
  'purge-expired-media',
  '0 4 * * *',
  $$ select public.purge_expired_media(); $$
);

-- Verify:
--   select jobname, schedule, active from cron.job where jobname = 'purge-expired-media';
--   select * from cron.job_run_details order by start_time desc limit 5;
