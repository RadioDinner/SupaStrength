-- 9995: let reference-DETACH writes through the child immutability triggers.
--
-- `prevent_completed_child_mutation` blocked EVERY update/delete on
-- session_entries / set_logs / session_overrides once the owning session was
-- completed. But several FK edges write into those rows as a side effect of
-- deleting OTHER rows (`on delete set null`):
--   * videos          → set_logs.video_id
--   * workouts        → session_entries.workout_id
--   * workout_entries → session_entries.workout_entry_id,
--                       session_overrides.workout_entry_id
--
-- Concretely: `purge_expired_media()` (9999_init.sql, scheduled daily by 9998)
-- does `delete from videos where expires_at <= now()` — the moment one expired
-- clip is attached to a set log of a COMPLETED session, the FK's set-null
-- write trips the trigger and the whole purge aborts. The 30-day video /
-- 1-year photo retention backstop never runs. Session delete (9996) also
-- relies on clip rows being deletable for its eager video cleanup.
--
-- Fix: while the owning session is completed, allow an UPDATE whose only
-- effect is detaching references — the link columns above may go null (or
-- stay equal); every other column must be byte-identical. Actual history
-- (weights, reps, set counts, notes) stays frozen. An owner could hand-craft
-- the same detach via PostgREST (set_logs has an owner update policy); that
-- only unlinks a clip/template pointer, it cannot rewrite what was lifted.
--
-- Re-runnable: `create or replace function` only (the triggers from
-- 9999_init.sql keep pointing at this function). Paste into the Supabase SQL
-- Editor any time after 9999_init.sql.

create or replace function prevent_completed_child_mutation()
returns trigger
language plpgsql
as $$
declare
  rec        record;
  sess_id    uuid;
  sess_state text;
  j_new      jsonb;
  j_old      jsonb;
begin
  rec := coalesce(new, old);

  -- Resolve the owning session id for this child table.
  if tg_table_name = 'session_entries' then
    sess_id := rec.session_id;
  elsif tg_table_name = 'set_logs' or tg_table_name = 'session_overrides' then
    select se.session_id into sess_id
      from session_entries se
      where se.id = rec.session_entry_id;
  end if;

  if sess_id is not null then
    select s.status into sess_state from sessions s where s.id = sess_id;
    if sess_state = 'completed' then
      -- Reference-detach carve-out: link columns may go null (or stay equal),
      -- everything else must be untouched. `->` on a column the table doesn't
      -- have yields SQL null, so one branch serves all three tables.
      -- updated_at is excluded in case set_updated_at() ran first.
      if tg_op = 'UPDATE' then
        j_new := to_jsonb(new);
        j_old := to_jsonb(old);
        if (j_new - 'video_id' - 'workout_id' - 'workout_entry_id' - 'updated_at')
             = (j_old - 'video_id' - 'workout_id' - 'workout_entry_id' - 'updated_at')
           and (j_new->'video_id' is null
                or j_new->'video_id' = 'null'::jsonb
                or j_new->'video_id' = j_old->'video_id')
           and (j_new->'workout_id' is null
                or j_new->'workout_id' = 'null'::jsonb
                or j_new->'workout_id' = j_old->'workout_id')
           and (j_new->'workout_entry_id' is null
                or j_new->'workout_entry_id' = 'null'::jsonb
                or j_new->'workout_entry_id' = j_old->'workout_entry_id')
        then
          return new;
        end if;
      end if;
      raise exception
        'session children are immutable once the session is completed (table=%, session=%)',
        tg_table_name, sess_id;
    end if;
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;
