# SupaStrength — Product & Technical Spec (living document)

Status: **PLANNING** (no code yet). This doc is the source of truth for design
decisions. Tags: ✅ **LOCKED** · 🟡 **PROPOSED** (pending confirm) · ❓ **OPEN**.

Last updated: session 000 (2026-06-29).

---

## 1. Vision

Personalized workout tracker. **Web app first** (used on phone in mobile view),
offline support second, native Android third. Single primary user. Headline =
a **highly flexible progressive-overload engine** with a routine scheduler that
mixes a cycling sequence of workouts (StrongLifts A/B…) with always-on workouts
(e.g. a "shoulder blowup" every session).

Priority: (1) workouts + progression engine, (2) plate calculator,
(3) equipment/plate inventory, (4) muscle & frequency tracking, (5) strength /
weakest-area, (6) form-video capture (scaffold only), (7) external sync,
(8) progress photos + measurement reminders.

---

## 2. Foundations

- ✅ **Build phasing:** Phase 1 = **online web** (responsive, PWA-capable).
  Phase 2 = **offline** (local-first + background sync). Phase 3 = **Android**
  (Capacitor wrap). Phase 1 must not architect *out* Phase 2 — data access goes
  through a clean layer that a local store can back later.
- ✅ **Stack:** **Vite + React + TypeScript** SPA, auto-deployed on **Vercel**;
  **Supabase** (Postgres + Auth + Storage + RLS) for data/auth/files. PWA via
  `vite-plugin-pwa` (enables Phase-2 offline + home-screen install). Server-side
  needs (Fitbit OAuth token exchange, webhooks) run as **Vercel serverless
  functions** or **Supabase Edge Functions** — the SPA holds no secrets.
  Radar/charts via a React chart lib (Recharts or Chart.js).
- 🟡 **Single user, real auth** (Supabase Auth + RLS) so multi-user is possible
  later without a rewrite.
- ✅ **Units: lbs** (no kg toggle v1).
- ✅ **Plates:** user owns down to **2.5 lb** plates; generator must also support
  **1.25 lb micro-plates** (so +2.5 lb total increments become possible if added).
