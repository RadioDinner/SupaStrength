# SupaStrength — DATA_MODEL.md

> Authoritative data model for SupaStrength. Synthesized from the locked
> `docs/SPEC.md`. Stack: Vite + React + TypeScript SPA on Vercel; Supabase
> (Postgres + Auth + Storage + RLS). Single user today, multi-user-ready via RLS.
>
> Conventions (enforced everywhere):
> - `snake_case` identifiers.
> - Every user-owned table carries `user_id uuid not null references auth.users(id) on delete cascade`.
> - `created_at` / `updated_at timestamptz not null default now()`; `updated_at`
>   maintained by the shared `set_updated_at()` trigger.
> - RLS on every user-owned table, policy body `user_id = auth.uid()` (with
>   `with check` on writes). Global reference tables are read-all,
>   service-role-write.
> - Weights/lengths in **lbs / inches** (`numeric`, never float — exact
>   2.5/1.25 lb plate math). `unit_system` is display-only.

---

## 1. Overview

The model has six areas:

1. **Reference library** — the seeded ~800-row exercise library, the 12 muscle
   groups, exercise→muscle map, and published strength standards. Global
   (no `user_id`) or library rows with nullable `user_id` (custom exercises).
2. **Equipment & locations** — multi-location framework: locations, barbells,
   plate inventory, dumbbells, plus per-user `equipment_preferences`
   (rounding / micro-plate / ceiling). Drives the **client-side** plate calc
   (no plate solutions are stored).
3. **Templates** — `workouts` (reusable days) and `workout_entries`
   (an exercise placed in a day, holding the *prescription*: sets, rep scheme,
   rest, AMRAP — never the live weight).
4. **Schedule** — `routines` → `rotations` → `rotation_workouts`. A routine is
   the scope of the shared working-weight line. Each rotation has a pointer
   (`current_index`) that advances one step per completed session.
5. **Progression engine** — `progression_settings` (3-level scope-inheritance
   carrier), `progression_pipelines` → `progression_steps`,
   `failure_rules` → `failure_responses`, and the **two** live-state tables:
   `progression_state`, keyed `(routine_id, exercise_id)` — the *only* place a
   live **working weight** lives — and `progression_entry_state`, keyed
   `(routine_id, workout_entry_id)` — the per-entry **rep/set** live state.
6. **Sessions & logs (immutable)** — `sessions`, `session_entries`, `set_logs`,
   `session_overrides`, and the append-only `audit_log`.

Plus **analytics views** (derived, never stored), **media/measurements/
reminders** (videos, progress photos, body measurements, reminders), and the
**profile/settings** singletons (`user_profiles`, `chart_preferences`,
`app_preferences`).

### The one-sentence answer to "how is weight shared?"

`progression_state` is keyed `unique (routine_id, exercise_id)` and is the only
table that stores a live working **weight** (and the ideal un-rounded line, the
weight-pipeline cursor/counters, the failure cursor, and the ceiling flags).
The **rep/set** live state (current rep target/range, current set count, and the
rep/set pipeline cursor/counter) lives in `progression_entry_state`, keyed
`unique (routine_id, workout_entry_id)`. `workout_entries` hold prescriptions,
never live values. So squat in Workout A and squat in Workout B read and advance
the **same weight** state row — one continuously climbing line across the
routine — while each entry keeps **its own** rep ladder (A can be 5×5 straight,
B can be 3×8–12 double progression). This is the literal encoding of SPEC
[O-5a]: "Working weight is shared per (routine, exercise)" + "Rep-scheme / rep
targets can differ per workout-entry while weight stays shared."

---

## 2. ER relationships (high level)

```
auth.users (Supabase)
   │ 1:1   user_profiles, chart_preferences, equipment_preferences
   │ 1:N   app_preferences, locations, routines, workouts, exercises(custom),
   │       sessions, videos, progress_photos, body_measurements, reminders, audit_log
   │
muscle_groups (12, global) ──< exercise_muscles >── exercises (library; user_id nullable)
                                                        │
strength_standards (global, by lift_key/sex/bw)         │ lift_key
                                                        │
locations ──< barbells          exercises.default_barbell_id ─┐
          ──< plate_inventory                                 │ (nullable)
          ──< dumbbells                                        │
                                                              │
workouts ──< workout_entries >── exercises                    │
   │              │  barbell_id_override ──────────────────────┘
   │              │
routines ──< rotations ──< rotation_workouts >── workouts
   │                          ▲ current_index points into position
   │
   ├─ progression_settings (scope = routine|workout|exercise)
   │       └─< progression_pipelines ─< progression_steps
   │       └─< failure_rules ─< failure_responses
   │
   ├─ progression_state        (UNIQUE routine_id + exercise_id)  ← shared WEIGHT line
   │        ▲ current_weight, target_line_weight (ideal), weight step idx,
   │          step_completion_counter, failure_counter, current_failure_response_index,
   │          consolidation_counter, progression_mode / weight_frozen (ceiling)
   │
   └─ progression_entry_state  (UNIQUE routine_id + workout_entry_id)  ← per-entry REP/SET line
            ▲ current_rep_target, current_rep_range_low/high, current_set_count,
              repset_pipeline_step_index, repset_step_completion_counter

sessions ──< session_entries ──< set_logs
   │              ▲ snapshots workout_entry prescription   ▲ planned vs actual
   │              └─< session_overrides (in-gym edits, optionally saved to template)
   │
   └─ videos.set_log_id ─> set_logs   (nullable; form-video scaffold)

audit_log  (append-only ledger of all mutations around immutable sessions)
```

---

## 3. Tables by area

### 3.1 Reference library (global / nullable-user)

#### `exercises`
The seeded library. `user_id` is **nullable**: `null` = global seed row shared by
all users; non-null = a user's custom exercise. ~800 seed rows are loaded
**separately** (not in this migration).

| column | type | notes |
|---|---|---|
| `id` | `uuid` PK `default gen_random_uuid()` | |
| `user_id` | `uuid` null `references auth.users(id) on delete cascade` | null = global seed |
| `slug` | `text not null` | stable import key / dedupe |
| `name` | `text not null` | |
| `movement_type` | `text not null` check in (barbell, dumbbell, machine, cable, bodyweight, weighted_bodyweight, assisted, timed_cardio) | §5 |
| `loading_style` | `text not null` check in (barbell, dumbbell, plate_loaded, stack, bodyweight, banded, timed) | drives plate-calc applicability + ceiling source (§7) |
| `default_barbell_id` | `uuid` null `references barbells(id) on delete set null` | default bar for plate calc |
| `is_loaded` | `boolean not null default true` | only loaded lifts feed strength score (§9) |
| `is_unilateral` | `boolean not null default false` | per-arm/leg loading |
| `lift_key` | `text` null check in (squat, bench, deadlift, ohp, row) | the 5 main lifts → strength-vs-standards (§9) |
| `instructions` | `text` | |
| `default_rest_seconds` | `integer` | library-level fallback rest |
| `is_seed` | `boolean not null default false` | |
| `is_custom` | `boolean generated always as (user_id is not null) stored` | |
| `created_at`/`updated_at` | `timestamptz` | |

- Uniqueness: `unique (user_id, slug)` so a user can shadow a seed slug; partial
  `unique (slug) where user_id is null` for global seed uniqueness.
- Indexes: `(user_id)`, `(movement_type)`, `(lift_key) where lift_key is not null`,
  GIN trigram on `name` for search.
- RLS: **select** where `user_id = auth.uid() OR user_id is null` (read seeds);
  insert/update/delete only where `user_id = auth.uid()`. RLS **enabled + forced**
  (the force was added so the invariant "force on every user-owned table" holds
  for the nullable-user library too).

