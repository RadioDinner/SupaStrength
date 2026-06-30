---
target: the live-session screen
total_score: 20
p0_count: 2
p1_count: 2
timestamp: 2026-06-30T17-36-20Z
slug: src-features-session-sessionpage-tsx
---
# Critique — live-session screen (src/features/session/SessionPage.tsx)

Method: dual-agent (A: design review · B: detector). Total 20/40 — below the bar.

## Design Health (Nielsen 0–4)
| # | Heuristic | Score | Key issue |
|---|---|---|---|
| 1 | Visibility of status | 2 | no current-set/exercise indicator, no session progress |
| 2 | Match real world | 2 | weight is an editable field, not a read prescription; Complete at top before any work |
| 3 | Control & freedom | 1 | immutable "Complete" is a one-tap unguarded default at top of page |
| 4 | Consistency | 3 | mostly Hevy/Strong conventions; timer button shuffle, Done→✓ relabel |
| 5 | Error prevention | 1 | no confirm on immutable Complete; numeric weight typos; can complete with 0 sets |
| 6 | Recognition | 2 | plate calc good; must recall current set |
| 7 | Flexibility/efficiency | 2 | reps are raw numpad entry; no repeat-last/swipe-complete |
| 8 | Aesthetic/minimalist | 2 | under-designed to flatness; hero number shrunk into a field |
| 9 | Error recovery | 2 | no recovery for immutable Complete; blur-saves are fire-and-forget |
| 10 | Help & docs | 3 | plate calc self-explains; good empty/no-bar hints |

## Anti-patterns verdict
LLM: "Yes — AI made this." Tokens are A-tier; the SCREEN is a generic stacked-card form. Tells: identical-card stack with no current-exercise hero; the working weight (the product's headline number) is a 16px labeled text input; `--fs-stat` token defined but unused; three nested gray inset boxes; no focal point.
Detector (deterministic): 0 findings on the TSX — but it only scanned markup, not the CSS where styling lives (coverage gap, not a clean bill of health). Browser overlay unavailable (auth-gated screen, no DB/server) — fallback signal.

## Priority issues
- **[P0] Working weight is a form field, not the hero.** Render it as a big tabular figure (`--fs-stat`, 800), tap-to-edit / ± stepper; drop the label. → bolder/typeset
- **[P0] Immutable "Complete workout" is unguarded + mis-placed.** Move to bottom (thumb zone), add confirm + end-of-session summary, block on 0 sets. → harden/craft
- **[P1] No hierarchy / sense of place.** Promote the active exercise to a hero; collapse the rest to "up next"; highlight current set. → layout/shape
- **[P1] Rep logging slow one-handed.** One-tap "log as prescribed", rep stepper for exceptions, ≥44px targets, whole-row tap. → distill/harden
- **[P2] Plate calc under-sells the trust moment.** Promote the per-side chips + total under the hero weight. → colorize/bolder

## Persona red flags
- Casey (one-handed mobile): Complete at top = scroll-tap lands on the irreversible action; ~38px Done target; no current-set marker.
- Sam (a11y): reps onBlur-save no announce; Done toggle lacks aria-pressed; RestTimer no role=timer/aria-live; focus relies on box-shadow (invisible in forced-colors).
- Alex (power user): no repeat-last/swipe; prescribed weight reads as pending input not settled; no inline "last time" history; timer is component-local (dies on lock).

## Questions
1. What would a *confident* version look like? (state the number huge; editing is the hedge.)
2. Why is the whole workout on screen at once? (lifter does one exercise at a time → current-exercise hero + "up next" strip.)
3. Where's the moment you earned the workout? (end summary: "25 sets, +5 on squat").
