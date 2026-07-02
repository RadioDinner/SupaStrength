-- 9993: per-set targets + rep-ladder overload + session-entry notes.
--
-- Three additions driven by the workout-builder workflow:
--
-- 1. `workout_entry_sets` — optional per-set targets for a template entry
--    (set 1: 15 lb × 9, set 2: 15 lb × 8, set 3: 15 lb × 5). When rows exist,
--    session snapshots plan each set individually instead of one uniform
--    prescription.
--
-- 2. Rep-ladder overload, UNIQUE to the entry (not the shared engine line):
--    `workout_entries.overload_mode` = 'rep_ladder' opts an entry out of the
--    shared progression engine. After each completed session, every set that
--    hit its target climbs +1 rep (a failed set holds); when ALL sets sit at
--    `rep_cap` and all hit it, `target_weight` steps by `increment_lb` and
--    every set's reps reset to `reps_after_increment`. The advanced targets
--    are written BACK to `workout_entry_sets`, so the builder always shows
--    (and can hand-edit, on the fly) the live state.
--
-- 3. `session_entries.notes` — the "as it happens" note ("shoulders
--    clicking"), written during the session while the row is still mutable;
--    frozen with the rest of the snapshot on completion. The STICKY per-
--    exercise note ("Remember to shovel!") needs no schema change — it is the
--    existing `workout_entries.notes`, now surfaced in the builder + session.
--
-- Re-runnable: add column if not exists / create table if not exists / drop
-- policy-trigger if exists. Paste any time after 9999_init.sql.

alter table workout_entries
  add column if not exists overload_mode text not null default 'engine'
    check (overload_mode in ('engine', 'rep_ladder'));
alter table workout_entries
  add column if not exists rep_cap integer
    check (rep_cap is null or rep_cap > 0);
alter table workout_entries
  add column if not exists increment_lb numeric
    check (increment_lb is null or increment_lb > 0);
alter table workout_entries
  add column if not exists reps_after_increment integer
    check (reps_after_increment is null or reps_after_increment > 0);

alter table session_entries
  add column if not exists notes text;

create table if not exists workout_entry_sets (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null default auth.uid() references auth.users(id) on delete cascade,
  workout_entry_id uuid not null references workout_entries(id) on delete cascade,
  set_index        integer not null check (set_index > 0),
  target_reps      integer not null check (target_reps > 0),
  target_weight    numeric check (target_weight is null or target_weight > 0),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  constraint ux_workout_entry_sets unique (workout_entry_id, set_index)
);
create index if not exists ix_workout_entry_sets_entry
  on workout_entry_sets (workout_entry_id, set_index);

-- Standard owner-only RLS (same shape as the 9999_init.sql per-user loop —
-- restated here because that loop doesn't know about this table).
alter table workout_entry_sets enable row level security;
alter table workout_entry_sets force row level security;
drop policy if exists workout_entry_sets_select on workout_entry_sets;
create policy workout_entry_sets_select on workout_entry_sets
  for select using (user_id = auth.uid());
drop policy if exists workout_entry_sets_insert on workout_entry_sets;
create policy workout_entry_sets_insert on workout_entry_sets
  for insert with check (user_id = auth.uid());
drop policy if exists workout_entry_sets_update on workout_entry_sets;
create policy workout_entry_sets_update on workout_entry_sets
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists workout_entry_sets_delete on workout_entry_sets;
create policy workout_entry_sets_delete on workout_entry_sets
  for delete using (user_id = auth.uid());

drop trigger if exists trg_workout_entry_sets_updated_at on workout_entry_sets;
create trigger trg_workout_entry_sets_updated_at
  before update on workout_entry_sets
  for each row execute function set_updated_at();
