---
target: SupaStrength app
total_score: 27
p0_count: 0
p1_count: 2
timestamp: 2026-07-01T17-40-05Z
slug: supastrength-app
---
# SupaStrength — Design Critique (2026-07-01)

Method: dual-agent (A: af717673eca255b89 · B: ae31437a863b80910)

## Design Health Score

| # | Heuristic | Score | Key issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 3 | Skeletons + sticky progress header strong, but `toggleSet()` logs optimistically with no success confirm and no `onError` rollback |
| 2 | Match System / Real World | 3 | Domain language right, but weight is per-exercise (`weightOf(entry)`) not per-set — ramping/back-off can't be expressed |
| 3 | User Control and Freedom | 3 | Sheets/Escape/focus-restore solid, but no undo on Archive/Remove, and reps are ±-only (no direct entry) |
| 4 | Consistency and Standards | 3 | 6-tab bar breaks ≤5 convention; 3 stepper idioms; Prev/Next use raw ‹ › glyphs vs Lucide everywhere else |
| 5 | Error Prevention | 2 | Photo delete confirmed, but Archive sits beside Start and builder X's fire `mutate()` with no confirm |
| 6 | Recognition Rather Than Recall | 3 | Plate load + up-next excellent, but set cards never show the weight; History rows hide the workout name until expanded |
| 7 | Flexibility and Efficiency | 2 | No auto rest-timer; 15-rep set = 15 taps (no keyboard entry); weighthero ± hardcoded 5 lb vs 2.5 step |
| 8 | Aesthetic and Minimalist | 3 | Handsome numeric hero + single accent; the ActiveExercise card is the one crowded spot |
| 9 | Error Recovery | 2 | No toast/undo anywhere; optimistic mutations have no rollback — a failed set-log is silently wrong |
| 10 | Help and Documentation | 3 | Excellent — inline teaching copy does the whole job invisibly |
| **Total** | | **27/40** | **Acceptable (top of band, near Good)** |

## Anti-Patterns Verdict — **NOT AI slop** ✅

**LLM review:** Does not read as AI-generated. Token layer (OKLCH w/ inline AA reasoning, one-accent discipline, tabular hero numerals), real Lucide icons, purpose-built empty states, and a careful focus-trap dialog put it above the generated-UI bar. Where it betrays itself is **domain fluency, not code fluency**: the live-logging surface lacks the auto-starting rest timer + per-set weight every real lifting app has. The tell is "competent design-system generalist who hasn't logged a set one-handed in a gym," not "machine-authored."

**Deterministic scan:** `detect.mjs` on `index.html` → **0 findings, exit 0** (positive-control confirmed the detector fires on bad input; `--no-config` re-run also clean, so not suppression). Caveat: the SPA shell carries no UI markup and the real CSS is imported via the JS module graph, so the static scan has little to evaluate — this is "nothing to flag on the shell," not a design pass. **Browser overlays unavailable** (honest fallback): no Puppeteer/Playwright, no dev server, and an unconfigured build renders only the Supabase-setup gate — the authenticated screens can't be driven here.

## Overall Impression

The **chrome is genuinely good**; the **gym loop is where it hurts.** The single biggest opportunity: make the live session feel like a lifting app — auto-start rest on log, show each set's weight, let each set carry its own load. Fix that and the score jumps.

## What's Working

1. **The design-token layer is real craft** — OKLCH values carry inline reasoning (`--faint` tuned to clear AA yet stay dimmer than `--muted`; `--switch-edge` sized for a ≥3:1 knob boundary). This is what makes "big numbers at arm's length" actually land.
2. **Inline teaching copy replaces a help center** — RoutineBuilder explains its hardest concept in one line ("One rotation cycles A→B→A"), every empty state is written for a human, subtitles orient before content.
3. **`useDialog.ts` is a11y care almost nobody ships** — focus trap + restore + scroll lock + Escape that defers to video fullscreen + recapture of focus that escaped to `<body>` on a disabled control. Someone thought about the pending-state edge.

## Priority Issues

**[P1] The rest timer doesn't auto-start on log, and it's buried below the set list** · `SessionPage.tsx`
*Why:* log→rest is the metronome of a workout; every mainstream logger auto-starts it. A manual second tap (after scrolling) means it's usually just never used — breaks the one-handed cadence. *Fix:* auto-start the countdown when a set flips done; move it under the just-logged set / a compact sticky bar. → `/impeccable craft`

**[P1] Weight is a property of the exercise, not the set** · `SessionPage.tsx`
*Why:* ramping/pyramid/back-off sets are fundamental; as built every set inherits one shared hero weight, and the set card shows no weight, so a wrong load logs silently. *Fix:* render each set's weight on its card and allow a per-set override (the capture-at-log plumbing already exists). → `/impeccable shape` → craft

