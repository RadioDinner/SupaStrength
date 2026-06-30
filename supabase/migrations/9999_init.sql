-- ============================================================================
-- SupaStrength — 9999_init.sql
-- Single, RE-RUNNABLE initial migration. Paste into the Supabase SQL Editor.
-- Idempotent: create ... if not exists / create or replace / drop ... if exists
-- before every policy, trigger, and constraint that cannot be guarded inline.
--
-- NOT included here (seeded separately):
--   * the ~800-row exercise library (exercises + exercise_muscles seed)
--   * strength_standards reference rows
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 0. Extensions
-- ----------------------------------------------------------------------------
create extension if not exists pgcrypto;   -- gen_random_uuid()
create extension if not exists pg_trgm;     -- trigram search on exercise names

-- ----------------------------------------------------------------------------
-- 1. Shared helper functions
-- ----------------------------------------------------------------------------

-- updated_at maintainer (idempotent: create or replace)
create or replace function set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- Reject mutation of a completed (immutable) session.
create or replace function prevent_completed_session_mutation()
returns trigger
language plpgsql
as $$
begin
  if (tg_op = 'DELETE') then
    if old.status = 'completed' then
      raise exception 'sessions are immutable once completed (id=%)', old.id;
    end if;
    return old;
  else
    if old.status = 'completed' then
      raise exception 'sessions are immutable once completed (id=%)', old.id;
    end if;
    return new;
  end if;
end;
$$;

-- Reject mutation of a child row whose owning session is completed.
-- Used by session_entries, set_logs, session_overrides.
-- Each calling trigger passes the column holding the session id via TG_ARGV[0].
create or replace function prevent_completed_child_mutation()
returns trigger
language plpgsql
as $$
declare
  rec        record;
  sess_id    uuid;
  sess_state text;
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

-- Audit log is append-only.
create or replace function prevent_audit_mutation()
returns trigger
language plpgsql
as $$
begin
  raise exception 'audit_log is append-only (no update/delete)';
  return null;
end;
$$;

-- Equipment children must share the parent location's user_id.
create or replace function assert_equipment_owner()
returns trigger
language plpgsql
as $$
declare
  loc_user uuid;
begin
  select user_id into loc_user from locations where id = new.location_id;
  if loc_user is null then
    raise exception 'location % not found', new.location_id;
  end if;
  if loc_user <> new.user_id then
    raise exception 'row user_id (%) does not match location owner (%)',
      new.user_id, loc_user;
  end if;
  return new;
end;
$$;

-- ----------------------------------------------------------------------------
-- 2. GLOBAL REFERENCE TABLES
-- ----------------------------------------------------------------------------

-- 2.1 muscle_groups (the single muscle model — 12 major radar groups)
create table if not exists muscle_groups (
  id           smallint primary key,
  group_key    text not null unique check (group_key ~ '^[a-z_]+$'),
  display_name text not null,
  radar_order  smallint not null unique,
  created_at   timestamptz not null default now()
);

insert into muscle_groups (id, group_key, display_name, radar_order) values
  (1,'chest','Chest',1),        (2,'back','Back',2),
  (3,'shoulders','Shoulders',3),(4,'biceps','Biceps',4),
  (5,'triceps','Triceps',5),    (6,'quads','Quads',6),
  (7,'hamstrings','Hamstrings',7),(8,'glutes','Glutes',8),
  (9,'calves','Calves',9),      (10,'core','Core',10),
  (11,'traps','Traps',11),      (12,'forearms','Forearms',12)
on conflict (id) do update
  set group_key    = excluded.group_key,
      display_name = excluded.display_name,
      radar_order  = excluded.radar_order;

-- 2.2 strength_standards (reference thresholds; rows seeded separately)
create table if not exists strength_standards (
  id              bigint generated always as identity primary key,
  lift_key        text not null check (lift_key in ('squat','bench','deadlift','ohp','row')),
  sex             text not null check (sex in ('male','female')),
  bw_min_lb       numeric(6,2),
  bw_max_lb       numeric(6,2),
  novice_lb       numeric(7,2),
  intermediate_lb numeric(7,2),
  advanced_lb     numeric(7,2),
  elite_lb        numeric(7,2),
  novice_ratio       numeric(4,2),
  intermediate_ratio numeric(4,2),
  advanced_ratio     numeric(4,2),
  elite_ratio        numeric(4,2),
  source          text,
  created_at      timestamptz not null default now(),
  constraint strength_standards_bw_order
    check (bw_min_lb is null or bw_max_lb is null or bw_min_lb < bw_max_lb),
  constraint strength_standards_has_thresholds
    check (novice_lb is not null or novice_ratio is not null)
);
-- Full-bracket dedupe key: include both min and max so [min,max) brackets that
-- share a min but differ in max can coexist, matching the half-open lookup.
create unique index if not exists ux_strength_standards_bracket
  on strength_standards
     (lift_key, sex, coalesce(bw_min_lb, -1), coalesce(bw_max_lb, 'infinity'::numeric));
create index if not exists ix_strength_standards_lookup
  on strength_standards (lift_key, sex, bw_min_lb, bw_max_lb);

-- ----------------------------------------------------------------------------
-- 3. EQUIPMENT & LOCATIONS  (created before exercises: exercises FK barbells)
-- ----------------------------------------------------------------------------