#### `muscle_groups`  (12 rows, global reference) — *the single muscle model*
Reconciliation: the engine slice proposed a fine-grained `muscles` table plus a
`major_group` rollup; the analytics slice proposed `muscle_groups` (12 rows).
Because the spec locks the radar and the strength rollup to exactly the **12
major groups** (§8 [M1], §9 [M7]), we keep **one** table — `muscle_groups` —
and map exercises directly to it. (If finer sub-muscles are ever needed, add a
child `muscles(group_id)` table later without touching the mapping contract.)

| column | type | notes |
|---|---|---|
| `id` | `smallint` PK | hand-assigned 1..12 (stable FK target) |
| `group_key` | `text not null unique` check `~ '^[a-z_]+$'` | join anchor for the seed muscle map |
| `display_name` | `text not null` | |
| `radar_order` | `smallint not null unique` | deterministic spoke layout |
| `created_at` | `timestamptz` | |

Seeded in this migration (12 rows, idempotent upsert): chest, back, shoulders,
biceps, triceps, quads, hamstrings, glutes, calves, core, traps, forearms.

- RLS: read-all (`using (true)`), service-role writes only.

#### `exercise_muscles`  (mapping with role + weight)
Join table; secondary weighting stored explicitly so it stays tunable.

| column | type | notes |
|---|---|---|
| `exercise_id` | `uuid not null references exercises(id) on delete cascade` | |
| `muscle_group_id` | `smallint not null references muscle_groups(id)` | |
| `role` | `text not null` check in (primary, secondary) | |
| `weight` | `numeric(2,1) not null` check in (1.0, 0.5) | §8 [M3] 1.0 primary / 0.5 secondary |
| PK | `(exercise_id, muscle_group_id)` | one role per group per exercise |

- Indexes: `(muscle_group_id)`; partial `(muscle_group_id) where role='primary'`
  (per-muscle strength rollup, §9).
- RLS: visibility inherited from parent exercise — select allowed where the
  exercise is global or owned; writes only when the parent exercise is owned by
  the caller. RLS **enabled + forced**.

#### `strength_standards`  (global reference)
Published novice→elite thresholds for the 5 main lifts by sex + bodyweight
bracket. Supports both absolute-lb and ×-bodyweight-ratio datasets, so the
dataset choice (still open, §13) won't force a migration. **Seeded separately.**

| column | type | notes |
|---|---|---|
| `id` | `bigint generated always as identity` PK | |
| `lift_key` | `text not null` check in (squat, bench, deadlift, ohp, row) | |
| `sex` | `text not null` check in (male, female) | |
| `bw_min_lb` / `bw_max_lb` | `numeric(6,2)` | half-open `[min, max)`; null = open |
| `novice_lb` / `intermediate_lb` / `advanced_lb` / `elite_lb` | `numeric(7,2)` | absolute form |
| `novice_ratio` / `intermediate_ratio` / `advanced_ratio` / `elite_ratio` | `numeric(4,2)` | ratio form |
| `source` | `text` | dataset provenance |
| `created_at` | `timestamptz` | |

- Check: `bw_min < bw_max` when both present; at least one of `novice_lb` /
  `novice_ratio` present.
- **Uniqueness (corrected):** the dedupe key now reflects the **full** half-open
  bracket — `unique (lift_key, sex, coalesce(bw_min_lb,-1), coalesce(bw_max_lb,'infinity'::numeric))`.
  This was changed from the min-only key so two rows that share a `bw_min_lb`
  but differ in `bw_max_lb` (or an open-ended-max row vs a closed one) can both
  exist, matching the `[min,max)` lookup in `v_strength_vs_standards`.
- Lookup index: `(lift_key, sex, bw_min_lb, bw_max_lb)`.
- RLS: read-all, service-role writes.

> **§9 percentile / age+height note [M6, minor finding].** `v_strength_vs_standards`
> emits a coarse **band** (beginner→elite) **plus the four bounding thresholds
> and the user's bodyweight**, so the UI can interpolate a true *percentile-like*
> position inside a band (linear between the two nearest thresholds). The SQL
> deliberately stops at the band + bounds; client interpolation is the [M6]
> "percentile vs standards." Published novice→elite standards are keyed only by
> **sex + bodyweight**, so `age`/`height` from `user_profiles` are **not** used
> in the standards lookup — they are retained on the profile for display/derived
> context (and a future age-adjusted dataset) but are intentionally unused here.
> The spec's mention of age/height as profile inputs is satisfied by their
> presence; they are over-specified for the sex+bodyweight datasets.

### 3.2 Equipment & locations (user-owned)

#### `locations`
| column | type | notes |
|---|---|---|
| `id` | `uuid` PK | |
| `user_id` | `uuid not null` | |
| `name` | `text not null` check len 1..80 | |
| `is_default` | `boolean not null default false` | partial-unique enforces ≤1 |
| `is_archived` | `boolean not null default false` | soft-hide (history FKs survive) |
| `sort_order` | `integer not null default 0` | |
| `created_at`/`updated_at` | `timestamptz` | |

- Indexes: unique `(user_id, lower(name))`; partial unique `(user_id) where is_default`; `(user_id)`.
- Exactly-one-default flip is done atomically by the `set_default_location()` RPC.

#### `barbells`
| column | type | notes |
|---|---|---|
| `id` | `uuid` PK | |
| `user_id` | `uuid not null` | |
| `location_id` | `uuid not null references locations(id) on delete cascade` | |
| `name` | `text not null` check len 1..60 | |
| `weight_lb` | `numeric(6,2) not null` check `>= 0` | |
| `is_default` | `boolean not null default false` | partial-unique per location |
| `is_archived` | `boolean not null default false` | |
| `sort_order` | `integer not null default 0` | |
| `created_at`/`updated_at` | `timestamptz` | |

- Indexes: unique `(location_id, lower(name))`; partial unique `(location_id) where is_default`; `(location_id)`, `(user_id)`.
- `assert_equipment_owner()` trigger guards against cross-user reparenting.

#### `plate_inventory`
| column | type | notes |
|---|---|---|
| `id` | `uuid` PK | |
| `user_id` | `uuid not null` | |
| `location_id` | `uuid not null references locations(id) on delete cascade` | |
| `denomination_lb` | `numeric(6,2) not null` check `> 0` | exact 1.25/2.5 |
| `quantity` | `integer not null default 0` check `>= 0` | **individual** plates; calc derives `floor(quantity/2)` pairs |
| `created_at`/`updated_at` | `timestamptz` | |

- Index: unique `(location_id, denomination_lb)`; `(location_id)`, `(user_id)`.

#### `dumbbells`
| column | type | notes |
|---|---|---|
| `id` | `uuid` PK | |
| `user_id` | `uuid not null` | |
| `location_id` | `uuid not null references locations(id) on delete cascade` | |
| `weight_lb` | `numeric(6,2) not null` check `> 0` | |
| `quantity` | `integer not null default 2` check `>= 0` | 2 = usable pair |
| `is_adjustable` | `boolean not null default false` | |
| `created_at`/`updated_at` | `timestamptz` | |

- Index: unique `(location_id, weight_lb)`; `(location_id)`, `(user_id)`.

#### `equipment_preferences`  (per-user, `user_id` is PK)
The engine reads these when routing computed weights through plate-aware rounding.

| column | type | notes |
|---|---|---|
| `user_id` | `uuid` **PK** | one row per user |
| `rounding_direction` | `text not null default 'down'` check in (up, down) | O-11 |
| `micro_plates_enabled` | `boolean not null default false` | gates 1.25 lb plates in the calc |
| `ceiling_behavior` | `text not null default 'hold_warn'` check in (hold_warn, auto_switch_reps) | §7 default; per-entry override lives on `workout_entries` |
| `created_at`/`updated_at` | `timestamptz` | |

