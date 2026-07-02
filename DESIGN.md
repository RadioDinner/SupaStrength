# Design

> Visual system for SupaStrength, v2 — **"calibrated instrument."** Register:
> **product**. A training ledger with the temperament of a precision scale, not
> a fitness app. Clean, professional, sharp. Colors in OKLCH. Source of truth =
> the tokens in `src/styles/index.css`; this doc explains the intent.
>
> v1 (bold/high-energy electric-indigo, rounded, dark-gym) was torn down
> deliberately on 2026-07-01: it *was* the category reflex. v2 starts from the
> equipment world — machined steel, etched hairlines, an amber indicator lamp —
> instead of the fitness-app world.

## The scene

One lifter, home gym, phone propped on the rack. Garage daylight or basement
LEDs — both themes are first-class and true-neutral, chosen by the user
(`useTheme`, persisted, pre-paint script in `index.html`). Neither theme has a
temperature: the mood lives in ink, the amber lamp, and the mono numerals — the
surface is pure chassis.

## Color (OKLCH)

Strategy: **Restrained**, instrument-flavored. Three layers:

1. **Chassis** — true neutrals, chroma 0. Light: `--bg`/`--surface` are **pure
   white** `oklch(1 0 0)` (no hidden warmth), panels `--surface-2` L0.965.
   Dark: graphite `--bg` L0.155, `--surface` L0.19, `--surface-2` L0.225.
   Hairlines `--border` do the separation work — **no shadows** (`--shadow:
   none`), no translucency, no backdrop blur anywhere.
2. **Action** — primary actions are the chassis inverted: `--action` /
   `--on-action` (ink key with white legend in light; white key in dark).
   Buttons look like keys on an instrument, not colored pills.
3. **Signal** — ONE hue: amber, the indicator lamp. `--accent` is
   `oklch(0.78 0.14 85)` in dark and darkens to bronze `oklch(0.52 0.11 80)`
   in light so it survives as small text (5.59:1 on white). It marks **live and
   selected state only**: the current set, the running rest timer, the session
   progress fill, the active tab tick, selection borders, focus rings. Never
   decoration, never large fills (the `.std__fill` gauge is the one sanctioned
   area fill).

State hues stay semantic: `--good` (set done / PR), `--warn` (ceiling / stale /
deload — hue ~50, kept well away from the amber signal at ~85), `--bad`
(error / failure). Each has a `-tint` fill and the hue itself is used as text
on that tint. **Every text/background pair above is verified ≥4.5:1 by script
in both themes** (`scratchpad/contrast.mjs` pattern — rerun when retuning).

## Typography

**Two families on a hard contrast axis: Inter (UI) + JetBrains Mono (data).**

- `--font-body` = `--font-display` = **Inter Variable**. One family for all UI;
  hierarchy is carried by weight and size only (product register: one family is
  right). Display letter-spacing −0.01em, nothing tighter.
- `--font-num` = **JetBrains Mono Variable** + `tabular-nums`, **letter-spacing
  0** (never track a mono). Every numeral in the app runs through it — working
  weight, reps, rest timer, plate math, e1RM, tables, dates in history. Digits
  read like an instrument readout and never shift width as values change.

Fixed rem scale (ratio ~1.2): `--fs-xs` 0.75 … `--fs-2xl` 2 · `--fs-stat`
2.75rem for hero figures. Uppercase micro-labels (`.stat__label`,
`.warmups__label`) are data labeling, kept sparse.

## Space, radius, elevation

8px rhythm via `--s-1..--s-7` (4/8/12/16/20/24/32). **Radius: 0. Everywhere.**
The `--r-*` tokens exist so a future direction is one edit, but every component
ships square — machined edges, no pills, no bubbles. The only circle left is
the loading spinner (a standard affordance, not a corner).

Elevation is **flat**: 1px hairline borders, opaque surfaces, `--shadow: none`.
Sticky chrome (app bar, tab bar, session progress header) is opaque `--bg` /
`--surface-2` with a hairline — content scrolls beneath a clean edge, not glass.

## Components

Same vocabulary everywhere: square keys (`.btn--primary` = action tokens,
ghost = hairline outline), square tags (`.chip`, `.badge`, `.plate`), square
slide switch (`.switch` — square knob on a square track, amber when on),
segmented controls as flat key rows (`.seg__btn--on` = action). Selection and
live state get the amber lamp (border/tint/tick), done state gets `--good`.
Every interactive element keeps default / hover / focus-visible / active /
disabled. Focus is a 2px amber ring offset by the bg.

Data viz: ledger marks. Bars are flat ink; the strength-vs-standards gauge is
flat amber with an ink position marker; the analytics radar strokes amber.
No gradients (the skeleton shimmer is the one functional exception).

## Motion

Unchanged contract from v1: 150–250ms, `ease-out`, state-only; no page-load
choreography on task screens; the Home lobby keeps its single sanctioned
staggered rise-in (composited, killed under reduced motion). The amber timer
pulse (`tick-pulse`) and the resume-bar lamp blink are state, not decoration.
Full `prefers-reduced-motion: reduce` fallback.

## Bans honored

Everything in the impeccable shared list, plus the v2 house bans: no rounded
corners, no pill chips, no backdrop blur, no drop shadows, no gradient fills,
no translucent chrome, no accent-colored primary buttons (actions are ink/white
keys; amber is a lamp, not a paint bucket).
