-- ============================================================================
-- strength_standards seed  (BUILD_PLAN M6 — "strength vs standards")
-- ----------------------------------------------------------------------------
-- Reference novice→elite thresholds for the five main barbell lifts, expressed
-- as a MULTIPLE OF BODYWEIGHT (ratio form). The schema (DATA_MODEL §2.2) stores
-- both absolute-lb and ratio forms; `v_strength_vs_standards` resolves a ratio
-- to pounds at query time via the user's `bodyweight_lb`, so a single
-- all-bodyweight bracket per (lift, sex) covers everyone and no migration is
-- forced if we later swap the dataset.
--
-- Provenance: synthesized SupaStrength reference table — ratios in the same
-- ballpark as widely-published strength-standard charts (ExRx / symmetric-
-- strength style), rounded to clean 1RM multiples. Not a copy of any single
-- proprietary dataset. Tagged with `source` so it is replaceable in one delete.
--
-- RE-RUNNABLE: deletes this source's rows first, then re-inserts. Paste into the
-- Supabase SQL Editor (loaded separately from the schema migration). Safe to run
-- repeatedly — it never touches rows from any other `source`.
-- ============================================================================

begin;

delete from strength_standards where source = 'supastrength-ratio-v1';

insert into strength_standards
  (lift_key, sex, bw_min_lb, bw_max_lb,
   novice_ratio, intermediate_ratio, advanced_ratio, elite_ratio, source)
values
  -- ----- MALE -------------------------------------------------------------
  ('squat',    'male', null, null, 1.00, 1.50, 2.00, 2.50, 'supastrength-ratio-v1'),
  ('bench',    'male', null, null, 0.75, 1.00, 1.50, 2.00, 'supastrength-ratio-v1'),
  ('deadlift', 'male', null, null, 1.25, 1.75, 2.50, 3.00, 'supastrength-ratio-v1'),
  ('ohp',      'male', null, null, 0.45, 0.65, 0.90, 1.20, 'supastrength-ratio-v1'),
  ('row',      'male', null, null, 0.65, 0.90, 1.25, 1.55, 'supastrength-ratio-v1'),
  -- ----- FEMALE -----------------------------------------------------------
  ('squat',    'female', null, null, 0.65, 1.00, 1.50, 2.00, 'supastrength-ratio-v1'),
  ('bench',    'female', null, null, 0.40, 0.60, 0.90, 1.30, 'supastrength-ratio-v1'),
  ('deadlift', 'female', null, null, 0.85, 1.25, 1.75, 2.25, 'supastrength-ratio-v1'),
  ('ohp',      'female', null, null, 0.30, 0.45, 0.65, 0.90, 'supastrength-ratio-v1'),
  ('row',      'female', null, null, 0.40, 0.60, 0.85, 1.15, 'supastrength-ratio-v1');

commit;

-- Sanity: 10 rows (5 lifts × 2 sexes).
-- select sex, lift_key, novice_ratio, elite_ratio from strength_standards
--   where source = 'supastrength-ratio-v1' order by sex, lift_key;