> Plate solutions are **never stored** — `solvePlates(...)` is a pure client
> function over `barbells` + `plate_inventory` + these two flags. With one pair
> each of {2.5…45} + a 45 lb bar, loadable totals are 45→320 lb in 5 lb steps;
> 1.25 micros add 2.5 lb granularity; >320 triggers `ceiling_behavior`.

> **§7 equipment-ceiling scope [minor findings].** `ceiling_behavior` governs
> **any loaded exercise** whose computed weight exceeds the max loadable for its
> `loading_style` at the session's location — **not** just barbells:
> - **barbell / plate_loaded** → ceiling = bar weight + max symmetric plate sum
>   (per `plate_inventory`); current home gym caps at 320 lb.
> - **dumbbell** → ceiling = the max owned bell in `dumbbells` at that location
>   (the engine reads `dumbbells`; current home gym caps at 25 lb). Dumbbell
>   "snap to discrete owned bells (15/20/25)" is a pure `solvePlates`/snap
>   concern over the `dumbbells` rows; the schema already supports it.
> When the computed weight exceeds the ceiling, the engine sets
> `progression_state.weight_frozen = true` and routes to `ceiling_behavior`
> (see §3.5 ceiling state and §6 scenario j).

### 3.3 Templates (user-owned)

#### `workouts`
| column | type | notes |
|---|---|---|
| `id` | `uuid` PK | |
| `user_id` | `uuid not null` | |
| `name` | `text not null` | |
| `notes` | `text` | |
| `archived_at` | `timestamptz` | soft-delete (immutable sessions reference it) |
| `created_at`/`updated_at` | `timestamptz` | |

#### `workout_entries`  (the *exercise scope* — prescription; weight only as an opening seed)
| column | type | notes |
|---|---|---|
| `id` | `uuid` PK | |
| `user_id` | `uuid not null` | denormalized for RLS |
| `workout_id` | `uuid not null references workouts(id) on delete cascade` | |
| `exercise_id` | `uuid not null references exercises(id) on delete restrict` | |
| `position` | `integer not null` | order in the day |
| `sets` | `integer not null` check `> 0` | prescribed set count |
| `rep_scheme` | `text not null default 'straight'` check in (straight, double, rpe) | |
| `rep_target` | `integer` | straight |
| `rep_range_low` / `rep_range_high` | `integer` | double progression |
| `target_rpe` | `numeric(3,1)` | rpe (prescription-only; see RPE note §6) |
| `rest_seconds` | `integer` | null → inherit |
| `last_set_amrap` | `boolean not null default false` | last set to failure |
| `starting_weight` | `numeric` null check `> 0` | opening prescription until `progression_state` exists; ignored after the first commit (migration 9994) |
| `barbell_id_override` | `uuid` null `references barbells(id) on delete set null` | overrides exercise default bar |
| `ceiling_behavior_override` | `text` null check in (hold_warn, auto_switch_reps) | per-entry override of equipment ceiling (§7) |
| `consolidation_enabled` | `boolean not null default false` | opt-in gap-workout (§6) |
| `consolidation_sessions` | `integer not null default 1` check `>= 0` | # extra holds |
| `notes` | `text` | |
| `created_at`/`updated_at` | `timestamptz` | |

- Constraints: `unique (workout_id, position)` **deferrable initially deferred**
  (so the common bulk-reorder path swaps positions without an explicit
  `set constraints`); `check (rep_scheme <> 'double' or (rep_range_low is not
  null and rep_range_high is not null and rep_range_high >= rep_range_low))`;
  `check (rep_scheme <> 'straight' or rep_target is not null)`.
- Indexes: `(workout_id, position)`, `(exercise_id)`, `(user_id)`.

### 3.4 Schedule (user-owned)

#### `routines`
| column | type | notes |
|---|---|---|
| `id` | `uuid` PK | |
| `user_id` | `uuid not null` | |
| `name` | `text not null` | |
| `is_active` | `boolean not null default false` | partial unique → ≤1 active per user |
| `notes` | `text` | |
| `archived_at` | `timestamptz` | |
| `created_at`/`updated_at` | `timestamptz` | |

#### `rotations`
| column | type | notes |
|---|---|---|
| `id` | `uuid` PK | |
| `user_id` | `uuid not null` | |
| `routine_id` | `uuid not null references routines(id) on delete cascade` | |
| `position` | `integer not null` | track order |
| `name` | `text` | optional |
| `current_index` | `integer not null default 0` check `>= 0` | **the pointer** into `rotation_workouts.position` |
| `created_at`/`updated_at` | `timestamptz` | |

- `unique (routine_id, position)` **deferrable initially deferred**; index `(routine_id, position)`.

#### `rotation_workouts`
| column | type | notes |
|---|---|---|
| `id` | `uuid` PK | |
| `user_id` | `uuid not null` | |
| `rotation_id` | `uuid not null references rotations(id) on delete cascade` | |
| `workout_id` | `uuid not null references workouts(id) on delete cascade` | **changed from restrict → cascade** (see FK note) |
| `position` | `integer not null` | the pointer indexes this (0..n-1, contiguous) |
| `created_at`/`updated_at` | `timestamptz` | |

- `unique (rotation_id, position)` **deferrable initially deferred** (a workout
  may appear twice across rotations, but a position is unique within a rotation);
  indexes `(rotation_id, position)`, `(workout_id)`.

### 3.5 Progression engine (user-owned)

#### `progression_settings`  (scope-inheritance carrier)
One row per (scope, target). The `coalesce(exercise → workout → routine →
default)` chain implements "most-specific wins" for warmup, rest, and
consolidation **knobs**, and is the binding point for pipelines/failure rules.

| column | type | notes |
|---|---|---|
| `id` | `uuid` PK | |
| `user_id` | `uuid not null` | |
| `scope` | `text not null` check in (routine, workout, exercise) | discriminator |
| `routine_id` | `uuid` null `references routines(id) on delete cascade` | set iff scope=routine |
| `workout_id` | `uuid` null `references workouts(id) on delete cascade` | set iff scope=workout |
| `workout_entry_id` | `uuid` null `references workout_entries(id) on delete cascade` | set iff scope=exercise |
| `warmup_enabled` | `boolean` | null = inherit |
| `warmup_threshold_basis` | `text` null check in (working_weight, volume) | |
| `warmup_threshold_value` | `numeric` | see warmup-basis note below |
| `warmup_ramp_pcts` | `numeric[]` | default applied at resolve (`{0,55,70,85}`) |
| `rest_seconds` | `integer` | scope rest default |
| `consolidation_enabled` | `boolean` | |
| `consolidation_sessions` | `integer` | |
| `created_at`/`updated_at` | `timestamptz` | |

- Check enforces exactly the right FK per scope. Partial uniques:
  `unique (routine_id) where scope='routine'`,
  `unique (workout_id) where scope='workout'`,
  `unique (workout_entry_id) where scope='exercise'`.

> **Warmup basis='volume' semantics [O-8, minor finding].** The engine resolves
> the threshold operand at *prescribe* time:
> - `basis='working_weight'` → compare the resolved working weight
>   (`progression_state.current_weight`) against `warmup_threshold_value` (lbs).
> - `basis='volume'` → compare the entry's prescribed working **volume**
>   `current_set_count * current_rep_target * current_weight` (from
>   `progression_entry_state` × `progression_state`) against
>   `warmup_threshold_value` (lb-reps). Volume is a derived scalar computed at
>   resolve time, never stored. If working load/volume ≤ threshold, no warmups
>   are generated; otherwise the `warmup_ramp_pcts` ramp is applied to the
>   working weight (empty bar → ~55% → 70% → 85%).