**[P2] Six bottom tabs, no session-focus mode** · `AppShell.tsx`
*Why:* exceeds the ≤5 mobile convention; during a live session the whole thumb zone is unguarded "leave" targets, and Exercises (a reference library) occupies a top-level slot while the train loop has none. *Fix:* collapse to five (fold Exercises, or merge Workouts+Routines into "Plan") and add a persistent "return to session" affordance while one is in progress. → `/impeccable distill`

**[P2] Destructive actions inconsistently guarded** · `WorkoutsPage.tsx` (+ builders)
*Why:* photo delete gets a ConfirmDialog, but Archive (one pixel from Start), Remove-entry, and Remove-rotation fire `mutate()` instantly with no confirm/undo — the safe action is protected, the template-destroying one isn't. *Fix:* route them through the same ConfirmDialog (or an undo snackbar); separate Archive from Start. → `/impeccable harden`

**[P2] Optimistic mutations have no failure feedback or rollback** · `SessionPage.tsx`
*Why:* a basement gym is the operating environment; `toggleSet`/reorder/archive mutate optimistically with no `onError` UI, so a write that fails on spotty signal leaves the UI showing a logged PR that never persisted — the highest-trust-cost failure the app can have. *Fix:* error toast + optimistic rollback on the set-log first; reconcile the completion summary against what persisted. → `/impeccable harden`

## Cognitive Load — Moderate (3 of 8 failed)

- **Single focus:** the ActiveExercise card stacks weight hero + plate load + warm-ups + per-set rep steppers + rest timer + prev/next — no single anchor.
- **Minimal choices:** 6 nav tabs; AnalyticsPage stacks 4 control clusters before the chart.
- **Working memory:** a 4-level plan hierarchy (Session < Workout < Rotation < Routine) with Workouts/Routines as sibling tabs; History rows hide the workout identity until expanded.

## Emotional Journey

**Peak:** onboarding — calm auth, every first-run list a purpose-built empty state with an encouraging hint. **Valley 1:** the live session (the app's reason to exist) — the satisfying green set-log pop is followed by *nothing*: inert rest timer below the fold, no weight on the set card, a 6-tab nav quietly inviting you to leave. **Valley 2 (the peak-end):** finishing a workout — a lovely CompleteSheet reassurance, then `navigate('/')` to a dashboard reading "Last trained: Today." **The single most important 'end' in the product is a silent redirect** — no recap, PR, volume, or celebration.

## Persona Red Flags

**Casey (distracted, one-handed mobile):** rest timer stays inert below the fold after logging; reps are tap-only (12-rep set = 12 taps), weighthero ± only moves in 5s so 2.5 forces the keypad; the set card never shows the weight being recorded (the exact promise); 6-tab nav in the thumb zone silently abandons the session on a mistap.

**Alex (power user):** can't build an RPE prescription (form offers only straight/double though the model + display support `rpe`); one weight per exercise blocks ramping/back-off; no "log all sets", no supersets, no direct numeric reps; Analytics "weakest areas" is read-only (can't act on it).

**Riley (edge/stress, offline):** optimistic `toggleSet` with no `onError` → offline set-log is silent data loss in the core action; Prev/Next unmounts RestTimer, discarding an in-progress countdown; Archive beside Start with no confirm; `schemeText()` renders an RPE entry as "sets × ?".

## Minor Observations

- Prev/Next use literal `‹ › ` glyphs and "+ Add" uses a literal plus — leftovers from before the Lucide icon-system pass.
- Three distinct ± stepper languages (weighthero 48px pill / repstep 44px square / EquipmentPage ghost) — could be one primitive.
- AnalyticsPage "Weakest areas" renders all 12 muscle groups, not just the weakest — title over-promises.
- DueNudges says "Done / Later"; RemindersSection says "Did it / Snooze 3d" for the same operations — vocabulary drift.
- History collapsed rows omit the workout/routine name — reads as a wall of dates + durations.
- weighthero input at 5ch is tight for a 4-digit + decimal load (largely fine for realistic weights).

## Questions to Consider

- Why is weight a property of the *exercise* rather than the *set* — is the data model preventing ramping/back-off, or only the UI?
- What is a top-level "Exercises" tab earning its thumb-zone slot for, when the library is really consumed through the builder's picker?
- When a set-log write fails on gym wifi, what does the user actually see — and does the completion summary ever reconcile against what persisted?
- The peak of the whole product is finishing a workout — why does it end in `navigate('/')` instead of a recap (PRs, volume, next-time weights)?
- Are "Workouts" and "Routines" two tabs because that's how the user thinks, or because the data model leaked into the navigation?
