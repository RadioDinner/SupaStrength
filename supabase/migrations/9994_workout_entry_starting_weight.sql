-- 9994: optional per-entry STARTING WEIGHT on workout templates.
--
-- The model said "weight is born in the session, never the template" — which
-- left the first session of every exercise unprescribed (blank inputs for a
-- single-workout session; a null weight line for a routine until the engine
-- cold-seeds from what was actually lifted). Users planning a program know
-- their opening weights and had nowhere to put them.
--
-- `workout_entries.starting_weight` (lb) seeds exactly ONE thing: the planned
-- weight when no progression state exists yet —
--   * single-workout sessions: planned weight for every set (still editable
--     per set in the gym);
--   * routine sessions: the prescription until `progression_state` exists;
--     after the first completion the engine's weight line takes over and the
--     template value is ignored forever.
-- All sets of an entry share one working weight by design; per-set variation
-- stays a live in-gym edit on the individual set inputs.
--
-- Re-runnable: `add column if not exists` (the inline check only applies when
-- the column is actually created). Paste any time after 9999_init.sql.

alter table workout_entries
  add column if not exists starting_weight numeric
    check (starting_weight is null or starting_weight > 0);
