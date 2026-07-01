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
- `--ink` primary text · `--muted` secondary (kept ≥4.5:1, never decorative gray) ·
  `--faint` least-prominent text (placeholders, section micro-labels, rank
  counters) — dimmer than `--muted` but still **AA ≥4.5:1 in both themes** (it is a
  text role, never decorative).
- `--accent` brand / primary; `--on-accent` text on it.
- State hues: `--good` (set done / PR), `--warn` (ceiling / stale), `--bad`
  (error / failure). Each has a low-chroma tint background for fills, and the hue
  itself is used as **text on that tint** (status banners, badges, standards
  bands). So the light-theme `--good`/`--warn`/`--bad` are darkened enough that
  on-tint text clears AA 4.5:1 (verified: good 4.80, warn 5.00, bad 4.77). Keep
  that invariant when retuning these hues.

Dark bg sits near OKLCH L0.17 with a faint brand-hue tint (not navy-cliché, not
neutral-black). Light bg is a cool near-white (L~0.985, chroma toward the brand
hue) — explicitly **not** warm cream.

## Typography

**Self-hosted variable type system, driven by three tokens** (swap a direction by
changing only these): `--font-display` = **Archivo Variable** (the bold,
high-energy voice — headings, brand, big figures), `--font-num` = Archivo Variable
with `tabular-nums` (weights / reps / timer / counts), `--font-body` = **Inter
Variable** (UI/body workhorse). Archivo (mechanical grotesque) over Inter (humanist
grotesque) is a deliberate contrast-axis pairing, not two look-alikes. Bundled via
`@fontsource-variable/*` so the PWA works offline with no FOUT. **Fixed rem scale**
(ratio ~1.2), not fluid. Display letter-spacing held at −0.015 to −0.03em (≥ −0.04em
floor). Numbers go big and heavy (the working weight, the rest timer); labels stay
quiet (uppercase micro-labels used sparingly, never as per-section eyebrows).

Scale: `--fs-xs` 0.75 · `--fs-sm` 0.8125 · `--fs-base` 1 · `--fs-md` 1.0625 ·
`--fs-lg` 1.25 · `--fs-xl` 1.5 · `--fs-2xl` 2 · `--fs-stat` 2.75rem (hero figures).

## Space & radius

8px rhythm via `--s-1..--s-7` (4/8/12/16/20/24/32). Radii: `--r-sm` 8 ·
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

**Cards** carry a single elevation: a hairline `--border` plus a tight contact
`--shadow` (≤ 8px blur) — not the wide-blur "ghost card". **Backdrop-blur** is a
deliberate, functional exception limited to sticky chrome (app bar, bottom tab bar,
the in-session progress header) where content scrolls beneath; it is never used as
decorative glass on cards or surfaces.
