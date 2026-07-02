# Product

## Register

product

## Users

One lifter (the owner), training in a home gym, using the app **on their phone,
mid-workout** — often one-handed, sometimes with chalky/sweaty hands, glancing at
the screen between sets. Secondary context: planning workouts and routines on the
couch, reviewing progress. Built single-user but multi-user-safe (RLS).

## Product Purpose

A personalized strength-training tracker whose headline is a **highly flexible
progressive-overload engine** + an equipment-aware **plate calculator**. The user
builds workouts, schedules them as rotations, then logs live sessions where the
app prescribes the weight, shows exactly which plates to load, and times rest.
Success = the user opens it at the rack, logs the day in a few taps, and trusts
the next weight without thinking.

## Brand Personality

A calibrated instrument. Clean, professional, precise — the temperament of a
good scale or a machinist's caliper, not a hype app. The voice is a coach's
logbook: terse, factual, never cute. Mono numerals you trust, hairline rules,
sharp edges, one amber indicator lamp. Confidence comes from precision, not
volume. (v2, 2026-07-01 — replaced the v1 "bold high-energy" direction.)

## Anti-references

- Generic SaaS/admin dashboards (cards-in-a-grid, hero-metric template).
- The warm cream/sand "editorial AI" default body background.
- RGB-neon gamer aesthetics; glassmorphism for its own sake.
- **Rounded-everything "bubble gum" fitness-app styling** — pill chips, blobby
  cards, candy accents (the v1 look; explicitly rejected).
- Cluttered spreadsheet/MyFitnessPal density; fussy decoration.
- Anything that makes you stop and read mid-set.

## Design Principles

1. **The set is the hero.** In a session, logging a set is one tap; the working
   weight and rest timer dominate, everything else recedes.
2. **Readable at arm's length.** Weights, reps, and the timer are large, **tabular**
   figures legible on a phone propped against the rack with sweaty hands.
3. **Earned familiarity (Hevy/Strong).** Standard lifting-app affordances — set
   rows, done toggles, plate breakdown. Don't reinvent logging for flavor.
4. **Precise, not loud.** Ink actions + one amber signal carry the identity;
   restraint everywhere else (amber only on live state, selection, and focus).
5. **Fast over fancy.** Motion conveys state in ≤250ms and never blocks the task.

## Accessibility & Inclusion

WCAG AA contrast (body ≥4.5:1, large/bold ≥3:1) in **both** light and dark
themes. Honor `prefers-reduced-motion` (crossfade/instant fallbacks). Large tap
targets (≥44px) for gym use. One-handed reachability: primary actions sit low.
Tabular numerals so digits don't jump as values change.
