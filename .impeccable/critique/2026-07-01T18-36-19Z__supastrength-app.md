---
target: SupaStrength app
total_score: 31
p0_count: 0
p1_count: 2
timestamp: 2026-07-01T18-36-19Z
slug: supastrength-app
---
# SupaStrength — Design Critique (2026-07-01, re-run after fixes)

Method: dual-agent (design review + detector). Detector: 0 findings on index.html
(positive-control confirmed functional); browser overlays unavailable
(unconfigured build renders only the setup gate). NOT AI slop.

## Design Health Score — 31/40 (Good), up from 27

| # | Heuristic | Score | Δ | Key issue |
|---|-----------|-------|---|-----------|
| 1 | Visibility of status | 3 | = | onComplete navigates silently — the biggest state change is invisible |
| 2 | Match real world | 4 | +1 | speaks lifter fluently (AMRAP, e1RM, plate load, bands) |
| 3 | User control / freedom | 3 | = | WorkoutBuilder remove-exercise / RoutineBuilder remove-workout still instant, no confirm |
| 4 | Consistency / standards | 3 | = | destructive-confirm inconsistent; AddEntryForm still can't build the `rpe` scheme it renders |
| 5 | Error prevention | 3 | +1 | complete-workout guarded; weight/reps inputs still unbounded |
| 6 | Recognition | 4 | +1 | pre-fills, plate load, warm-up ramp, up-next — genuinely low-recall |
| 7 | Flexibility / efficiency | 3 | +1 | one-tap log + auto-rest; reps still stepper-only, ramp re-types the hero |
| 8 | Aesthetic / minimalist | 3 | = | session hero focused; AnalyticsPage dense (3 segmented + checkbox) |
| 9 | Error recovery | 2 | = | set-log rollback is great, but onComplete has no try/catch — crown-jewel action least protected |
| 10 | Help / documentation | 3 | = | excellent inline teaching copy |
| **Total** | | **31/40** | **+4** | **Good (was Acceptable)** |

## Anti-Patterns Verdict — NOT AI slop
Clears earned familiarity. Tells that remain are non-visual flow decisions: silent
completion redirect and heroing "days since last trained." Nav correctly ships 5
tabs now (Exercises pushed off-bar) — "the right call, not a defect."

## What the fixes moved
The session-loop work landed: auto-rest, per-set weight display, optimistic
rollback+toast, confirm-guards, and the 6→5 nav + resume bar are all recognized as
strengths. The live-session hero is called "the app's best work."

## New priority issues (higher-bar, surfaced by the re-run)

**[P1] Finishing a workout has no payoff** — `SessionPage.onComplete` → `navigate('/')`
with no summary/celebration; the peak-end moment is a silent redirect onto a
"Last trained: Today" dashboard. Fix: a completion summary sheet (sets, tonnage,
e1RM PR, "next time +X") before returning Home. → `craft`

**[P1] `onComplete` has no try/catch** — a dropped connection at "Finish & lock"
fails silently (no toast, no navigate), contradicting the careful `toggleSet`
rollback in the same file. Fix: wrap in try/catch, toast on failure, keep the
sheet open, navigate only on success. → `harden`

**[P2] Inconsistent destructive guards** — remove-exercise (X) and
remove-workout-from-rotation fire instantly while archive/rotation-delete/photo-delete
confirm; the X sits one 44px target from the reorder chevrons. → `harden`

**[P2] Reps stepper-only + ramp re-types the hero** — a 15-rep AMRAP is many taps;
per-set ramp needs re-typing the shared hero. Fix: tappable numeric rep entry +
optional per-set weight override. → `craft`

**[P3] "Start training" has no first-class thumb-zone entry** — buried two levels
deep under two tabs. Fix: a low, full-width "Start workout" on Home. → `craft`

## Persona red flags (new)
- **Casey:** the set-card `flex-wrap` makes the Log button's position shift with
  content length (it wraps as a unit) — undercuts one-handed muscle memory; no
  ±2.5 weight button; RestTimer isn't sticky.
- **Alex:** can't type reps; can't set per-set weights independently; no RPE
  prescription; no "log all sets".
- **Riley:** finish-on-dropped-connection is silent; unbounded inputs (99999 lb);
  rapid set toggling re-fires the write + restarts rest.

## Minor
- **Dead CSS:** `.setrow--done .setrow__idx` pop selector is a leftover (current
  markup uses `.logbtn.is-done`). 
- `ProgressHeader` "Exercise N/M" tracks the *viewed* index, so it jumps when
  browsing up-next (not monotonic).
- WorkoutsPage shows a top "Resume" card AND the global resume bar at once.
- Home hero "days since last trained" is a neutral-to-negative number to hero.

## Questions
- What does "done" feel like here? The one moment worth celebrating is a silent redirect.
- Is "days since last trained" the number a motivated lifter wants greeting them?
- If per-set save rolls back on failure, why does whole-session finish swallow errors?
