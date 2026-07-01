-- 9997: est-1RM counts COMPLETED sets only.
--
-- `v_set_log_metrics` computed `est_1rm_lb` for any non-warmup row with a
-- weight — including sets that were logged and then un-checked (the app keeps
-- `actual_weight`/`actual_reps` on undo so the inputs survive a re-log). Those
-- phantom rows flowed into `v_exercise_e1rm` / `v_muscle_strength` /
-- `v_strength_vs_standards` and could grant or suppress the payoff sheet's PR
-- badge and inflate strength analytics. A lift you didn't finish is not an
-- e1RM data point.
--
-- Re-runnable: `create or replace view` (same column list as 9999_init.sql).
-- Paste into the Supabase SQL Editor after (or any time after) 9999_init.sql.

create or replace view v_set_log_metrics
with (security_invoker = true) as
select
  sl.id,
  sl.user_id,
  se.exercise_id,
  se.workout_id,
  s.performed_on,
  date_trunc('week', s.performed_on)::date as week_start,
  sl.actual_weight as weight_lb,
  sl.actual_reps   as reps,
  (not sl.is_warmup and sl.is_completed)                    as is_hard_set,
  sl.actual_weight * sl.actual_reps                         as tonnage_lb,
  case when sl.is_completed and sl.actual_weight > 0
       then sl.actual_weight * (1 + sl.actual_reps / 30.0)
  end                                                       as est_1rm_lb
from set_logs sl
join session_entries se on se.id = sl.session_entry_id
join sessions s         on s.id  = se.session_id
where sl.is_warmup = false;
