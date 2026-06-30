# Design

> Visual system for SupaStrength. Register: **product**. Vibe: **bold &
> high-energy**, earned-familiarity with Hevy/Strong. Dark-first with a real
> light/dark toggle. Colors in OKLCH. Source of truth = the tokens in
> `src/styles/index.css`; this doc explains the intent.

## Theme

Dark-first (the gym default), with a user-controlled **light/dark/system** toggle
(`useTheme`, persisted to `localStorage`, applied as `data-theme` on `<html>`; an
inline script in `index.html` sets it pre-paint to avoid a flash). Both themes
are first-class and AA-contrast.

## Color (OKLCH)

Strategy: **Restrained** — one committed accent doing the energy, neutrals
everywhere else. The accent is an electric indigo-blue; it appears only on primary
actions, the current selection, and live state (active set, running timer).

Semantic roles (per theme):

- `--bg` page · `--surface` card · `--surface-2` raised (app bar / tab bar) ·
  `--border` hairline.
- `--ink` primary text · `--muted` secondary (kept ≥4.5:1, never decorative gray).
- `--accent` brand / primary; `--on-accent` text on it.
- State hues: `--good` (set done / PR), `--warn` (ceiling / stale), `--bad`
  (error / failure). Each has a low-chroma tint background for fills.

Dark bg sits near OKLCH L0.17 with a faint brand-hue tint (not navy-cliché, not
neutral-black). Light bg is a cool near-white (L~0.985, chroma toward the brand
hue) — explicitly **not** warm cream.

## Typography

One family: a system/grotesque sans (`-apple-system`/Segoe/Roboto stack) — product
register, no display pairing. **Fixed rem scale** (ratio ~1.2), not fluid.
`font-variant-numeric: tabular-nums` on all weights/reps/timers/counts so digits
don't reflow. Numbers can go big and heavy (the working weight, the rest timer);
labels stay quiet (uppercase micro-labels used sparingly, not as per-section
eyebrows).

Scale: `--fs-xs` 0.75 · `--fs-sm` 0.8125 · `--fs-base` 1 · `--fs-md` 1.0625 ·
`--fs-lg` 1.25 · `--fs-xl` 1.5 · `--fs-2xl` 2 · `--fs-stat` 2.75rem (hero figures).

## Space & radius

8px rhythm via `--s-1..--s-8` (4/8/12/16/20/24/32/40). Radii: `--r-sm` 8 ·
`--r-md` 12 · `--r-lg` 16 (cards top out at 16 — no over-rounding) · `--r-pill`
999 for chips/tags. One elevation shadow token per theme (defined, ≤ moderate
blur — no ghost-card 1px-border + wide-shadow pairing).

## Components

Buttons (primary / ghost / danger), inputs, cards, chips/badges, list rows, the
plate readout, set rows, the rest timer, bottom tab bar. Every interactive
element defines default / hover / focus-visible / active / disabled. Set-done and
timer states use `--good`. Focus is a visible accent ring.

## Motion

150–250ms, `ease-out` (quart/expo), state-only (press feedback, set-done fill,
tab/route change, timer tick). No page-load choreography. Full
`prefers-reduced-motion: reduce` fallback (instant / opacity-only).

## Bans honored

No side-stripe borders, no gradient text, no default glassmorphism, no hero-metric
template, no cream body, no over-rounded cards, no 1px-border+wide-shadow combo.