#### `progression_pipelines`  → `progression_steps`
Pipeline bound to a `progression_settings` row (so pipeline **selection** reuses
the same scope precedence).

`progression_pipelines`: `id`, `user_id`, `settings_id (unique) references
progression_settings(id) on delete cascade`, `name`, timestamps.

`progression_steps`:

| column | type | notes |
|---|---|---|
| `id` | `uuid` PK | |
| `user_id` | `uuid not null` | |
| `pipeline_id` | `uuid not null references progression_pipelines(id) on delete cascade` | |
| `position` | `integer not null` | step order (0-based) |
| `dimension` | `text not null` check in (weight, reps, sets) | which state this step drives |
| `applies_to` | `text` null check in (all_sets, last_set) | reps dimension |
| `weight_mode` | `text` null check in (fixed, pct_of_last, pct_of_target) | weight only |
| `amount` | `numeric not null` | +5 lb / +1 rep / +1 set / +2.5% |
| `every_n` | `integer not null default 1` check `>= 1` | apply on every Nth qualifying completion |
| `cap_type` | `text not null default 'none'` check in (none, target_weight, rep_count, set_count) | |
| `cap_value` | `numeric` | required unless cap_type='none' |
| `on_cap` | `text not null default 'stop'` check in (stop, next_step, loop) | |
| `loop_target_position` | `integer not null default 0` check `>= 0` | **new:** where `on_cap='loop'` jumps to |
| `reset` | `text not null default 'none'` check in (none, reps_to_base, sets_to_base) | |
| `created_at`/`updated_at` | `timestamptz` | |

- Checks: `unique (pipeline_id, position)` **deferrable initially deferred**;
  `cap_type='none' or cap_value is not null`;
  `dimension<>'weight' or weight_mode is not null`;
  `dimension<>'reps' or applies_to is not null`;
  **new** `on_cap<>'loop' or (reset<>'none' or cap_type<>'none')` — rejects a
  degenerate no-op infinite loop (a `loop` step must either reset a dimension or
  have a cap, so it makes progress before looping).

> **Step cursor placement.** A `weight`-dimension step advances against
> `progression_state` (the shared line) and uses the **weight** cursor pair
> (`progression_state.pipeline_step_index`, `step_completion_counter`). A
> `reps`/`sets`-dimension step advances against `progression_entry_state` and
> uses the **rep/set** cursor pair (`progression_entry_state.repset_pipeline_step_index`,
> `repset_step_completion_counter`). A single pipeline can mix dimensions
> (double progression: a reps step then a weight step); the engine keeps the two
> cursors in lockstep through `on_cap`/`loop` transitions (see §6 scenario d for
> the exact order). On **any** `pipeline_step_index` / `repset_pipeline_step_index`
> change the corresponding `*_step_completion_counter` resets to 0, so a step's
> `every_n` parity never leaks across step transitions (finding fix).

#### `failure_rules`  → `failure_responses`
`failure_rules`: `id`, `user_id`, `settings_id (unique) references
progression_settings(id) on delete cascade`, `condition_below_target boolean
default true`, `condition_missed_sets integer`, `condition_missed_reps integer`,
timestamps.

`failure_responses` (ordered chain): `id`, `user_id`,
`failure_rule_id references failure_rules(id) on delete cascade`,
`position` (0-based), `response_type` check in (repeat, deload_lb, deload_pct,
deload_reps, drop_set), `repeat_limit integer` (null = indefinite),
`amount numeric`, timestamps; `unique (failure_rule_id, position)`
**deferrable initially deferred**.

> **Failure chain cursor [blocker fix].** Two runtime values on
> `progression_state` drive the chain deterministically:
> - `current_failure_response_index` — cursor into `failure_responses.position`
>   (which response is active).
> - `failure_counter` — number of `repeat`s taken **within the current
>   response**.
>
> Evaluation (documented in §6 scenario i):
> 1. On a failed qualifying entry, look at the response at
>    `current_failure_response_index`.
> 2. If it is `repeat` and (`repeat_limit` is null OR `failure_counter <
>    repeat_limit`): hold the weight, increment `failure_counter`, re-prescribe.
> 3. Otherwise (repeat exhausted, or a non-repeat response): apply the response
>    (deload_lb/pct/reps or drop_set) to `current_weight` /
>    `progression_entry_state`, write an audit row, advance
>    `current_failure_response_index` to the next response, and reset
>    `failure_counter` to 0. If there is no next response, the chain holds at the
>    last response.
> 4. On a **fully successful** qualifying entry (all sets×reps met), reset **both**
>    `failure_counter` and `current_failure_response_index` to 0 and resume the
>    progression pipeline.
>
> This makes arbitrary-length chains representable, e.g.
> `[repeat(3), deload_pct(10), repeat(3), deload_lb(5)]`.
>
> "Repeat indefinitely" = one `repeat` row, `repeat_limit` null. "Repeat up to 3
> then deload 10%" = `[{repeat, repeat_limit:3}, {deload_pct, amount:10}]`.

#### `progression_state`  (the shared working-**weight** line)
**Keyed `unique (routine_id, exercise_id)` — NOT per workout_entry.** This is the
whole mechanism for spec O-5a's *weight* clause. It holds **only** weight-line
state; rep/set live state lives in `progression_entry_state` (below).

| column | type | notes |
|---|---|---|
| `id` | `uuid` PK | |
| `user_id` | `uuid not null` | |
| `routine_id` | `uuid not null references routines(id) on delete cascade` | |
| `exercise_id` | `uuid not null references exercises(id) on delete restrict` | restrict is safe (account deletion handled via deferred FK; see FK note) |
| `current_weight` | `numeric` | the shared climbing working weight, **plate-rounded** (null for unloaded) |
| `target_line_weight` | `numeric` | **new:** the *ideal un-rounded* running line, advanced by pure step math; `current_weight` is its plate-rounded realization. Decouples the ideal line from plate reality so consolidation is reconstructable |
| `pipeline_step_index` | `integer not null default 0` | current **weight** step within resolved pipeline |
| `step_completion_counter` | `integer not null default 0` | drives weight-step `every_n`; resets to 0 on `pipeline_step_index` change |
| `failure_counter` | `integer not null default 0` | repeats within the current failure response |
| `current_failure_response_index` | `integer not null default 0` | **new:** cursor into the failure-response chain |
| `consolidation_counter` | `integer not null default 0` | gap-workout holds remaining (§6) |
| `progression_mode` | `text not null default 'weight'` check in (weight, reps_fallback) | **new:** ceiling auto-switch state (§7) |
| `weight_frozen` | `boolean not null default false` | **new:** set when computed weight exceeds the location's loadable max; gates the ceiling behavior |
| `last_session_entry_id` | `uuid` null `references session_entries(id) on delete set null` | provenance |
| `created_at`/`updated_at` | `timestamptz` | |

- `unique (routine_id, exercise_id)`. Index `(user_id)`.

> **Ceiling auto-switch [major finding].** When the engine computes a next weight
> that exceeds the active location's loadable max (per `loading_style` and the
> §7 ceiling sources), it sets `weight_frozen = true`. The resolved
> `ceiling_behavior` (entry override → equipment_preferences) then decides:
> - `hold_warn` → hold `current_weight`, surface a warning; `progression_mode`
>   stays `'weight'`.
> - `auto_switch_reps` → set `progression_mode = 'reps_fallback'` and write a
>   `cap_reached` (with `summary='ceiling auto-switch'`) audit row. While in
>   `reps_fallback`, the engine **freezes the weight dimension** and drives the
>   resolved pipeline's **rep/set** steps against `progression_entry_state`
>   (the same per-entry rep/set ladder the entry already declares; no separate
>   fallback pipeline is required). If equipment later grows (a bigger bell /
>   more plates), the engine may clear `weight_frozen`/`progression_mode` back to
>   `'weight'`. The flags make "this lift has hit its ceiling and is now
>   progressing reps" durable and auditable rather than re-derived every session.