create table if not exists locations (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name       text not null check (char_length(trim(name)) between 1 and 80),
  is_default boolean not null default false,
  is_archived boolean not null default false,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists ux_locations_user_name
  on locations (user_id, lower(name));
create unique index if not exists ux_locations_one_default
  on locations (user_id) where is_default;
create index if not exists ix_locations_user on locations (user_id);

create table if not exists barbells (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  location_id uuid not null references locations(id) on delete cascade,
  name        text not null check (char_length(trim(name)) between 1 and 60),
  weight_lb   numeric(6,2) not null check (weight_lb >= 0),
  is_default  boolean not null default false,
  is_archived boolean not null default false,
  sort_order  integer not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create unique index if not exists ux_barbells_loc_name
  on barbells (location_id, lower(name));
create unique index if not exists ux_barbells_one_default
  on barbells (location_id) where is_default;
create index if not exists ix_barbells_location on barbells (location_id);
create index if not exists ix_barbells_user on barbells (user_id);

create table if not exists plate_inventory (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null default auth.uid() references auth.users(id) on delete cascade,
  location_id     uuid not null references locations(id) on delete cascade,
  denomination_lb numeric(6,2) not null check (denomination_lb > 0),
  quantity        integer not null default 0 check (quantity >= 0),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create unique index if not exists ux_plate_inventory_loc_denom
  on plate_inventory (location_id, denomination_lb);
create index if not exists ix_plate_inventory_location on plate_inventory (location_id);
create index if not exists ix_plate_inventory_user on plate_inventory (user_id);

create table if not exists dumbbells (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null default auth.uid() references auth.users(id) on delete cascade,
  location_id   uuid not null references locations(id) on delete cascade,
  weight_lb     numeric(6,2) not null check (weight_lb > 0),
  quantity      integer not null default 2 check (quantity >= 0),
  is_adjustable boolean not null default false,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create unique index if not exists ux_dumbbells_loc_weight
  on dumbbells (location_id, weight_lb);
create index if not exists ix_dumbbells_location on dumbbells (location_id);
create index if not exists ix_dumbbells_user on dumbbells (user_id);

create table if not exists equipment_preferences (
  user_id              uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  rounding_direction   text not null default 'down' check (rounding_direction in ('up','down')),
  micro_plates_enabled boolean not null default false,
  ceiling_behavior     text not null default 'hold_warn'
                         check (ceiling_behavior in ('hold_warn','auto_switch_reps')),
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- 4. EXERCISE LIBRARY
-- ----------------------------------------------------------------------------

create table if not exists exercises (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid references auth.users(id) on delete cascade,  -- null = global seed
  slug               text not null,
  name               text not null,
  movement_type      text not null check (movement_type in
                       ('barbell','dumbbell','machine','cable','bodyweight',
                        'weighted_bodyweight','assisted','timed_cardio')),
  loading_style      text not null check (loading_style in
                       ('barbell','dumbbell','plate_loaded','stack','bodyweight',
                        'banded','timed')),
  default_barbell_id uuid references barbells(id) on delete set null,
  is_loaded          boolean not null default true,
  is_unilateral      boolean not null default false,
  lift_key           text check (lift_key in ('squat','bench','deadlift','ohp','row')),
  instructions       text,
  default_rest_seconds integer,
  is_seed            boolean not null default false,
  is_custom          boolean generated always as (user_id is not null) stored,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
create unique index if not exists ux_exercises_user_slug
  on exercises (user_id, slug);
create unique index if not exists ux_exercises_global_slug
  on exercises (slug) where user_id is null;
create index if not exists ix_exercises_user on exercises (user_id);
create index if not exists ix_exercises_movement on exercises (movement_type);
create index if not exists ix_exercises_lift_key on exercises (lift_key) where lift_key is not null;
create index if not exists ix_exercises_name_trgm on exercises using gin (name gin_trgm_ops);

create table if not exists exercise_muscles (
  exercise_id     uuid not null references exercises(id) on delete cascade,
  muscle_group_id smallint not null references muscle_groups(id),
  role            text not null check (role in ('primary','secondary')),
  weight          numeric(2,1) not null check (weight in (1.0, 0.5)),
  primary key (exercise_id, muscle_group_id)
);
create index if not exists ix_exercise_muscles_group on exercise_muscles (muscle_group_id);
create index if not exists ix_exercise_muscles_primary
  on exercise_muscles (muscle_group_id) where role = 'primary';

-- ----------------------------------------------------------------------------
-- 5. TEMPLATES
-- ----------------------------------------------------------------------------

create table if not exists workouts (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name        text not null,
  notes       text,
  archived_at timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists ix_workouts_user_active
  on workouts (user_id) where archived_at is null;

create table if not exists workout_entries (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null default auth.uid() references auth.users(id) on delete cascade,
  workout_id          uuid not null references workouts(id) on delete cascade,
  -- exercise_id may point at a user-owned custom exercise; use a DEFERRED no-action
  -- FK so account-cascade deletion does not abort (see §7 of DATA_MODEL).
  exercise_id         uuid not null
                        references exercises(id) on delete no action
                        deferrable initially deferred,
  position            integer not null,
  sets                integer not null check (sets > 0),
  rep_scheme          text not null default 'straight' check (rep_scheme in ('straight','double','rpe')),
  rep_target          integer,
  rep_range_low       integer,
  rep_range_high      integer,
  target_rpe          numeric(3,1),
  rest_seconds        integer,
  last_set_amrap      boolean not null default false,
  barbell_id_override uuid references barbells(id) on delete set null,
  ceiling_behavior_override text check (ceiling_behavior_override in ('hold_warn','auto_switch_reps')),
  consolidation_enabled  boolean not null default false,
  consolidation_sessions integer not null default 1 check (consolidation_sessions >= 0),
  notes               text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  constraint workout_entries_double_range_chk
    check (rep_scheme <> 'double'
           or (rep_range_low is not null and rep_range_high is not null
               and rep_range_high >= rep_range_low)),
  constraint workout_entries_straight_target_chk
    check (rep_scheme <> 'straight' or rep_target is not null)
);
-- deferrable initially deferred so bulk position reorders swap without explicit set constraints
do $$ begin
  alter table workout_entries
    add constraint ux_workout_entries_position unique (workout_id, position)
    deferrable initially deferred;
exception when duplicate_table or duplicate_object then null;
end $$;
create index if not exists ix_workout_entries_workout on workout_entries (workout_id, position);
create index if not exists ix_workout_entries_exercise on workout_entries (exercise_id);
create index if not exists ix_workout_entries_user on workout_entries (user_id);

-- ----------------------------------------------------------------------------
-- 6. SCHEDULE
-- ----------------------------------------------------------------------------

create table if not exists routines (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name        text not null,
  is_active   boolean not null default false,
  notes       text,
  archived_at timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create unique index if not exists ux_routines_one_active
  on routines (user_id) where is_active;

create table if not exists rotations (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null default auth.uid() references auth.users(id) on delete cascade,
  routine_id    uuid not null references routines(id) on delete cascade,
  position      integer not null,
  name          text,
  current_index integer not null default 0 check (current_index >= 0),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
do $$ begin
  alter table rotations
    add constraint ux_rotations_position unique (routine_id, position)
    deferrable initially deferred;
exception when duplicate_table or duplicate_object then null;
end $$;
create index if not exists ix_rotations_routine on rotations (routine_id, position);

create table if not exists rotation_workouts (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  rotation_id uuid not null references rotations(id) on delete cascade,
  -- cascade (was restrict): a hard delete of a workout takes its memberships with it
  -- (the model prefers soft-delete via archived_at); avoids blocking account cascade.
  workout_id  uuid not null references workouts(id) on delete cascade,
  position    integer not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
do $$ begin
  alter table rotation_workouts
    add constraint ux_rotation_workouts_position unique (rotation_id, position)
    deferrable initially deferred;
exception when duplicate_table or duplicate_object then null;
end $$;
create index if not exists ix_rotation_workouts_rotation on rotation_workouts (rotation_id, position);
create index if not exists ix_rotation_workouts_workout on rotation_workouts (workout_id);

-- ----------------------------------------------------------------------------
-- 7. PROGRESSION ENGINE
-- ----------------------------------------------------------------------------

create table if not exists progression_settings (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null default auth.uid() references auth.users(id) on delete cascade,
  scope            text not null check (scope in ('routine','workout','exercise')),
  routine_id       uuid references routines(id) on delete cascade,
  workout_id       uuid references workouts(id) on delete cascade,
  workout_entry_id uuid references workout_entries(id) on delete cascade,
  warmup_enabled         boolean,
  warmup_threshold_basis text check (warmup_threshold_basis in ('working_weight','volume')),
  warmup_threshold_value numeric,
  warmup_ramp_pcts       numeric[],
  rest_seconds           integer,
  consolidation_enabled  boolean,
  consolidation_sessions integer,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  constraint progression_settings_scope_fk_chk check (
    (scope = 'routine'  and routine_id is not null and workout_id is null and workout_entry_id is null) or
    (scope = 'workout'  and workout_id is not null and routine_id is null and workout_entry_id is null) or
    (scope = 'exercise' and workout_entry_id is not null and routine_id is null and workout_id is null)
  )
);
create unique index if not exists ux_progression_settings_routine
  on progression_settings (routine_id) where scope = 'routine';
create unique index if not exists ux_progression_settings_workout
  on progression_settings (workout_id) where scope = 'workout';
create unique index if not exists ux_progression_settings_entry
  on progression_settings (workout_entry_id) where scope = 'exercise';
create index if not exists ix_progression_settings_user on progression_settings (user_id);

create table if not exists progression_pipelines (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  settings_id uuid not null references progression_settings(id) on delete cascade,
  name        text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint ux_progression_pipelines_settings unique (settings_id)
);
create index if not exists ix_progression_pipelines_user on progression_pipelines (user_id);

create table if not exists progression_steps (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  pipeline_id uuid not null references progression_pipelines(id) on delete cascade,
  position    integer not null,
  dimension   text not null check (dimension in ('weight','reps','sets')),
  applies_to  text check (applies_to in ('all_sets','last_set')),
  weight_mode text check (weight_mode in ('fixed','pct_of_last','pct_of_target')),
  amount      numeric not null,
  every_n     integer not null default 1 check (every_n >= 1),
  cap_type    text not null default 'none' check (cap_type in ('none','target_weight','rep_count','set_count')),
  cap_value   numeric,
  on_cap      text not null default 'stop' check (on_cap in ('stop','next_step','loop')),
  loop_target_position integer not null default 0 check (loop_target_position >= 0),
  reset       text not null default 'none' check (reset in ('none','reps_to_base','sets_to_base')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint progression_steps_cap_chk     check (cap_type = 'none' or cap_value is not null),
  constraint progression_steps_weight_chk  check (dimension <> 'weight' or weight_mode is not null),
  constraint progression_steps_reps_chk    check (dimension <> 'reps' or applies_to is not null),
  -- a 'loop' step must make progress (reset a dimension or have a cap) before looping
  constraint progression_steps_loop_chk    check (on_cap <> 'loop' or reset <> 'none' or cap_type <> 'none')
);
do $$ begin
  alter table progression_steps
    add constraint ux_progression_steps_position unique (pipeline_id, position)
    deferrable initially deferred;
exception when duplicate_table or duplicate_object then null;
end $$;
create index if not exists ix_progression_steps_pipeline on progression_steps (pipeline_id, position);

create table if not exists failure_rules (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  settings_id uuid not null references progression_settings(id) on delete cascade,
  condition_below_target boolean not null default true,
  condition_missed_sets  integer,
  condition_missed_reps  integer,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint ux_failure_rules_settings unique (settings_id)
);
create index if not exists ix_failure_rules_user on failure_rules (user_id);

create table if not exists failure_responses (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null default auth.uid() references auth.users(id) on delete cascade,
  failure_rule_id uuid not null references failure_rules(id) on delete cascade,
  position        integer not null,
  response_type   text not null check (response_type in
                    ('repeat','deload_lb','deload_pct','deload_reps','drop_set')),
  repeat_limit    integer,
  amount          numeric,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
do $$ begin
  alter table failure_responses
    add constraint ux_failure_responses_position unique (failure_rule_id, position)
    deferrable initially deferred;
exception when duplicate_table or duplicate_object then null;
end $$;
create index if not exists ix_failure_responses_rule on failure_responses (failure_rule_id, position);

-- progression_state: the single shared WORKING-WEIGHT line (routine_id, exercise_id).
-- Holds ONLY the weight line + weight-pipeline cursor/counters + failure cursor +
-- ceiling flags + the ideal un-rounded line (target_line_weight). Rep/set live
-- state lives in progression_entry_state (below).
-- NOTE: last_session_entry_id FK added after session_entries exists (see §8).
create table if not exists progression_state (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  routine_id  uuid not null references routines(id) on delete cascade,
  -- DEFERRED no-action FK: exercise_id can point at a user-owned custom exercise;
  -- deferral lets a full account cascade delete both without aborting (see §7).
  exercise_id uuid not null
                references exercises(id) on delete no action
                deferrable initially deferred,
  current_weight        numeric,   -- plate-rounded shared working weight (null for unloaded)
  target_line_weight    numeric,   -- ideal un-rounded running line (decouples ideal from plate reality)
  pipeline_step_index     integer not null default 0,  -- current WEIGHT step
  step_completion_counter integer not null default 0,  -- weight-step every_n; reset on step change
  failure_counter         integer not null default 0,  -- repeats within current failure response
  current_failure_response_index integer not null default 0,  -- cursor into failure_responses chain
  consolidation_counter   integer not null default 0,  -- gap-workout holds remaining (§6)
  progression_mode        text not null default 'weight'
                            check (progression_mode in ('weight','reps_fallback')),  -- ceiling auto-switch
  weight_frozen           boolean not null default false,  -- computed weight exceeds loadable max
  last_session_entry_id   uuid,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint ux_progression_state_routine_exercise unique (routine_id, exercise_id)
);
create index if not exists ix_progression_state_user on progression_state (user_id);

-- progression_entry_state: per-(routine, workout_entry) REP/SET live line.
-- This is the rep/set half of the O-5a split — each entry keeps its own rep
-- ladder while reading the shared progression_state weight for its exercise.
-- NOTE: last_session_entry_id FK added after session_entries exists (see §8).
create table if not exists progression_entry_state (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  routine_id  uuid not null references routines(id) on delete cascade,
  workout_entry_id uuid not null references workout_entries(id) on delete cascade,
  current_rep_target     integer,
  current_rep_range_low  integer,
  current_rep_range_high integer,
  current_set_count      integer,
  repset_pipeline_step_index     integer not null default 0,  -- current REP/SET step
  repset_step_completion_counter integer not null default 0,  -- rep/set-step every_n; reset on step change
  last_session_entry_id  uuid,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint ux_progression_entry_state_routine_entry unique (routine_id, workout_entry_id)
);
create index if not exists ix_progression_entry_state_user on progression_entry_state (user_id);
create index if not exists ix_progression_entry_state_key
  on progression_entry_state (routine_id, workout_entry_id);

-- ----------------------------------------------------------------------------
-- 8. SESSIONS & LOGS (immutable)
-- ----------------------------------------------------------------------------

create table if not exists sessions (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null default auth.uid() references auth.users(id) on delete cascade,
  routine_id   uuid references routines(id) on delete set null,
  location_id  uuid references locations(id) on delete set null,
  performed_on date not null default current_date,
  started_at   timestamptz,
  completed_at timestamptz,
  status       text not null default 'in_progress'
                 check (status in ('in_progress','completed','abandoned')),
  notes        text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists ix_sessions_user_date on sessions (user_id, performed_on desc);
create index if not exists ix_sessions_routine on sessions (routine_id);
create index if not exists ix_sessions_in_progress on sessions (user_id) where status = 'in_progress';

create table if not exists session_entries (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null default auth.uid() references auth.users(id) on delete cascade,
  session_id       uuid not null references sessions(id) on delete cascade,
  workout_id       uuid references workouts(id) on delete set null,
  workout_entry_id uuid references workout_entries(id) on delete set null,
  -- DEFERRED no-action FK (custom exercise + account cascade safety, §7)
  exercise_id      uuid not null
                     references exercises(id) on delete no action
                     deferrable initially deferred,
  position         integer not null,
  planned_sets        integer,
  planned_rep_scheme  text check (planned_rep_scheme in ('straight','double','rpe')),
  planned_rep_target  integer,
  planned_rep_low     integer,
  planned_rep_high    integer,
  planned_weight      numeric,
  planned_rest_seconds integer,
  last_set_amrap      boolean not null default false,
  was_failure         boolean not null default false,
  was_consolidation_hold boolean not null default false,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index if not exists ix_session_entries_session on session_entries (session_id, position);
create index if not exists ix_session_entries_exercise on session_entries (exercise_id);
create index if not exists ix_session_entries_workout_entry on session_entries (workout_entry_id);

-- now wire the deferred *_state.last_session_entry_id FKs (idempotent)
do $$ begin
  alter table progression_state
    add constraint progression_state_last_entry_fk
    foreign key (last_session_entry_id) references session_entries(id) on delete set null;
exception when duplicate_object then null;
end $$;
do $$ begin
  alter table progression_entry_state
    add constraint progression_entry_state_last_entry_fk
    foreign key (last_session_entry_id) references session_entries(id) on delete set null;
exception when duplicate_object then null;
end $$;

-- videos table referenced by set_logs.video_id; created here before set_logs.
create table if not exists videos (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null default auth.uid() references auth.users(id) on delete cascade,
  set_log_id       uuid,  -- FK added after set_logs exists (reciprocal link)
  storage_path     text not null unique,
  duration_seconds numeric(5,2) not null check (duration_seconds > 0 and duration_seconds <= 30),
  mime_type        text,
  size_bytes       bigint check (size_bytes >= 0),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),  -- added so set_updated_at() applies (paid-tier extend)
  expires_at       timestamptz not null default (now() + interval '30 days')
                     check (expires_at > created_at)
);
create index if not exists ix_videos_user on videos (user_id);
create index if not exists ix_videos_set_log on videos (set_log_id) where set_log_id is not null;
create index if not exists ix_videos_expires on videos (expires_at);

create table if not exists set_logs (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null default auth.uid() references auth.users(id) on delete cascade,
  session_entry_id  uuid not null references session_entries(id) on delete cascade,
  set_index         integer not null check (set_index > 0),
  is_warmup         boolean not null default false,
  is_completed      boolean not null default true,
  planned_reps      integer,
  actual_reps       integer,
  planned_weight    numeric,
  actual_weight     numeric,
  rest_taken_seconds integer,
  is_amrap          boolean not null default false,
  amrap_reps        integer,
  rpe               numeric(3,1),
  completed_at      timestamptz,
  video_id          uuid references videos(id) on delete set null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  constraint ux_set_logs_entry_index unique (session_entry_id, set_index)
);
create index if not exists ix_set_logs_entry on set_logs (session_entry_id, set_index);
create index if not exists ix_set_logs_working on set_logs (user_id) where is_warmup = false;
create index if not exists ix_set_logs_user_completed on set_logs (user_id, completed_at);

-- reciprocal videos.set_log_id FK (idempotent)
do $$ begin
  alter table videos
    add constraint videos_set_log_fk
    foreign key (set_log_id) references set_logs(id) on delete set null;
exception when duplicate_object then null;
end $$;

create table if not exists session_overrides (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null default auth.uid() references auth.users(id) on delete cascade,
  session_entry_id uuid not null references session_entries(id) on delete cascade,
  workout_entry_id uuid references workout_entries(id) on delete set null,
  field            text not null check (field in ('rest_seconds','reps','sets','weight')),
  old_value        numeric,
  new_value        numeric,
  persisted_to_template boolean not null default false,
  persisted_at     timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index if not exists ix_session_overrides_entry on session_overrides (session_entry_id);
create index if not exists ix_session_overrides_persisted
  on session_overrides (workout_entry_id) where persisted_to_template;

create table if not exists audit_log (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  action      text not null check (action in
                ('template_edit','progression_adjust','override_saved','deload',
                 'gap_workout','failure_repeat','step_advance','cap_reached','reset')),
  entity_type text not null,
  entity_id   uuid,
  routine_id  uuid references routines(id) on delete set null,
  exercise_id uuid references exercises(id) on delete set null,
  session_id  uuid references sessions(id) on delete set null,
  before      jsonb,
  after       jsonb,
  summary     text,
  created_at  timestamptz not null default now()
);
create index if not exists ix_audit_log_user_created on audit_log (user_id, created_at desc);
create index if not exists ix_audit_log_entity on audit_log (entity_type, entity_id);
create index if not exists ix_audit_log_context on audit_log (routine_id, exercise_id);

-- ----------------------------------------------------------------------------
-- 9. PROFILE & SETTINGS (user singletons)
-- ----------------------------------------------------------------------------

create table if not exists user_profiles (
  user_id        uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  display_name   text,
  sex            text not null default 'male' check (sex in ('male','female')),
  birthdate      date,
  height_in      numeric(5,2) check (height_in is null or height_in between 24 and 108),
  bodyweight_lb  numeric(6,2) check (bodyweight_lb is null or bodyweight_lb between 30 and 1500),
  bodyweight_updated_at timestamptz,
  unit_system    text not null default 'imperial' check (unit_system in ('imperial','metric')),
  default_photo_category text not null default 'front'
                   check (default_photo_category in ('front','side','back','custom')),
  reminders_enabled        boolean not null default true,
  show_post_workout_nudges boolean not null default true,
  video_retention_days     integer not null default 30  check (video_retention_days > 0),
  photo_retention_days     integer not null default 365 check (photo_retention_days > 0),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create table if not exists chart_preferences (
  user_id         uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  volume_metric   text not null default 'hard_sets'
                    check (volume_metric in ('hard_sets','tonnage','total_reps')),
  time_window     text not null default '4wk'
                    check (time_window in ('7d','4wk','12wk','all')),
  radar_mode      text not null default 'volume'
                    check (radar_mode in ('volume','strength')),
  weakest_view    text not null default 'relative'
                    check (weakest_view in ('relative','standards')),
  count_secondary boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create table if not exists app_preferences (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  key        text not null check (char_length(key) between 1 and 128),
  value      jsonb not null default 'true'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ux_app_preferences_user_key unique (user_id, key)
);
create index if not exists ix_app_preferences_user on app_preferences (user_id);

-- ----------------------------------------------------------------------------
-- 10. MEDIA, MEASUREMENTS & REMINDERS
-- ----------------------------------------------------------------------------

create table if not exists progress_photos (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null default auth.uid() references auth.users(id) on delete cascade,
  storage_path text not null unique,
  category     text not null check (category in ('front','side','back','custom')),
  custom_label text check ((category = 'custom') = (custom_label is not null)),
  taken_on     date not null default current_date,
  mime_type    text,
  size_bytes   bigint check (size_bytes >= 0),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),  -- added so set_updated_at() applies (paid-tier extend)
  expires_at   timestamptz not null default (now() + interval '365 days')
                 check (expires_at > created_at)
);
create index if not exists ix_progress_photos_user on progress_photos (user_id);
create index if not exists ix_progress_photos_user_taken
  on progress_photos (user_id, category, taken_on desc);
create index if not exists ix_progress_photos_expires on progress_photos (expires_at);

create table if not exists body_measurements (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null default auth.uid() references auth.users(id) on delete cascade,
  taken_on     date not null default current_date,
  bodyweight   numeric(6,2) check (bodyweight is null or (bodyweight > 0 and bodyweight < 2000)),
  body_fat_pct numeric(5,2) check (body_fat_pct is null or (body_fat_pct >= 0 and body_fat_pct <= 100)),
  neck         numeric(5,2) check (neck      is null or (neck      > 0 and neck      < 200)),
  shoulders    numeric(5,2) check (shoulders is null or (shoulders > 0 and shoulders < 200)),
  chest        numeric(5,2) check (chest     is null or (chest     > 0 and chest     < 200)),
  waist        numeric(5,2) check (waist     is null or (waist     > 0 and waist     < 200)),
  hips         numeric(5,2) check (hips      is null or (hips      > 0 and hips      < 200)),
  arm_l        numeric(5,2) check (arm_l     is null or (arm_l     > 0 and arm_l     < 200)),
  arm_r        numeric(5,2) check (arm_r     is null or (arm_r     > 0 and arm_r     < 200)),
  thigh_l      numeric(5,2) check (thigh_l   is null or (thigh_l   > 0 and thigh_l   < 200)),
  thigh_r      numeric(5,2) check (thigh_r   is null or (thigh_r   > 0 and thigh_r   < 200)),
  calf_l       numeric(5,2) check (calf_l    is null or (calf_l    > 0 and calf_l    < 200)),
  calf_r       numeric(5,2) check (calf_r    is null or (calf_r    > 0 and calf_r    < 200)),
  forearm_l    numeric(5,2) check (forearm_l is null or (forearm_l > 0 and forearm_l < 200)),
  forearm_r    numeric(5,2) check (forearm_r is null or (forearm_r > 0 and forearm_r < 200)),
  extra        jsonb not null default '{}'::jsonb check (jsonb_typeof(extra) = 'object'),
  note         text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint ux_body_measurements_user_day unique (user_id, taken_on)
);
create index if not exists ix_body_measurements_user_taken
  on body_measurements (user_id, taken_on desc);

create table if not exists reminders (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null default auth.uid() references auth.users(id) on delete cascade,
  type         text not null check (type in ('weigh_in','measurements','photos')),
  cadence_days integer not null check (cadence_days > 0),
  last_done_at timestamptz,
  enabled      boolean not null default true,
  snooze_until timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint ux_reminders_user_type unique (user_id, type)
);
create index if not exists ix_reminders_user on reminders (user_id);

-- Optional: auto-bump reminder last_done_at when a measurement/photo lands.
create or replace function bump_reminder_on_measurement()
returns trigger
language plpgsql
as $$
begin
  if new.bodyweight is not null then
    update reminders set last_done_at = now()
      where user_id = new.user_id and type = 'weigh_in';
  end if;
  update reminders set last_done_at = now()
    where user_id = new.user_id and type = 'measurements';
  return new;
end;
$$;

create or replace function bump_reminder_on_photo()
returns trigger
language plpgsql
as $$
begin
  update reminders set last_done_at = now()
    where user_id = new.user_id and type = 'photos';
  return new;
end;
$$;

-- ----------------------------------------------------------------------------
-- 11. updated_at + immutability + ownership TRIGGERS (idempotent)
-- ----------------------------------------------------------------------------

-- updated_at triggers for every table that HAS an updated_at column.
-- (videos and progress_photos now have updated_at, so they are included.)
do $$
declare
  t text;
  tbls text[] := array[
    'locations','barbells','plate_inventory','dumbbells','equipment_preferences',
    'exercises','workouts','workout_entries','routines','rotations','rotation_workouts',
    'progression_settings','progression_pipelines','progression_steps',
    'failure_rules','failure_responses','progression_state','progression_entry_state',
    'sessions','session_entries','set_logs','session_overrides',
    'user_profiles','chart_preferences','app_preferences',
    'videos','progress_photos','body_measurements','reminders'
  ];
begin
  foreach t in array tbls loop
    execute format('drop trigger if exists trg_%1$s_updated_at on %1$s;', t);
    execute format(
      'create trigger trg_%1$s_updated_at before update on %1$s
         for each row execute function set_updated_at();', t);
  end loop;
end $$;

-- session immutability (parent row)
drop trigger if exists trg_sessions_immutable on sessions;
create trigger trg_sessions_immutable
  before update or delete on sessions
  for each row execute function prevent_completed_session_mutation();

-- session children immutability (block edits/deletes once the session is completed)
drop trigger if exists trg_session_entries_immutable on session_entries;
create trigger trg_session_entries_immutable
  before update or delete on session_entries
  for each row execute function prevent_completed_child_mutation();

drop trigger if exists trg_set_logs_immutable on set_logs;
create trigger trg_set_logs_immutable
  before update or delete on set_logs
  for each row execute function prevent_completed_child_mutation();

drop trigger if exists trg_session_overrides_immutable on session_overrides;
create trigger trg_session_overrides_immutable
  before update or delete on session_overrides
  for each row execute function prevent_completed_child_mutation();

-- audit append-only
drop trigger if exists trg_audit_no_mutate on audit_log;
create trigger trg_audit_no_mutate
  before update or delete on audit_log
  for each row execute function prevent_audit_mutation();

-- equipment cross-user reparent guards
drop trigger if exists trg_barbells_owner on barbells;
create trigger trg_barbells_owner
  before insert or update on barbells
  for each row execute function assert_equipment_owner();

drop trigger if exists trg_plate_inventory_owner on plate_inventory;
create trigger trg_plate_inventory_owner
  before insert or update on plate_inventory
  for each row execute function assert_equipment_owner();

drop trigger if exists trg_dumbbells_owner on dumbbells;
create trigger trg_dumbbells_owner
  before insert or update on dumbbells
  for each row execute function assert_equipment_owner();

-- reminder auto-bump
drop trigger if exists trg_bump_reminder_measurement on body_measurements;
create trigger trg_bump_reminder_measurement
  after insert on body_measurements
  for each row execute function bump_reminder_on_measurement();

drop trigger if exists trg_bump_reminder_photo on progress_photos;
create trigger trg_bump_reminder_photo
  after insert on progress_photos
  for each row execute function bump_reminder_on_photo();

-- ----------------------------------------------------------------------------
-- 12. ROW LEVEL SECURITY
-- ----------------------------------------------------------------------------

-- 12.1 Global reference tables: read-all, no user writes
alter table muscle_groups      enable row level security;
alter table strength_standards enable row level security;

drop policy if exists muscle_groups_read on muscle_groups;
create policy muscle_groups_read on muscle_groups for select using (true);

drop policy if exists strength_standards_read on strength_standards;
create policy strength_standards_read on strength_standards for select using (true);

-- 12.2 exercises: read own + global seeds; write own only. (enable + FORCE)
alter table exercises enable row level security;
alter table exercises force  row level security;
drop policy if exists exercises_select on exercises;
create policy exercises_select on exercises for select
  using (user_id = auth.uid() or user_id is null);
drop policy if exists exercises_insert on exercises;
create policy exercises_insert on exercises for insert
  with check (user_id = auth.uid());
drop policy if exists exercises_update on exercises;
create policy exercises_update on exercises for update
  using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists exercises_delete on exercises;
create policy exercises_delete on exercises for delete
  using (user_id = auth.uid());

-- 12.3 exercise_muscles: visibility inherited from parent exercise. (enable + FORCE)
alter table exercise_muscles enable row level security;
alter table exercise_muscles force  row level security;
drop policy if exists exercise_muscles_select on exercise_muscles;
create policy exercise_muscles_select on exercise_muscles for select
  using (exists (select 1 from exercises e
                 where e.id = exercise_id
                   and (e.user_id = auth.uid() or e.user_id is null)));
drop policy if exists exercise_muscles_insert on exercise_muscles;
create policy exercise_muscles_insert on exercise_muscles for insert
  with check (exists (select 1 from exercises e
                      where e.id = exercise_id and e.user_id = auth.uid()));
drop policy if exists exercise_muscles_update on exercise_muscles;
create policy exercise_muscles_update on exercise_muscles for update
  using (exists (select 1 from exercises e
                 where e.id = exercise_id and e.user_id = auth.uid()))
  with check (exists (select 1 from exercises e
                      where e.id = exercise_id and e.user_id = auth.uid()));
drop policy if exists exercise_muscles_delete on exercise_muscles;
create policy exercise_muscles_delete on exercise_muscles for delete
  using (exists (select 1 from exercises e
                 where e.id = exercise_id and e.user_id = auth.uid()));

-- 12.4 Standard owner-only RLS for every user-owned table.
do $$
declare
  t text;
  tbls text[] := array[
    'locations','barbells','plate_inventory','dumbbells','equipment_preferences',
    'workouts','workout_entries','routines','rotations','rotation_workouts',
    'progression_settings','progression_pipelines','progression_steps',
    'failure_rules','failure_responses','progression_state','progression_entry_state',
    'sessions','session_entries','set_logs','session_overrides','audit_log',
    'user_profiles','chart_preferences','app_preferences',
    'videos','progress_photos','body_measurements','reminders'
  ];
begin
  foreach t in array tbls loop
    execute format('alter table %1$s enable row level security;', t);
    execute format('alter table %1$s force row level security;', t);

    execute format('drop policy if exists %1$s_select on %1$s;', t);
    execute format('drop policy if exists %1$s_insert on %1$s;', t);
    execute format('drop policy if exists %1$s_update on %1$s;', t);
    execute format('drop policy if exists %1$s_delete on %1$s;', t);

    execute format(
      'create policy %1$s_select on %1$s for select using (user_id = auth.uid());', t);
    execute format(
      'create policy %1$s_insert on %1$s for insert with check (user_id = auth.uid());', t);
    -- audit_log is append-only: no update/delete policies granted
    if t <> 'audit_log' then
      execute format(
        'create policy %1$s_update on %1$s for update
           using (user_id = auth.uid()) with check (user_id = auth.uid());', t);
      execute format(
        'create policy %1$s_delete on %1$s for delete using (user_id = auth.uid());', t);
    end if;
  end loop;
end $$;

-- ----------------------------------------------------------------------------
-- 13. ANALYTICS VIEWS  (derived, never stored; security_invoker)
-- ----------------------------------------------------------------------------

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
  case when sl.actual_weight > 0
       then sl.actual_weight * (1 + sl.actual_reps / 30.0)
  end                                                       as est_1rm_lb
from set_logs sl
join session_entries se on se.id = sl.session_entry_id
join sessions s         on s.id  = se.session_id
where sl.is_warmup = false;

create or replace view v_muscle_volume_weekly
with (security_invoker = true) as
select
  m.user_id,
  em.muscle_group_id,
  m.week_start,
  sum(case when m.is_hard_set then em.weight else 0 end)                 as hard_sets,
  sum(case when m.is_hard_set and em.role = 'primary' then 1 else 0 end) as hard_sets_primary,
  sum(em.weight * m.tonnage_lb)                                          as tonnage_lb,
  sum(em.weight * m.reps)                                                as total_reps
from v_set_log_metrics m
join exercise_muscles em on em.exercise_id = m.exercise_id
group by m.user_id, em.muscle_group_id, m.week_start;

create or replace view v_exercise_e1rm
with (security_invoker = true) as
select
  user_id,
  exercise_id,
  max(est_1rm_lb)                                                                  as best_e1rm_lb,
  max(est_1rm_lb) filter (where performed_on >= (current_date - interval '12 weeks')) as best_e1rm_12wk_lb,
  max(performed_on) filter (where est_1rm_lb is not null)                          as last_loaded_on
from v_set_log_metrics
where est_1rm_lb is not null
group by user_id, exercise_id;

create or replace view v_muscle_strength
with (security_invoker = true) as
select
  e1.user_id,
  em.muscle_group_id,
  max(e1.best_e1rm_lb) as strength_e1rm_lb
from v_exercise_e1rm e1
join exercise_muscles em on em.exercise_id = e1.exercise_id and em.role = 'primary'
join exercises ex       on ex.id = e1.exercise_id and coalesce(ex.is_loaded, true)
group by e1.user_id, em.muscle_group_id;

-- Emits the band AND the four bounding thresholds + bodyweight so the UI can
-- interpolate a percentile-like position within a band (M6).
create or replace view v_strength_vs_standards
with (security_invoker = true) as
select
  e1.user_id,
  ex.lift_key,
  e1.best_e1rm_lb,
  p.bodyweight_lb,
  coalesce(ss.novice_lb,       ss.novice_ratio       * p.bodyweight_lb) as novice_lb,
  coalesce(ss.intermediate_lb, ss.intermediate_ratio * p.bodyweight_lb) as intermediate_lb,
  coalesce(ss.advanced_lb,     ss.advanced_ratio     * p.bodyweight_lb) as advanced_lb,
  coalesce(ss.elite_lb,        ss.elite_ratio        * p.bodyweight_lb) as elite_lb,
  case
    when e1.best_e1rm_lb >= coalesce(ss.elite_lb,        ss.elite_ratio        * p.bodyweight_lb) then 'elite'
    when e1.best_e1rm_lb >= coalesce(ss.advanced_lb,     ss.advanced_ratio     * p.bodyweight_lb) then 'advanced'
    when e1.best_e1rm_lb >= coalesce(ss.intermediate_lb, ss.intermediate_ratio * p.bodyweight_lb) then 'intermediate'
    when e1.best_e1rm_lb >= coalesce(ss.novice_lb,       ss.novice_ratio       * p.bodyweight_lb) then 'novice'
    else 'beginner'
  end as standard_band
from v_exercise_e1rm e1
join exercises ex     on ex.id = e1.exercise_id and ex.lift_key is not null
join user_profiles p  on p.user_id = e1.user_id
join strength_standards ss
  on ss.lift_key = ex.lift_key
 and ss.sex = p.sex
 and (ss.bw_min_lb is null or p.bodyweight_lb >= ss.bw_min_lb)
 and (ss.bw_max_lb is null or p.bodyweight_lb <  ss.bw_max_lb);

-- v_frequency: M5 "most often" — completed-session counts of workouts, exercises,
-- and muscles across the 7d/4wk/12wk/all windows. One row per
-- (user, dimension, key, time_window) with a count and a human label.
create or replace view v_frequency
with (security_invoker = true) as
with completed as (
  select se.user_id, se.session_id, se.workout_id, se.exercise_id, s.performed_on
  from session_entries se
  join sessions s on s.id = se.session_id and s.status = 'completed'
),
windows as (
  select '7d'::text  as time_window, (current_date - interval '7 days')   as since
  union all select '4wk',            (current_date - interval '4 weeks')
  union all select '12wk',           (current_date - interval '12 weeks')
  union all select 'all',            'epoch'::timestamptz
),
scoped as (
  select c.*, w.time_window
  from completed c
  join windows w on c.performed_on >= w.since
),
workout_freq as (
  select sc.user_id, sc.time_window, 'workout'::text as dimension,
         sc.workout_id::text as key,
         max(wo.name)     as label,
         count(distinct sc.session_id) as cnt
  from scoped sc
  left join workouts wo on wo.id = sc.workout_id
  where sc.workout_id is not null
  group by sc.user_id, sc.time_window, sc.workout_id
),
exercise_freq as (
  select sc.user_id, sc.time_window, 'exercise'::text as dimension,
         sc.exercise_id::text as key,
         max(ex.name)      as label,
         count(*)          as cnt
  from scoped sc
  join exercises ex on ex.id = sc.exercise_id
  group by sc.user_id, sc.time_window, sc.exercise_id
),
muscle_freq as (
  select sc.user_id, sc.time_window, 'muscle'::text as dimension,
         em.muscle_group_id::text as key,
         max(mg.display_name)     as label,
         count(*)                 as cnt
  from scoped sc
  join exercise_muscles em on em.exercise_id = sc.exercise_id
  join muscle_groups mg    on mg.id = em.muscle_group_id
  group by sc.user_id, sc.time_window, em.muscle_group_id
)
select * from workout_freq
union all select * from exercise_freq
union all select * from muscle_freq;

create or replace view reminders_due
with (security_invoker = true) as
select
  r.*,
  r.enabled
    and (r.snooze_until is null or r.snooze_until <= now())
    and (r.last_done_at is null
         or r.last_done_at + make_interval(days => r.cadence_days) <= now())
      as is_due,
  case when r.last_done_at is null then r.created_at
       else r.last_done_at + make_interval(days => r.cadence_days) end
      as due_since
from reminders r;

-- ----------------------------------------------------------------------------
-- 14. STORAGE BUCKETS + RLS (private form-videos / progress-photos)
-- ----------------------------------------------------------------------------

insert into storage.buckets (id, name, public)
  values ('form-videos','form-videos', false)
  on conflict (id) do update set public = excluded.public;
insert into storage.buckets (id, name, public)
  values ('progress-photos','progress-photos', false)
  on conflict (id) do update set public = excluded.public;

-- form-videos: owner = first path segment
drop policy if exists form_videos_select_own on storage.objects;
create policy form_videos_select_own on storage.objects for select to authenticated
  using (bucket_id = 'form-videos' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists form_videos_insert_own on storage.objects;
create policy form_videos_insert_own on storage.objects for insert to authenticated
  with check (bucket_id = 'form-videos' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists form_videos_update_own on storage.objects;
create policy form_videos_update_own on storage.objects for update to authenticated
  using (bucket_id = 'form-videos' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'form-videos' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists form_videos_delete_own on storage.objects;
create policy form_videos_delete_own on storage.objects for delete to authenticated
  using (bucket_id = 'form-videos' and (storage.foldername(name))[1] = auth.uid()::text);

-- progress-photos
drop policy if exists progress_photos_select_own on storage.objects;
create policy progress_photos_select_own on storage.objects for select to authenticated
  using (bucket_id = 'progress-photos' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists progress_photos_insert_own on storage.objects;
create policy progress_photos_insert_own on storage.objects for insert to authenticated
  with check (bucket_id = 'progress-photos' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists progress_photos_update_own on storage.objects;
create policy progress_photos_update_own on storage.objects for update to authenticated
  using (bucket_id = 'progress-photos' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'progress-photos' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists progress_photos_delete_own on storage.objects;
create policy progress_photos_delete_own on storage.objects for delete to authenticated
  using (bucket_id = 'progress-photos' and (storage.foldername(name))[1] = auth.uid()::text);

-- ----------------------------------------------------------------------------
-- 15. HELPER RPCs (atomic default-flips + media purge)
-- ----------------------------------------------------------------------------

create or replace function set_default_location(p_location_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update locations set is_default = false
    where user_id = auth.uid() and is_default and id <> p_location_id;
  update locations set is_default = true
    where id = p_location_id and user_id = auth.uid();
end;
$$;

create or replace function set_default_barbell(p_barbell_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  loc uuid;
begin
  select location_id into loc from barbells where id = p_barbell_id and user_id = auth.uid();
  if loc is null then
    raise exception 'barbell % not found for current user', p_barbell_id;
  end if;
  update barbells set is_default = false
    where location_id = loc and is_default and id <> p_barbell_id;
  update barbells set is_default = true
    where id = p_barbell_id and user_id = auth.uid();
end;
$$;

-- Purge expired media (rows + storage objects). Schedule via pg_cron or an
-- Edge Function separately (e.g. select cron.schedule(...)).
create or replace function purge_expired_media()
returns void
language plpgsql
security definer
set search_path = public, storage
as $$
begin
  delete from storage.objects o using videos v
    where o.bucket_id = 'form-videos' and o.name = v.storage_path
      and v.expires_at <= now();
  delete from videos where expires_at <= now();

  delete from storage.objects o using progress_photos p
    where o.bucket_id = 'progress-photos' and o.name = p.storage_path
      and p.expires_at <= now();
  delete from progress_photos where expires_at <= now();
end;
$$;

-- Tighten RPC execution: only intended callers may invoke (security posture).
revoke execute on function set_default_location(uuid) from public;
revoke execute on function set_default_barbell(uuid)  from public;
revoke execute on function purge_expired_media()      from public;
grant  execute on function set_default_location(uuid) to authenticated;
grant  execute on function set_default_barbell(uuid)  to authenticated;
grant  execute on function purge_expired_media()      to service_role;

-- ============================================================================
-- END 9999_init.sql
-- ============================================================================
