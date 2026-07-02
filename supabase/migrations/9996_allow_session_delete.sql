-- 9996: owners may hard-DELETE a whole session (History → Delete).
--
-- `prevent_completed_session_mutation` blocked BOTH update and delete of a
-- completed session, so the app had no way to remove a bogus or duplicate
-- workout from history. Deleting a whole session is a legitimate, intentional
-- owner action; what immutability actually protects against is post-hoc
-- EDITING of logged history (which silently skews analytics). So:
--
--   * sessions: UPDATE of a completed row is still rejected; DELETE is now
--     allowed for any status. RLS (`sessions_delete`) still scopes deletes to
--     the owner, and the FK cascade removes session_entries → set_logs /
--     session_overrides.
--   * The child immutability triggers need NO change: they only guard rows
--     whose owning session still exists and is completed. During a session
--     delete the parent row is already gone when the cascade reaches the
--     children, so the cascade passes — while direct edits/deletes of a
--     completed session's children stay blocked.
--   * audit_log: rows reference sessions/routines/exercises via
--     `on delete set null` FKs, but `prevent_audit_mutation` rejected EVERY
--     update — so deleting a referenced row would abort on the FK's set-null
--     write. Recognize that exact write (context FKs going null, every other
--     column untouched) and let it through; everything else stays append-only.
--   * Progression state advanced by a completed session is deliberately NOT
--     rolled back on delete: the weight you're lifting is training state, not
--     a property of one history row.
--
-- Re-runnable: `create or replace function` only (triggers from 9999_init.sql
-- keep pointing at these functions). Paste into the Supabase SQL Editor after
-- (or any time after) 9999_init.sql.

-- Sessions: completed rows stay immutable to edits, but may be deleted.
create or replace function prevent_completed_session_mutation()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'DELETE' then
    return old;  -- owner hard-delete allowed for any status; children cascade
  end if;
  if old.status = 'completed' then
    raise exception 'sessions are immutable once completed (id=%)', old.id;
  end if;
  return new;
end;
$$;

-- Audit log: still append-only, except the FK `on delete set null` write that
-- fires when a referenced session/routine/exercise is deleted. That write is
-- exactly "context ids may go null, nothing else changes" — allow it, reject
-- everything else.
create or replace function prevent_audit_mutation()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'UPDATE'
     and (new.session_id  is not distinct from old.session_id  or new.session_id  is null)
     and (new.routine_id  is not distinct from old.routine_id  or new.routine_id  is null)
     and (new.exercise_id is not distinct from old.exercise_id or new.exercise_id is null)
     and (to_jsonb(new) - 'session_id' - 'routine_id' - 'exercise_id')
       = (to_jsonb(old) - 'session_id' - 'routine_id' - 'exercise_id')
  then
    return new;
  end if;
  raise exception 'audit_log is append-only (no update/delete)';
end;
$$;