#### `progression_entry_state`  (per-entry rep/set live line) — **NEW TABLE**
**Keyed `unique (routine_id, workout_entry_id)`.** This is the *rep/set* half of
the O-5a split: each workout-entry keeps its **own** rep/set ladder while sharing
the `progression_state` weight line for its exercise. So squat-in-A (5×5
straight) and squat-in-B (3×8–12 double) each have their own row here but read
the **one** `progression_state(routine, squat)` weight.

| column | type | notes |
|---|---|---|
| `id` | `uuid` PK | |
| `user_id` | `uuid not null` | |
| `routine_id` | `uuid not null references routines(id) on delete cascade` | |
| `workout_entry_id` | `uuid not null references workout_entries(id) on delete cascade` | the per-entry key |
| `current_rep_target` | `integer` | live current reps/set (straight) |
| `current_rep_range_low` / `current_rep_range_high` | `integer` | live double-progression range |
| `current_set_count` | `integer` | live current set count |
| `repset_pipeline_step_index` | `integer not null default 0` | current **rep/set** step within resolved pipeline |
| `repset_step_completion_counter` | `integer not null default 0` | drives rep/set-step `every_n`; resets to 0 on step-index change |
| `last_session_entry_id` | `uuid` null `references session_entries(id) on delete set null` | provenance |
| `created_at`/`updated_at` | `timestamptz` | |

- `unique (routine_id, workout_entry_id)`. Indexes `(user_id)`,
  `(routine_id, workout_entry_id)`.

> The `routine_id` is carried (not just `workout_entry_id`) so the per-entry
> ladder is scoped to the routine that owns the shared weight line, keeping the
> two state tables co-keyed on `routine_id` and surviving the case where the same
> workout/entry is reused across routines later.

#### `progression_state` ↔ `progression_entry_state` resolution (read path)
At prescribe time for a `workout_entry`:
1. Resolve the **weight** from `progression_state(routine_id, entry.exercise_id)`
   (`current_weight`, respecting `weight_frozen`/`progression_mode`).
2. Resolve the **reps/sets** from
   `progression_entry_state(routine_id, entry.id)`.
3. Resolve **knobs** (warmup/rest/consolidation) and the **pipeline / failure
   rule** via the `progression_settings` scope chain (exercise → workout →
   routine), whole-object most-specific-wins for the pipeline (see §6 scenario h).

### 3.6 Sessions & logs (immutable, user-owned)

#### `sessions`
`status` in (in_progress, completed, abandoned). Once `completed` the row **and
all its children** are read-only, enforced by immutability triggers. One
carve-out (migration 9996): the owner may hard-**DELETE** a whole session
(History → Delete) — the cascade removes its children, and progression already
applied is not rolled back. What stays forbidden is post-hoc *editing* of a
completed session or its children.

| column | type | notes |
|---|---|---|
| `id` | `uuid` PK | |
| `user_id` | `uuid not null` | |
| `routine_id` | `uuid` null `references routines(id) on delete set null` | |
| `location_id` | `uuid` null `references locations(id) on delete set null` | rounding/plate/ceiling context |
| `performed_on` | `date not null default current_date` | the gym day |
| `started_at` / `completed_at` | `timestamptz` | |
| `status` | `text not null default 'in_progress'` check in (in_progress, completed, abandoned) | |
| `notes` | `text` | |
| `created_at`/`updated_at` | `timestamptz` | |

- Indexes: `(user_id, performed_on desc)`, `(routine_id)`, partial
  `(user_id) where status='in_progress'` (resume).
- Immutability: `prevent_completed_session_mutation` rejects **update** of a
  `completed` session; **delete** is allowed for any status (owner-scoped by
  RLS; migration 9996) and cascades to the children.

#### `session_entries`  (prescription snapshot)
Snapshots the prescription so later template edits don't rewrite history.

| column | type | notes |
|---|---|---|
| `id` | `uuid` PK | |
| `user_id` | `uuid not null` | |
| `session_id` | `uuid not null references sessions(id) on delete cascade` | |
| `workout_id` | `uuid` null `references workouts(id) on delete set null` | |
| `workout_entry_id` | `uuid` null `references workout_entries(id) on delete set null` | |
| `exercise_id` | `uuid not null references exercises(id) on delete restrict` | |
| `position` | `integer not null` | |
| `planned_sets` | `integer` | snapshot |
| `planned_rep_scheme` | `text` check in (straight, double, rpe) | snapshot |
| `planned_rep_target` / `planned_rep_low` / `planned_rep_high` | `integer` | snapshot |
| `planned_weight` | `numeric` | shared weight at the time (from `progression_state`) |
| `planned_rest_seconds` | `integer` | resolved (inherited) rest snapshot |
| `last_set_amrap` | `boolean not null default false` | snapshot |
| `was_failure` | `boolean not null default false` | engine verdict |
| `was_consolidation_hold` | `boolean not null default false` | gap-workout hold |
| `created_at`/`updated_at` | `timestamptz` | |

- Indexes: `(session_id, position)`, `(exercise_id)`, `(workout_entry_id)`.
- Immutability: `prevent_completed_child_mutation` rejects update/delete once the
  parent session is `completed` (reference-detach FK writes — `workout_id` /
  `workout_entry_id` going null, all else untouched — excepted; migration 9995).

#### `set_logs`  (planned vs actual; atomic analytics unit)
The views read `set_logs` joined to `session_entries.exercise_id` and
`sessions.performed_on`.

| column | type | notes |
|---|---|---|
| `id` | `uuid` PK | |
| `user_id` | `uuid not null` | |
| `session_entry_id` | `uuid not null references session_entries(id) on delete cascade` | |
| `set_index` | `integer not null` check `> 0` | 1-based within entry |
| `is_warmup` | `boolean not null default false` | warmups never count for analytics |
| `is_completed` | `boolean not null default true` | a "hard set" = completed working set |
| `planned_reps` | `integer` | |
| `actual_reps` | `integer` | |
| `planned_weight` | `numeric` | |
| `actual_weight` | `numeric` | plate-rounded reality |
| `rest_taken_seconds` | `integer` | |
| `is_amrap` | `boolean not null default false` | |
| `amrap_reps` | `integer` | |
| `rpe` | `numeric(3,1)` | |
| `completed_at` | `timestamptz` | |
| `video_id` | `uuid` null `references videos(id) on delete set null` | form-video link |
| `created_at`/`updated_at` | `timestamptz` | |

- Constraints: `unique (session_entry_id, set_index)`.
- Indexes: `(session_entry_id, set_index)`, partial `(user_id) where is_warmup = false`,
  `(user_id, completed_at)`.
- est-1RM (Epley) computed in views from `actual_weight`/`actual_reps` of working
  sets only.
- Immutability: `prevent_completed_child_mutation` rejects update/delete once the
  owning session is `completed` (the `video_id`-detach write from a video
  delete/purge excepted — migration 9995; without it `purge_expired_media()`
  aborts on the first expired clip attached to completed history).

#### `session_overrides`  (in-gym edits → optional save-to-template)
| column | type | notes |
|---|---|---|
| `id` | `uuid` PK | |
| `user_id` | `uuid not null` | |
| `session_entry_id` | `uuid not null references session_entries(id) on delete cascade` | |
| `workout_entry_id` | `uuid` null `references workout_entries(id) on delete set null` | persist target |
| `field` | `text not null` check in (rest_seconds, reps, sets, weight) | |
| `old_value` / `new_value` | `numeric` | self-describing audit |
| `persisted_to_template` | `boolean not null default false` | true after "save to workout" |
| `persisted_at` | `timestamptz` | |
| `created_at`/`updated_at` | `timestamptz` | |

