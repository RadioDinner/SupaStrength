# SupaStrength — Product & Technical Spec (living document)

Status: **PLANNING** (no code yet). This doc is the source of truth for design
decisions. Each item is tagged:

- ✅ **LOCKED** — decided, build to this.
- 🟡 **PROPOSED** — my recommendation, pending user confirmation.
- ❓ **OPEN** — needs a user decision before it can be built.

Last updated: session 000 (2026-06-29).

---

## 1. Vision

A personalized workout tracker. Web app first (used on phone in mobile view),
native Android later. Single primary user (the owner). The headline feature is
a **highly flexible progressive-overload engine** with a routine scheduler that
mixes a cycling sequence of workouts (StrongLifts A/B…) with always-on workouts
(e.g. a "shoulder blowup" every session).

Priority order (user's): (1) custom workouts + progression engine,
(2) plate calculator, (3) equipment/plate inventory, (4) muscle & frequency
tracking, (5) strength / weakest-area analysis, (6) form-video capture
(scaffold only), (7) external data sync, (8) progress photos + measurement
reminders.

---

## 2. Foundations

- 🟡 **Stack.** Supabase (Postgres + Auth + Storage + Row-Level Security) +
  Next.js (React) built as an installable **PWA**. One codebase serves
  mobile-web now; Android later via Capacitor wrap rather than a rewrite.
- 🟡 **Single user, real auth.** Build for one user but on Supabase Auth + RLS
  so multi-user/coach-sharing is possible later without re-architecting.
- ✅ **Units: lbs.** (No kg toggle for v1. Smallest plate increment ❓ — see open
  questions; load-bearing for rounding.)
- ❓ **Offline-first?** BIGGEST open architectural fork. Gym signal is bad. If
  required → local-first data with background sync. If not → simple online
  CRUD. Unanswered.
- ❓ **Phone OS** (iPhone vs Android) — affects camera capture (#6) and any
  future push. Reminders for v1 are on-screen only (no push), per user.

---

## 3. Domain model (the core)

Four distinct layers (🟡 pending confirmation of naming/shape):

1. **Exercise** — a library definition (e.g. "Barbell Back Squat"). Carries:
   default bar/equipment, primary/secondary muscles, movement type, loading
   style. Seeded from a large open exercise dataset (#4).
2. **Workout** — a reusable template / a "day" (e.g. "Workout A",
   "Shoulder Blowup"). An ordered list of **workout-entries**, each =
   `{exercise, sets, reps/rep-scheme, rest, progression rule, failure rule,
   warmup policy}`.
3. **Routine** — the **schedule**. Composed of one or more **rotations**
   (independent tracks). Each rotation is an ordered list of workouts that
   advances one step each time a session is completed.
   - Example (user's): Rotation 1 = `[A, B]` (cycles A→B→A…); Rotation 2 =
     `[Shoulder Blowup]` (length 1, so it's "always on").
   - A **gym day** = the current head of *every* rotation combined. Monday =
     A + Shoulder Blowup; Wednesday = B + Shoulder Blowup.
   - Completing a session advances *every* rotation's pointer by one.
4. **Session (log)** — an **immutable** record of what was actually performed
   on a date (real weight/reps per set, rest taken, notes).

### Scheduling model

- ✅ **Pointer-based, not calendar-based.** "Next time in the gym → next set of
  workouts." No catch-up, no missed-day debt.
- 🟡 Optional calendar/target-days overlay for guidance & reminders only —
  never forces catch-up.

### Progression state

- 🟡 Tracked **per (routine, exercise)**: one running working-weight + rep
  targets + failure counters per exercise, **shared across every workout in the
  routine that contains that exercise**. (User's example: squat in both A and B
  climbs as one continuous line — +5 each time it's performed regardless of
  which workout it appeared in.)
- ❓ Edge case: same exercise configured differently in A vs B (e.g. squat 5×5
  heavy in A, 3×8 in B). Does weight stay shared while rep-scheme differs per
  entry? (See open questions.)

---

## 4. Progression engine (✅ requirements, 🟡 exact rule encoding)

All rules must be **data-driven and editable in-app — never code changes.**
Configurable **per exercise** within a routine, with a routine-level default.

### Progression rule types (per exercise)

- Add fixed **weight** (e.g. +5 lb) every time the exercise is performed.
- Add fixed weight **every N performances** (frequency counter, e.g. bench +5
  every 2nd time). Counter scoped per (routine, exercise).
- **% of last lift** — next = last × (1 + p%).
- **% of target** — relative to a configured goal/target weight. ❓ exact
  definition (see open questions).
- Add a **rep to every set**.
- Add a **rep to the last set** only.
- Take the **last set to failure (AMRAP)**.
- All weight outputs pass through **plate/equipment-aware rounding** (§6).
- ❓ Stacking / double-progression: reps-then-weight (work a rep range, when top
  hit add weight and reset reps). Needs explicit rep-range + trigger encoding.

### Rep-scheme support (per workout-entry)

- ✅ All three available when building a workout: (a) straight sets/fixed reps,
  (b) double progression (rep range), (c) %-of-1RM / RPE.

### Failure handling (per exercise, editable in-app)

- ✅ Configurable outcomes on a failed session:
  - Deload **X lb**.
  - Deload **X reps**.
  - **Drop a set**.
  - **Repeat** — re-attempt same prescription next time as if nothing was added,
    until all reps×sets succeed, *then* progress (StrongLifts-style; user's
    120×5×5 example).
- ❓ What counts as "failure" (threshold) and whether **Repeat** loops forever
  or repeats N times then deloads (see open questions).

### Warm-up sets

- ✅ Auto-generate warm-ups **only if** working weight/volume exceeds a
  threshold set in the workout's settings.
- ❓ Threshold basis (weight vs volume) and the ramp scheme (how many warm-up
  sets and at what %s).

### Rest timer

- ✅ Pre-defined rest intervals per workout-entry at build time.
- ✅ In-gym: change the rest on the fly and tap a button to **save the change
  back to the workout template**.
- 🟡 Generalize "save in-session change back to template" to other fields
  (reps/sets/weight)? ❓

### Audit log

- ✅ Keep an **audit log** of changes: program/template edits, progression
  adjustments, in-session overrides saved back, deloads. Logged sessions are
  immutable history (§3).

---

## 5. Exercise library & movement types

- ✅ **HUGE** built-in library, all movement types: barbell, dumbbell, machine
  (plate-stack), cable, bodyweight, weighted bodyweight, assisted, timed/cardio.
- 🟡 Seed from an open dataset with muscle mappings (candidates: free-exercise-db
  / wger). Progression engine primarily targets loadable exercises; bodyweight/
  cardio still log but with type-appropriate progression/logging UI.

---

## 6. Plate calculator + rounding (features #2, #7)

- ✅ Honors the user's **actual equipment** (bar weight + plate inventory in
  pairs) for the active gym/location.
- ✅ "**Do the best you can**" rounding: reach the target with whatever plates
  exist (combine smaller plates rather than refusing). If exact target isn't
  loadable, get as close as possible.
- ❓ Tie-break when equidistant (round down / up / nearest) and confirm
  symmetric per-side loading for barbells.

---

## 7. Equipment / locations (feature #3)

- ✅ Single gym today, but build the **multi-location framework**: a location
  has its own barbells (with weights), plate inventory (denomination ×
  quantity/pairs), dumbbell set (range + increment), machines, etc.
- Used by the plate calculator and by progression rounding.

---

## 8. Muscle & frequency tracking (feature #4)

- ✅ Uses the seeded exercise→muscle map (primary/secondary).
- 🟡 "Worked" metric default = **tonnage** (sets×reps×weight) + set count, over
  selectable time windows. Most-frequent workouts/movements tracked.

## 9. Strength / weakest-area (feature #5)

- ✅ **Spiderweb (radar) chart of muscle groups with a metric toggle**:
  - "Lowest volume" view (under-trained) vs "Weakest" view (low strength) —
    explicitly different measurements.
- ❓ Define "weakest" quantitatively: estimated 1RM aggregated per muscle group,
  and weak **relative to** what — your other muscles (imbalance) or published
  strength standards for bodyweight/sex/age? (see open questions.)

## 10. Form video (feature #6) — scaffold only

- ✅ Build the **bones**: capture/upload a video, attach it to a specific
  session/exercise/set, scrub + slow-mo playback. Leave a clean seam where
  pose/form analysis plugs in later.
- 🟡 Storage in Supabase Storage (private bucket); watch quota/cost — video is
  heavy.

## 11. External sync (feature #7)

- ✅ Scope realistically; do the best we can. Findings:
  - **Fitbit Web API** (OAuth) is the viable hub for weight/body-fat/activity.
  - **FitIndex scale** has no public API — it pushes to Fitbit / Apple Health /
    Google Fit, so we read it *indirectly* via Fitbit.
  - **LoseIt** API is partner-gated → likely CSV export import.
  - **Google Fit**: the REST API is deprecated (Google steering devs to
    Health Connect, which is on-device Android-only and not callable from a web
    app). So Google Fit is **not** a reliable web-app integration; Fitbit is the
    practical target. (To re-verify before building.)
- 🟡 v1 = read-only ingest of weight/body-composition via Fitbit; manual/CSV
  fallback. Sync direction, frequency, and dedup with manual entries TBD.

## 12. Progress photos + reminders (feature #8)

- ✅ v1 reminders are **on-screen text after a workout** (e.g. "you haven't
  updated measurements in 2 weeks — do it now?"). No push for v1.
- 🟡 Store photos in private Supabase Storage; track measurements (which body
  parts ❓) and weight; side-by-side comparison over time.

---

## 13. Open questions (blocking, by priority)

**Foundations**
- O-1 Offline-first required, or is online-only acceptable for v1?
- O-2 Phone OS (iPhone / Android)?
- O-3 Smallest plate increment owned (do you have 2.5s? 1.25 micro-plates?).

**Engine**
- O-4 "% of target" — what is "target" (a goal/1RM you set)? vs "% of last".
- O-5 Same exercise in A vs B: shared weight but per-entry rep scheme? Or fully
  independent per workout?
- O-6 Failure: what counts as a failed session (any set short? a whole-exercise
  miss?), and does **Repeat** loop forever or repeat N times then deload?
- O-7 Double progression encoding (rep range + "top hit → +weight, reset reps").
- O-8 Warm-up threshold basis + ramp scheme.
- O-9 "Save in-session change back to template" — rest only, or any field?

**Analysis / calc**
- O-10 "Weakest" definition (est-1RM per muscle; relative to self vs standards).
- O-11 Plate rounding tie-break (down/up/nearest); confirm symmetric loading.

**Misc**
- O-12 Which body measurements to track (#8).