- ❓ **Phone OS** (iPhone vs Android) — not blocking online web v1; confirm
  before building form-video (#6).

---

## 3. Domain model (the spine)

Four layers:

1. **Exercise** — library definition (e.g. "Barbell Back Squat"): default
   bar/equipment, primary/secondary muscles, movement type, loading style.
   Seeded from a large open dataset.
2. **Workout** — reusable template / a "day" (e.g. "Workout A", "Shoulder
   Blowup"): ordered list of **workout-entries**, each =
   `{exercise, sets, rep-scheme, rest, progression pipeline, failure rule,
   warmup policy, last_set_amrap?}`.
3. **Routine** — the **schedule**, composed of one or more **rotations**
   (independent tracks). Each rotation = ordered list of workouts that advances
   one step per completed session.
   - Rotation 1 = `[A, B]` (cycles A→B→A…); Rotation 2 = `[Shoulder Blowup]`
     (length 1 → always on).
   - A **gym day** = current head of *every* rotation, combined.
   - Completing a session advances *every* rotation's pointer by one.
4. **Session (log)** — **immutable** record of what was performed on a date.

### Scheduling
- ✅ **Pointer-based, not calendar-based.** "Next time in the gym → next set of
  workouts." No catch-up / missed-day debt.
- 🟡 Optional calendar/target-days overlay for guidance & reminders only.

### Progression state
- ✅ **Working weight is shared per (routine, exercise)** — one continuous line
  across every workout in the routine that uses that exercise (squat in A and B
  climbs as one line). [O-5a]
- ✅ Rep-scheme / rep targets can differ per workout-entry while weight stays
  shared.
- ✅ Progression *advances per completed workout* (so a workout done every
  session — shoulders — progresses every session). [Q-B]

---

## 4. Progression engine — the unified model ✅

**Everything is data-driven and editable in-app. No code changes ever.**

**Scope / inheritance ✅** — every progression/failure/warmup/rest setting can be
set at three levels; the most specific wins:
`Routine default → Workout default → Exercise-entry override`.
So you can set a whole workout to "add 5 lb to everything" and still override
just the bench to "+5 every 2nd time." [user: "flexible and set per workout or
per exercise"]

**Common presets** (each is just a one-step pipeline; the ladder/chaining is
optional): [O-6b]
- **A** weight +X, keep reps/sets (e.g. row 3×8 → +5 lb, still 3×8).
- **B** reps +1 per set, keep weight (row 3×8 → 3×9).
- **C** add a set of X reps, keep weight (row 3×8 → 4×8).

### Progression = an ordered **pipeline of steps**

After a *qualifying* completion of an exercise, the engine applies the current
step. When a step's **cap** is reached, it transitions per **on-cap**.

A **step** =
```
{
  dimension:  weight | reps | sets
  applies_to: all_sets | last_set        # for the reps dimension
  mode:       fixed | pct_of_last | pct_of_target   # weight only
  amount:     e.g. +5 lb · +1 rep · +1 set · +2.5%
  every_n:    apply on every Nth completion (default 1)
  cap:        none | target_weight=V | rep_count=V | set_count=V
  on_cap:     stop | next_step | loop     # next_step/loop may reset a dimension
  reset:      none | reps_to_base | sets_to_base
}
```

All weight outputs pass through **plate/equipment-aware rounding** (§6).

**Everything you described encodes as a pipeline:**

| You want… | Pipeline |
|---|---|
| StrongLifts linear (+5 squat every workout) | `[weight +5 every1, cap none]` |
| OHP +5 each time **until 150 target**, then stop [O-4] | `[weight +5, cap target_weight=150, on_cap stop]` |
| Bench +5 **every 2nd** time | `[weight +5 every2]` |
| Double progression 3×8–12 [O-7] | `[reps +1 all_sets, cap rep_count=12, on_cap next_step reset reps_to_base] → [weight +5, on_cap loop]` |
| Shoulders: +1 rep/set until X, **then add sets** [Q-B] | `[reps +1 all_sets, cap rep_count=X, on_cap next_step] → [sets +1, cap set_count=Y]` |
| +1 rep to **last set** only | `[reps +1 last_set]` |
| Last set to failure | workout-entry flag `last_set_amrap=true` |

- **`pct_of_target`** = increment is a % of the target weight (constant absolute
  jump). **`pct_of_last`** = % of last performed weight. **Target** is a goal
  weight you set in-app (also the cap). [O-4]
- ❓ Minor: when rolling reps→sets (shoulders), reset reps to base or keep at
  cap? Default 🟡 = **reset reps to base** (repeating ladder).

### Failure handling ✅ (per workout-entry, all in-app)
- **Failure condition** is configurable. Default 🟡 = *any working set finished
  below its target reps*. [O-6]
- **Failure response** is configurable and **chainable**, choose any:
  - **Repeat** (hold weight, re-attempt next time until all reps×sets succeed —
    your 120×5×5 example). Default 🟡 = repeat indefinitely.
  - **Deload** X lb / X% / X reps / **drop a set**.
  - Chain: e.g. "repeat up to N times, *then* deload Y%."

### Warm-up sets ✅
- Auto-generate **only if** working load exceeds a threshold set in the
  workout's settings. Default 🟡 threshold basis = **working weight**
  (configurable to volume).
- ✅ Ramp = sensible default: empty bar → ~55% → 70% → 85% of work weight. [O-8]

### Rest timer + in-session edits ✅
- Pre-defined rest per workout-entry at build time.
- In-gym: change **rest, reps, sets, or weight** on the fly and tap **"save to
  workout"** to persist back to the template. [O-9]

### Audit log ✅
- Immutable history of: template edits, progression adjustments, in-session
  overrides saved back, deloads/gap-workouts. Sessions are immutable.

---

## 5. Exercise library & movement types ✅
- **HUGE** built-in library, all types: barbell, dumbbell, machine, cable,
  bodyweight, weighted bodyweight, assisted, timed/cardio.
- 🟡 Seed from an open dataset with muscle mappings (free-exercise-db / wger).

---

## 6. Plate calculator + rounding (features #2 / #3) ✅
- Honors the active location's **actual equipment** (bar weight + plate
  inventory in pairs); supports 2.5 lb and 1.25 lb micro-plates.
- "**Do the best you can**" — combine available plates to get closest to target;
  symmetric per-side loading. **Respects quantity** (can't use a plate twice if
  you own one pair).
- ✅ **Round up / round down is a user setting** (O-11), used when the exact
  target isn't loadable.
- ✅ **Flow** [P1]: enter target total → use the exercise's **default bar**
  (overridable) → show **plates per side**; if target isn't loadable, show the
  **closest achievable** per the round up/down setting.
- ✅ **Where** [P2]: both a **standalone tool** and **inline in logging** (tap a
  set → see how to load it).
- ✅ **Scope** [P3]: barbells + plate-loaded only (dumbbells = pick the bell).
- ✅ **"Gap workout" / consolidation:** when forced rounding makes the actual
  jump *larger* than the desired increment (e.g. plates only allow +10 but you
  wanted +5, round-up → +10), optionally **hold the new weight for an extra
  session** (repeat it across the next workout) before resuming progression, to
  soften the oversized jump. [O-11]
  - ✅ **Opt-in per workout/exercise** — only triggers if that workout/exercise
    is configured to consolidate. Setting: on/off + # consolidation sessions. [Q-C]

---

## 7. Equipment / locations (feature #3) ✅
- Single gym today; build the **multi-location framework**. A location has its
  own barbells (with weights), plate inventory (denomination × quantity/pairs),
  dumbbells, machines, etc. Drives plate calc + rounding.

### User's actual home-gym inventory (seed data) ✅
- **Plates — one pair of each:** 2.5, 5, 10, 15, 25, 35, 45 lb.
- **Dumbbells — fixed pairs:** 15, 20, 25 lb (no adjustable).
- **No machines/cable stacks** (just a power/weight rack), no bands/kettlebells.
- **Collars/clips ignored** (weight = 0).
- ❓ **E-bar:** E1 didn't list a barbell — assuming **one 45 lb Olympic bar**.
  Confirm (any EZ/trap/other bars?).

### Derived loadable math (sanity-check facts)
- Per side, subset sums of one-of-each {2.5…45} give **continuous 2.5 lb steps,
  0→137.5 lb**. With a 45 lb bar → **total loadable = 45→320 lb in 5 lb steps.**
  So every +5 lb jump is loadable up to 320; finer than 5 lb needs 1.25 micro
  plates; >320 lb isn't loadable with current plates.
- **Dumbbell lifts** snap to the discrete owned bells (15/20/25); a weight
  progression caps at 25 until more are bought.
- 🟡 **Equipment-ceiling behavior:** when a weight progression exceeds what's
  loadable (e.g. dumbbells past 25, barbell past 320), default = **hold + warn**;
  optionally auto-switch that lift to rep/set progression. (Confirm later.)

## 8. Muscle & frequency tracking (feature #4) ✅
- Uses seeded exercise→muscle map (primary/secondary).
- ✅ **Radar = 12 major groups** [M1]: chest, back, shoulders, biceps, triceps,
  quads, hamstrings, glutes, calves, core, traps, forearms.
- ✅ **Build all volume metrics** [M2], toggleable: **hard sets/muscle/week**
  (default primary), **tonnage** (sets×reps×weight), **total reps**.
- ✅ **Secondary-muscle weighting = 1.0 primary / 0.5 secondary** [M3, my pick].
- ✅ **Time-window toggles** [M4]: 7d / 4wk / 12wk / all-time.
- ✅ **"Most often" tracks workouts + exercises + muscles** [M5].

## 9. Strength / weakest-area (feature #5) ✅
- **Spiderweb (radar) chart with a metric toggle**: volume view (any §8 metric)
  vs strength view.
- ✅ **Strength = estimated 1RM (Epley = w × (1 + reps/30))** per lift, rolled up
  to muscle groups. [O-10] Only loaded lifts feed the strength score
  (bodyweight/timed excluded).
- ✅ **Per-muscle strength score = best est-1RM among exercises whose *primary*
  muscle = that group** [M7, my pick] (chest ← best of bench/incline/…).
- ✅ **Weakest view = two toggles** [M6, my pick]:
  - *Relative to you* — each muscle's best est-1RM min-max normalized 0–100
    across your muscles; smallest spoke = weakest (balance/imbalance view).
  - *Relative to standards* — **main lifts only** (squat/bench/deadlift/OHP/row),
    percentile vs published novice→elite standards by bodyweight/sex (needs
    profile: bodyweight, sex, age, height).

## 10. Form video (feature #6) — scaffold only ✅
- Bones: **native-camera capture** (file input w/ `capture`), **attach to a
  specific logged set**, scrub + slow-mo playback. Clean seam for future
  pose/form analysis (no analysis now). [V1/V2]
- ✅ **30 s max** per clip. [V3]
- ✅ **Retention:** videos **auto-purge after 30 days**; progress photos kept
  **~1 year**. (A future paid tier may extend retention — no billing now.)
- Private Supabase Storage bucket; a scheduled purge job enforces retention.

## 11. External sync (feature #7) — DEFERRED to long-term backlog ✅
- **Not in the initial build.** v1 = manual entry + CSV import for body metrics.
- Backlog notes (when revisited): **Fitbit Web API** (OAuth) is the practical
  hub; **FitIndex** has no API (read indirectly via Fitbit/Health); **LoseIt**
  API is partner-gated (CSV); **Google Fit** REST API is deprecated. Re-verify
  API states before building.

## 12. Progress photos + reminders (feature #8) — light spec, refine later ✅
- Build sensible defaults now; user refines later.
- Reminders = **on-screen nudges after a workout** + dashboard (no push v1).
- Default measurements: bodyweight, body-fat%, neck, shoulders, chest, waist,
  hips, arms L/R, thighs L/R, calves L/R, forearms L/R (editable later).
- Photos: front/side/back categories, private storage, side-by-side compare,
  ~1 yr retention (§10).
- Default reminder cadence (configurable): weigh-in weekly, measurements 2 wk,
  photos 4 wk.

---

## 13. Open questions

**Engine — FULLY LOCKED.** ✅ Progression pipeline + scope/inheritance + presets
+ failure + warmup + rounding + gap-workout all decided. (Chained reps→sets
ladders default to reset-reps-to-base; configurable.)

**Deferred until their feature**
- O-2 Phone OS (before #6).
- O-12 Which body measurements to track (#8).

**Plate calc / equipment — LOCKED** ✅ (E1–E5, P1–P3). Two small follow-ups:
- E-bar: confirm one 45 lb Olympic bar (any others?).
- Equipment-ceiling behavior (hold+warn vs auto-switch to reps) — confirm later.

**Analytics #4/#5 — LOCKED** ✅ (M1–M7; M3/M6/M7 defaults chosen by me).

**SPEC COMPLETE for v1.** ✅ Features #1–#8 decided (#7 deferred to backlog;
#8 light-spec with sensible defaults to refine later).

**Minor deferrals (non-blocking, decide during build):**
- O-2 Phone OS (native capture works on both anyway).
- Equipment-ceiling behavior (hold+warn default vs auto-switch to reps).
- #8 detailed refinement; exact strength-standards dataset.

**Next:** full **data model** (Postgres + RLS) + **phased build plan** for
sign-off, then scaffold the Vite/TS/Supabase app.

**Resolved this session:** O-4, O-5, O-6, O-6b, O-7, O-8, O-9, O-10, O-11,
M1–M7, V1–V3, S1–S3 (backlog), B1–B3 (defaults), Q-A, Q-B, Q-C, E1–E5, P1–P3,
stack, foundations.