- Indexes: `(session_entry_id)`, partial `(workout_entry_id) where persisted_to_template`.
- Immutability: `prevent_completed_child_mutation` rejects update/delete once the
  owning session is `completed` (`workout_entry_id`-detach writes excepted —
  migration 9995).

#### `audit_log`  (append-only)
| column | type | notes |
|---|---|---|
| `id` | `uuid` PK | |
| `user_id` | `uuid not null` | |
| `action` | `text not null` check in (template_edit, progression_adjust, override_saved, deload, gap_workout, failure_repeat, step_advance, cap_reached, reset) | |
| `entity_type` | `text not null` | e.g. workout_entry, progression_state |
| `entity_id` | `uuid` | |
| `routine_id` / `exercise_id` / `session_id` | `uuid` null `... on delete set null` | context |
| `before` / `after` | `jsonb` | generic field snapshots (e.g. consolidation: `{desired, forced}`) |
| `summary` | `text` | "Squat +5 → 185" |
| `created_at` | `timestamptz default now()` | no `updated_at` — append-only |

- Insert-only: `prevent_audit_mutation` trigger rejects update/delete; only
  select + insert policies granted. Exception (migration 9996): the FK
  `on delete set null` write that fires when a referenced
  session/routine/exercise is deleted is recognized (context ids going null,
  all other columns untouched) and allowed through.
- Indexes: `(user_id, created_at desc)`, `(entity_type, entity_id)`,
  `(routine_id, exercise_id)`.

### 3.7 Profile & settings (user-owned singletons)

#### `user_profiles`  (canonical 1-row-per-user profile)

| column | type | notes |
|---|---|---|
| `user_id` | `uuid` **PK** `references auth.users(id) on delete cascade` | |
| `display_name` | `text` | |
| `sex` | `text not null default 'male'` check in (male, female) | strength standards (§9) |
| `birthdate` | `date` | age derived, never stored; retained for display (unused in standards lookup, §9 note) |
| `height_in` | `numeric(5,2)` check 24..108 | retained for display (unused in standards lookup) |
| `bodyweight_lb` | `numeric(6,2)` check 30..1500 | current canonical bodyweight (§9 join) |
| `bodyweight_updated_at` | `timestamptz` | staleness warning before percentile |
| `unit_system` | `text not null default 'imperial'` check in (imperial, metric) | display-only |
| `default_photo_category` | `text not null default 'front'` check in (front, side, back, custom) | |
| `reminders_enabled` | `boolean not null default true` | master nudge switch |
| `show_post_workout_nudges` | `boolean not null default true` | §12 surface toggle |
| `video_retention_days` | `integer not null default 30` check `> 0` | paid-tier hook; `videos.expires_at` reads this |
| `photo_retention_days` | `integer not null default 365` check `> 0` | paid-tier hook |
| `created_at`/`updated_at` | `timestamptz` | |

#### `chart_preferences`  (radar/chart UI state)
`user_id` PK; `volume_metric` (hard_sets/tonnage/total_reps), `time_window`
(7d/4wk/12wk/all), `radar_mode` (volume/strength), `weakest_view`
(relative/standards), `count_secondary boolean default true`, timestamps.
Owner-only RLS.

#### `app_preferences`  (flexible kv for "editable later")
`id`, `user_id`, `key text` (len 1..128), `value jsonb default 'true'`,
timestamps; `unique (user_id, key)`; index `(user_id)`. Absorbs feature flags /
UI toggles without migrations.

### 3.8 Media, measurements & reminders (user-owned)

#### `videos`  (form-video scaffold, §10)
`id`, `user_id`, `set_log_id` null `references set_logs(id) on delete set null`,
`storage_path text not null unique` (bucket `form-videos`), `duration_seconds
numeric(5,2)` check `> 0 and <= 30`, `mime_type`, `size_bytes bigint check >=0`,
`created_at`, **`updated_at`** (added so the shared `set_updated_at()` trigger
applies and the paid tier can extend `expires_at` via normal updates),
`expires_at timestamptz not null default now()+30d` check `> created_at`.
Indexes: `(user_id)`, partial `(set_log_id) where set_log_id is not null`,
`(expires_at)`. `expires_at` is a *plain* column (not generated) so the paid tier
can extend per-row.

> Note: `set_logs.video_id` and `videos.set_log_id` are reciprocal nullable
> links; the canonical association is `videos.set_log_id`. `set_logs.video_id`
> is a convenience denormalization for "the clip shown for this set" and is kept
> nullable + `on delete set null`.

#### `progress_photos`  (§12)
`id`, `user_id`, `storage_path text not null unique` (bucket `progress-photos`),
`category text not null` check in (front, side, back, custom), `custom_label
text` check `(category='custom') = (custom_label is not null)`, `taken_on date
not null default current_date`, `mime_type`, `size_bytes`, `created_at`,
**`updated_at`** (added — same reason as `videos`), `expires_at timestamptz not
null default now()+365d` check `> created_at`. Indexes: `(user_id)`,
`(user_id, category, taken_on desc)`, `(expires_at)`.

#### `body_measurements`  (typed columns + jsonb tail, §12)
One row per user per day (`unique (user_id, taken_on)`). Typed columns:
`bodyweight`, `body_fat_pct`, `neck`, `shoulders`, `chest`, `waist`, `hips`,
`arm_l`/`arm_r`, `thigh_l`/`thigh_r`, `calf_l`/`calf_r`, `forearm_l`/`forearm_r`
(all `numeric` with sanity checks), plus `extra jsonb not null default '{}'`
(check is object) for user-added metrics, `note text`, timestamps. Mutable
(user can fix typos). Index: `(user_id, taken_on desc)`. Feeds §9 bodyweight
and the #8 history.

#### `reminders`  (§12)
`id`, `user_id`, `type text not null` check in (weigh_in, measurements, photos),
`cadence_days integer not null` check `> 0` (seed 7/14/28), `last_done_at
timestamptz`, `enabled boolean default true`, `snooze_until timestamptz`,
timestamps; `unique (user_id, type)`; index `(user_id)`. Due-state is **derived**
via the `reminders_due` view (never stored). An `after insert` trigger on
`body_measurements`/`progress_photos` bumps `last_done_at`.

---

## 4. RLS strategy

- **`enable row level security` (+ `force`) on every user-owned table** — now
  **including** `exercises` and `exercise_muscles` (the force statements were
  added so the invariant holds for the nullable-user library too).
- **User-owned tables**: four policies per table, each body `user_id =
  auth.uid()` (writes also `with check (user_id = auth.uid())`). `user_id`
  columns default to `auth.uid()` so inserts need not pass it. Every `create
  policy` is preceded by `drop policy if exists` (re-runnable).
- **`exercises` / `exercise_muscles`**: select additionally exposes global rows
  (`user_id is null`, or parent-exercise-is-global for the mapping); writes
  remain owner-only.
- **Global reference** (`muscle_groups`, `strength_standards`): RLS enabled,
  single `for select using (true)` policy; writes are service-role only (no
  write policy).
- **Views** (`reminders_due`, all `v_*` analytics views): created with
  `security_invoker = true` so they run under the caller's RLS and inherit
  `set_logs.user_id = auth.uid()` scoping — no separate view policies needed.
- **Storage** (`form-videos`, `progress-photos` buckets, both private): RLS on
  `storage.objects`, owner = first path segment
  (`(storage.foldername(name))[1] = auth.uid()::text`), four policies per bucket,
  scoped `to authenticated`. Path layout
  `form-videos/{user_id}/{video_id}.ext`,
  `progress-photos/{user_id}/{category}/{photo_id}.ext`.
- **Immutability triggers**: `prevent_completed_session_mutation` (no
  **update** of `completed` sessions; owner **delete** of a whole session is
  allowed — migration 9996) **plus** `prevent_completed_child_mutation`
  on `session_entries`, `set_logs`, `session_overrides` (no update/delete once
  the owning session is `completed` — this closes the post-hoc history-rewrite
  hole that the parent-only guard left open; a session-delete cascade passes
  because the parent row is already gone when the children are checked, and
  reference-detach FK writes — `video_id`/`workout_id`/`workout_entry_id` going
  null with all else untouched — are allowed so video purge and template
  deletes don't abort on completed history, migration 9995);
  `prevent_audit_mutation` (audit is insert-only, save for FK set-null writes
  from deletes of referenced rows — 9996); `assert_equipment_owner` (no
  cross-user reparenting of barbells/plates/dumbbells).
- **SECURITY DEFINER RPCs** (`set_default_location`, `set_default_barbell`,
  `purge_expired_media`) run as the (bypassrls) owner, so FORCE RLS does not
  constrain them; their `where user_id = auth.uid()` predicates are the real
  guard. `execute` is revoked from `public` and granted explicitly to
  `authenticated` (purge is granted to `service_role` only).

---

## 5. Computed views (derived, never stored)

All analytics are views over `set_logs` + `session_entries` + `sessions` +
`exercise_muscles`. No derived data is persisted (sessions stay immutable; this
avoids drift). All views are `security_invoker = true`.

- **`v_set_log_metrics`** — base per-set metrics for **working sets only**
  (`is_warmup = false`): joins `set_logs → session_entries → sessions` for
  `exercise_id`, `workout_id`, `performed_on`,
  `week_start = date_trunc('week', performed_on)`. Emits
  `is_hard_set = (not is_warmup and is_completed)`,
  `tonnage_lb = actual_weight * actual_reps`,
  `est_1rm_lb = actual_weight * (1 + actual_reps/30.0)` when `actual_weight > 0`.
- **`v_muscle_volume_weekly`** — explodes each working set across
  `exercise_muscles` weighted 1.0/0.5; one row per (user, muscle_group, week)
  with `hard_sets` (weighted), `hard_sets_primary`, `tonnage_lb`, `total_reps`.
  Powers the radar (§8) under the 7d/4wk/12wk/all windows.
- **`v_exercise_e1rm`** — best est-1RM per (user, exercise): all-time +
  12-week-windowed.
- **`v_muscle_strength`** — per-muscle strength score = best est-1RM among
  exercises whose **primary** muscle = that group, loaded lifts only (§9 [M7]).
- **`v_strength_vs_standards`** — main lifts only (`exercises.lift_key`): joins
  the user's best e1RM against the `strength_standards` bracket for their sex +
  bodyweight, returning the coarse band (beginner→elite) **and the four bounding
  thresholds + the user's bodyweight** so the UI can interpolate a percentile-
  like position (M6).
- **`v_frequency`** *(new — M5 "most often")* — per (user, dimension, key,
  time_window) completed-session counts for **workouts**, **exercises**, and
  **muscles**, across the 7d/4wk/12wk/all windows, mirroring the §8 toggles.
  Built from completed sessions' `session_entries` (workout_id, exercise_id) and
  `exercise_muscles` (muscles).
- **`reminders_due`** — each reminder + computed `is_due` / `due_since` using
  `last_done_at + cadence_days` vs `now()`, honoring `enabled`/`snooze_until`.

Promotion to materialized views (`v_muscle_volume_weekly`, `v_exercise_e1rm`)
refreshed on session-commit is deferred until measured.

---

## 6. Worked walkthrough — encoding each progression scenario

Every scenario is a `progression_pipeline` (bound to a `progression_settings`
scope) of ordered `progression_steps`. **Weight** steps read/advance the shared
`progression_state(routine_id, exercise_id)` row; **reps/sets** steps
read/advance the per-entry `progression_entry_state(routine_id,
workout_entry_id)` row. This split is the whole point of the O-5a fix: weight is
shared, rep/set ladders are per-entry.

**Qualifying-completion dedupe (applies to every scenario).** A given
`progression_state(routine, exercise)` weight line advances **at most once per
session (gym day)**, even if the same exercise appears in two head workouts on
the same day (e.g. squat in the cycling rotation *and* in an always-on rotation).
The engine picks one deterministic driving entry per (session, exercise) — the
**last completed, heaviest** working entry — to advance the shared weight and the
weight cursor/counters. The **rep/set** ladders, being per-entry, advance once
per entry (so both squat entries advance their own reps/sets). On
`sessions.status='completed'`, the engine: (1) for each (session, exercise),
applies one weight advance; (2) for each completed entry, applies its rep/set
advance; (3) advances every rotation pointer; (4) freezes the session.

**StrongLifts linear — +5 squat every workout.** One step:
`{dimension:weight, weight_mode:fixed, amount:5, every_n:1, cap_type:none,
on_cap:stop}`. On the qualifying squat completion (whether the driving entry came
from Workout A or B), the engine advances `progression_state.target_line_weight`
by 5 (ideal line), plate-rounds it into `current_weight`, writes both back.
Because A and B share that row, the squat line is continuous.

**OHP +5 each time until 150, then stop [O-4].** One step:
`{weight, fixed, amount:5, cap_type:target_weight, cap_value:150, on_cap:stop}`.
The cap is read against `target_line_weight`; when it reaches 150 the step's
`on_cap=stop` freezes progression.

**Bench +5 every 2nd time.** One step:
`{weight, fixed, amount:5, every_n:2}`. `progression_state.step_completion_counter`
increments on each qualifying completion; the +5 applies when
`(step_completion_counter + 1) % 2 == 0`. A failed/held session does **not**
increment the counter (only qualifying completions do), so a missed bench never
ticks the "every 2nd" parity. On any weight-step transition the counter resets to
0 so parity never leaks between steps.

**Double progression 3×8–12 [O-7].** Two steps, evaluated with the cursor split:
1. `{reps, applies_to:all_sets, amount:1, cap_type:rep_count, cap_value:12,
   on_cap:next_step}` — a **reps** step, advances
   `progression_entry_state.current_rep_target` 8→12 (this entry only; squat-in-A
   stays 5×5).
2. `{weight, fixed, amount:5, on_cap:loop, loop_target_position:0,
   reset:reps_to_base}` — a **weight** step. **Evaluation order at the cap is
   explicit:** when step 1 reaches rep_count=12 it advances
   `repset_pipeline_step_index` to step 2 (`on_cap:next_step`). On the next
   qualifying completion the engine, on step 2: (a) applies the +5 to
   `progression_state.target_line_weight`/`current_weight`; (b) applies
   `reset:reps_to_base`, setting `current_rep_target` back to the entry's
   `rep_range_low` (8); (c) follows `on_cap:loop` to `loop_target_position=0`,
   returning `repset_pipeline_step_index` to step 1. Putting `reset` on the
   **weight** step (not the reps step) guarantees the reps reset happens
   *together with* the +5, so the next 8→12 ramp runs at the new heavier weight.
   `loop_target_position` makes "loop" explicit (no implicit "back to 0"). The
   degenerate-loop check rejects a `loop` step with no reset and no cap.

**Shoulders: +1 rep/set until X, then add sets [Q-B].** Two steps:
1. `{reps, all_sets, amount:1, cap_type:rep_count, cap_value:X, on_cap:next_step,
   reset:none}` — drives `progression_entry_state.current_rep_target` (8→X).
2. `{sets, amount:1, cap_type:set_count, cap_value:Y, reset:reps_to_base}`
   (default reset-reps-to-base per §13) — drives
   `progression_entry_state.current_set_count`, **and resets reps to base
   atomically with each +1 set**. Because the shoulder workout is a length-1
   rotation (always-on), it appears every gym day and so progresses every session.
   Both steps are rep/set-dimension, so they live entirely in the per-entry state;
   no other entry using the same exercise is affected.

   > **Reset placement (engine-verified correction).** `reset:reps_to_base` must
   > ride on the **sets** step, not the reps step. The engine applies `reset` when
   > a step *fires* (atomic with its effect — mirroring how double progression
   > resets reps on its weight step). Putting the reset on the climbing reps step
   > would reset reps to base on *every* reps completion, so reps could never
   > climb; putting it on the sets step yields the clean repeating ladder
   > `3×8…3×12, 4×8…4×12, 5×8…` with no regressed/dip session.

**+1 rep to last set only.** One step:
`{reps, applies_to:last_set, amount:1}` → advances only the last working set's
reps in the per-entry prescription.

**Last set to failure (AMRAP).** Not a pipeline step — the
`workout_entries.last_set_amrap = true` flag; the AMRAP result is captured in
`set_logs.amrap_reps` on the last set.

**RPE scheme (prescription-only).** `rep_scheme='rpe'` with `target_rpe` is a
prescription, **not** an auto-progression dimension — `progression_steps.dimension`
is `weight|reps|sets` only and there is no `current_target_rpe` in state. RPE
entries are logged (set-level `rpe`) and the lifter picks weight manually; no
pipeline drives them. (An autoregulation step type can be added later if RPE
progression is ever wanted; documented here so the option isn't mistaken for a
broken progression path.)

**Failure: repeat indefinitely (120×5×5).** `failure_rules` with
`condition_below_target = true`; one `failure_responses` row `{repeat,
repeat_limit:null}`. On a failed entry: the active response (cursor
`current_failure_response_index=0`) is `repeat` with null limit → hold
`current_weight`, increment `failure_counter`, re-prescribe the same load,
write a `failure_repeat` audit row. On the eventual fully-successful entry, reset
both `failure_counter` and `current_failure_response_index` to 0 and resume the
pipeline.

**Failure: repeat up to 3 then deload 10%.** Two `failure_responses`:
`[{repeat, repeat_limit:3}, {deload_pct, amount:10}]`. While the cursor sits on
response 0 (`repeat`, limit 3) and `failure_counter < 3`, hold and increment
`failure_counter`. On the failure where `failure_counter` would reach the limit,
apply response 1 (`deload_pct 10`) to `current_weight`/`target_line_weight`,
write a `deload` audit row, advance `current_failure_response_index` to 1, reset
`failure_counter` to 0. A longer chain (e.g.
`[repeat(3), deload_pct(10), repeat(3), deload_lb(5)]`) is now representable
because the cursor tracks chain position. On a fully successful entry, reset both
the counter and the cursor to 0.

**Gap-workout / consolidation [§6].** Detection uses the **ideal line**: after a
weight step, the engine computes `next_ideal = target_line_weight + step.amount`,
plate-rounds it to `next_rounded`, and consolidation fires when
`next_rounded - previous current_weight > step.amount` (the forced jump exceeds
the desired increment) **and** the entry has `consolidation_enabled = true`. It
then sets `progression_state.consolidation_counter = consolidation_sessions`,
records `{desired: step.amount, forced: next_rounded - previous}` in the
`gap_workout` audit row's `before/after` jsonb, and writes `next_rounded` to
`current_weight` while `target_line_weight` keeps the ideal value. While
`consolidation_counter > 0` the next sessions re-prescribe the same rounded
weight (`session_entries.was_consolidation_hold = true`), decrementing the
counter; at 0, normal progression resumes from the ideal line. Because the ideal
line (`target_line_weight`) is stored separately from the rounded reality
(`current_weight`), the trigger is fully reconstructable and "holding for an
oversized jump" is distinguishable in the audit log from any other hold.

**Equipment ceiling / dumbbell snap [§7, scenario j].** When the engine's next
computed weight exceeds the active location's loadable max for the exercise's
`loading_style` (barbell/plate_loaded: bar + max plate sum, e.g. 320 lb;
dumbbell: max owned bell, e.g. 25 lb — read from `dumbbells`), it sets
`progression_state.weight_frozen = true`. The resolved `ceiling_behavior`
(`workout_entries.ceiling_behavior_override` → `equipment_preferences.ceiling_behavior`)
then routes: `hold_warn` holds and warns (`progression_mode` stays `'weight'`);
`auto_switch_reps` sets `progression_mode='reps_fallback'`, writes a `cap_reached`
audit row, and from then on freezes weight and drives the per-entry rep/set steps
in `progression_entry_state`. Dumbbell discrete snap (15/20/25) is a pure
`solvePlates`/snap concern over the `dumbbells` rows; the ceiling cap at 25 is the
max-bell read. If equipment grows later, the engine may clear the flags.

**Scope inheritance ("+5 to the whole workout, but bench +5 every 2nd").**
A `progression_settings`/pipeline at `scope='workout'` sets the default +5
pipeline; a second at `scope='exercise'` (bound to the bench `workout_entry`)
overrides with `every_n:2`. **Resolution is whole-object most-specific-wins for
the pipeline/failure rule** (exercise → workout → routine): the engine selects
the single most-specific *pipeline*, it does **not** field-merge step lists. So
the bench exercise-scope override must **restate the full pipeline**
(the +5 step with `every_n:2`), not a partial delta. The **knobs**
(warmup/rest/consolidation) on `progression_settings` *do* `coalesce`
field-by-field across the three scopes. This selection-vs-merge distinction is
explicit so implementers don't expect `coalesce` semantics for pipelines. (If
field-level pipeline inheritance is ever wanted, that needs a different
step-override model.)

**Session completion advances the schedule.** On `sessions.status = 'completed'`:
apply the per-(session, exercise) weight advance and per-entry rep/set advances
(above), then for **every** rotation in the active routine
`current_index = (current_index + 1) mod count(rotation_workouts)`; the session
becomes immutable. The next gym day = union over rotations of the
`rotation_workouts` row where `position = current_index`.

---

## 7. FK on-delete & account-deletion (data-integrity note)

Custom `exercises` and `workouts` are user-owned (`user_id … on delete cascade`).
When `auth.users` deletes a user, Postgres runs all dependent cascades in one
statement with no guaranteed row order. A plain `on delete restrict` from a
still-cascading child to a still-cascading custom parent would abort the whole
deletion (RESTRICT is not deferrable). To honor the `auth.users on delete cascade`
contract and right-to-delete:

- `rotation_workouts.workout_id` → **`on delete cascade`** (the model prefers
  soft-delete via `archived_at`; a real hard-delete of a workout should take its
  rotation memberships with it).
- `workout_entries.exercise_id`, `session_entries.exercise_id`,
  `progression_state.exercise_id` → **`references exercises(id) on delete no
  action deferrable initially deferred`**. RESTRICT-like protection against
  *accidental* exercise deletion is preserved during normal operation, but the
  check is deferred to commit, by which point a full account cascade has already
  removed the referencing children — so account deletion succeeds. (Referencing a
  global seed exercise is unaffected; seeds are never user-deleted.)

---

This data model resolves all blockers and majors from the adversarial review:
the O-5a weight/rep-set split (`progression_state` + `progression_entry_state`),
the failure-chain cursor, the ideal-line/consolidation field, the ceiling
auto-switch state, the explicit `loop_target_position` + per-step counter resets,
completed-session child immutability, the `updated_at` columns on media tables,
deferred FKs for account deletion, FORCE RLS on the library tables, the corrected
`strength_standards` unique key, deferred position uniques, RPC grants, the
`v_frequency` view, and prose for warmup-volume basis, dumbbell ceiling, RPE,
and the percentile/age-height clarification.
