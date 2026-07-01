# SupaStrength — Technical UI Audit (2026-07-01)

> `/impeccable audit` — code-level technical quality pass (a11y, performance,
> theming, responsive, anti-patterns). Run as a 32-agent workflow: 5 dimension
> finders swept all 24 UI surfaces, **every finding was adversarially verified**
> (2 downgraded on verification, refuted findings dropped), and a completeness
> critic caught gaps. Findings document issues only — nothing was changed.

## Audit Health Score

| # | Dimension | Score | Key finding |
|---|-----------|-------|-------------|
| 1 | Accessibility | **2**/4 | WCAG AA contrast fails in light theme (warn/good on tints) and `--faint`-as-text fails in **both** themes; modal sheets have no focus management |
| 2 | Performance | **3**/4 | Recharts + all routes eagerly bundled (no code-splitting); hot path (timer/session) is genuinely clean |
| 3 | Theming | **3**/4 | Strong OKLCH dark/light parity; gaps: `theme-color` never flips, `#fff` switch knob |
| 4 | Responsive Design | **2**/4 | Logged-set card overflows horizontally on every phone; several sub-44px touch targets |
| 5 | Anti-Patterns | **3**/4 | Clean against all hard bans; only tell is component-vocabulary drift |
| **Total** | | **13/20** | **Acceptable — significant work needed** |

Issue count (post-verification): **0 P0 · 7 P1 · 9 P2 · 10 P3 = 26 confirmed.**

---

## Anti-Patterns Verdict — **PASS**

**Does this look AI-generated? No.** Against the impeccable hard bans it is
genuinely clean, verified in code:

- **No gradient text** (no `background-clip:text` anywhere).
- **No side-stripe borders** (no colored `border-left/right`).
- **No decorative glassmorphism** — `backdrop-filter` appears *only* on the
  sanctioned sticky app-bar / tab-bar / progress header.
- **No hero-metric template, no identical card grids, no nested cards** — the
  `herostat` is used singly, insets live inside cards but never card-in-card.
- **No per-section eyebrows or 01/02/03 scaffolding** — exactly five uppercase
  micro-label classes, each bound to a value or a single section; freq-list
  numbers are a real ranked top-5.
- **No gray-on-color, real lucide icon system** (not emoji), skeleton-first
  loading, empty states that teach.

The only tells a Linear/Stripe-fluent user would notice are **consistency
issues**, not slop: four un-shared ± / stepper treatments (two are pixel-twins),
two visual languages for the same on/off setting (plus duplicate CSS), two
builder pages that use a spinner in an otherwise skeleton-first app, and one
`pop` keyframe that overshoots (bounce) against the stated ease-out-only rule.

---

## Executive Summary

- **Health: 13/20 (Acceptable).** The design system is real and disciplined; the
  damage is concentrated in **contrast tokens**, **touch-target sizing on a
  phone-first app**, one **layout overflow on the core screen**, and
  **modal/keyboard a11y**.
- **Top issues:**
  1. **AA contrast fails** — `--warn`/`--good` text on their tints in light
     theme (3.71:1 / 4.29:1) and `--faint`-as-text in **both** themes
     (placeholder, section labels, rank counters). Violates the app's own
     "AA in both themes" non-negotiable.
  2. **The logged-set card overflows horizontally on every mainstream phone** —
     four non-shrinking controls (~335px) exceed the ~264–294px available;
     Log / 🎥 buttons spill past the card edge on the primary in-gym screen.
  3. **Recharts + all routes eagerly bundled** — no `React.lazy` anywhere; a
     ~150KB-gzip chart lib loads on first paint for every user on the exact
     cellular context this product targets.
  4. **Modal bottom-sheets have no focus management** — `aria-modal` with no
     initial focus, no trap, no Escape, no restore, on the Complete-workout flow.
  5. **Multiple sub-44px touch targets** — reminder switch (38×22, also fails
     WCAG 2.5.8), photo delete (32×32, destructive), standalone text-links
     (~20px), picker rows.
- **Recommended next steps:** `colorize` the contrast tokens → `harden` the
  modals + destructive/unlabeled controls → `layout` the set card → `optimize`
  the bundle → `adapt` the touch targets → finish with `polish`.

---

## Detailed Findings by Severity

### P1 — Major (fix before release)

**[P1] Light-theme warning text on `--warn-tint` fails AA (3.71:1)** ·
Accessibility · `src/styles/index.css:342` · WCAG 1.4.3
`.status--warn` renders 13px normal `--warn` on `--warn-tint`; light-mode this is
the "Set your bodyweight…" / "bodyweight looks stale" analytics banners and the
"Due" reminder badge. Recomputed 3.71:1 < 4.5:1. **Same pair also fails on**
`.badge--due` and `.std__band--advanced`. → **colorize**

**[P1] Light-theme success text on `--good-tint` fails AA (4.29:1)** ·
Accessibility · `src/styles/index.css:338` · WCAG 1.4.3
`.status--ok` ("Saved.", "Magic link sent"), plus `.tagchip--key` (12px) and
`.std__band--intermediate`. Dark is fine (7.31:1); light is 4.29:1 < 4.5:1. →
**colorize**

**[P1] `--faint`-as-text fails 4.5:1 in BOTH themes** · Accessibility ·
`src/styles/index.css:452` · WCAG 1.4.3
Input placeholder over `--inset` (4.23 dark / 3.57 light), `.upnext__label`
section label, `.freqlist` rank counters (2.38 dark — worse than reported).
`--faint` is the least-prominent role and shouldn't carry text. → **colorize**

**[P1] Bottom-sheet dialogs declare `aria-modal` but implement no focus
management** · Accessibility · `src/features/session/VideoSheet.tsx:47` (+
`SessionPage.tsx:492` CompleteSheet) · WCAG 2.4.3 / 4.1.2
No initial focus, no focus trap, no Escape, no focus restore. Repo-wide grep for
focus-trap / Escape / dialog libs = zero hits. Keyboard/SR users can Tab behind
the scrim on the core Complete-workout flow. → **harden**

**[P1] Recharts + all routes eagerly imported into the main bundle — no
code-splitting** · Performance · `src/routes/AppShell.tsx:27`
`AppShell` statically imports `AnalyticsPage` → `recharts@3` (RadarChart +
d3-scale/shape/path). No `React.lazy`/`Suspense` anywhere; no `manualChunks`.
Home is the landing route, yet every user downloads the chart lib on first paint.
→ **optimize** (route-split `/analytics`)

**[P1] Logged-set card overflows horizontally on all mainstream phones** ·
Responsive · `src/styles/index.css:876`
Done-state row = `.setcard__n` (48) + rep stepper (~166) + `.logbtn` (52) +
`.setvid` (44) + gaps ≈ **334px** minimum, vs **294px** (390px viewport) /
**279px** (375) / **264px** (360) available. No `flex-wrap`, no `min-width:0`.
Log / 🎥 spill off the card on the primary in-gym screen. The CSS comment at
`:1483` admits it was "tighten[ed] so all four items fit" — insufficiently. →
**layout**

**[P1] Reminder toggle is 38×22px — below the 44px product minimum and WCAG
2.5.8 (24px) on height** · Responsive · `src/styles/index.css:1615` · WCAG 2.5.8
The `.switch` label is the whole hit area (hidden `input`), 22px tall — half the
product floor, below the legal 24px minimum. Controls whether a check-in reminder
fires. → **harden** / **adapt**

### P2 — Minor (fix next pass)

**[P2] Reminder switch has no accessible name** · A11y ·
`src/features/progress/ProgressPage.tsx:283` · WCAG 4.1.2
Bare checkbox; the label wraps only the decorative track, the "Weigh-in" text is
a separate span. SR announces "checkbox, checked" with no name. Add
`aria-label={`Enable ${label} reminder`}` + `role="switch"`. → **clarify**

**[P2] Rest-timer completion not announced to screen readers** · A11y ·
`src/features/session/RestTimer.tsx:41` · WCAG 4.1.3
`role="timer"` (implicit `aria-live:off`); "done" is only a color change to
`--good`. A lifter not looking at the phone gets no cue rest is over. Add a
polite/assertive live region firing "Rest complete" at zero. → **harden**

**[P2] Progress-photos page fires one signed-URL request per thumbnail (N+1)** ·
Performance · `src/features/progress/PhotosSection.tsx:154`
`usePhotoUrl` runs per-thumb; `useRecentPhotos` defaults to `limit=60`.
`loading="lazy"` defers only bytes, not the query — opening Progress can burst
~60 parallel `createSignedUrl` RPCs. Batch with `createSignedUrls([...])`. →
**optimize**

**[P2] `meta` `theme-color` hard-coded dark; never flips in light theme** ·
Theming · `index.html:11`
`<meta name="theme-color" content="#0b0f17">` with no `media` and no JS updater
(the PWA manifest `theme_color` is also hard dark). Light-theme users get a dark
browser chrome bar. Add `media`-variant tags or update on `data-theme` change. →
**adapt**

**[P2] `.switch__track` knob hard-coded `#fff` — no theme flip** · Theming ·
`src/styles/index.css:1639` · WCAG 1.4.11
White knob vs the light-theme OFF track (light gray) = 1.45:1 < 3:1 non-text
contrast; the knob nearly disappears. State still readable via track color.
Tokenize the knob. → **colorize**

**[P2] Photo delete button is 32×32px — under the 44px product minimum** ·
Responsive · `src/styles/index.css:1702`
Destructive ✕ in a ~90px thumbnail corner; clears WCAG's 24px floor but violates
the product ≥44px rule. Mis-tap = deleted progress photo. → **harden** / **adapt**

**[P2] `.linkbtn` has `padding:0` — standalone text-links have a ~20px hit
area** · Responsive · `src/styles/index.css:531` · WCAG 2.5.8
Hits "Forgot password?" (`AuthScreen:119`), measurements "Edit"
(`ProgressPage:230`), builder "All" back-link (`WorkoutBuilderPage:41`). Give
standalone variants vertical padding / `min-height:44px`; keep the in-sentence
toggle exempt. → **harden** / **adapt**

**[P2] Routine-name input has no accessible name (placeholder only)** ·
Accessibility (critic-found) · `src/features/routines/RoutinesPage.tsx:28` · WCAG
4.1.2 / 3.3.2
The lone unlabeled create-form field — siblings use `aria-label="New workout
name"` / `"New location name"`. Add `aria-label="New routine name"`. → **clarify**

**[P2] Progress-photo deletion is immediate, permanent, and unconfirmed** ·
Accessibility/UX (critic-found) · `src/features/progress/PhotosSection.tsx:168`
One tap hard-deletes the DB row **and** the storage object — no confirm, no undo,
adjacent to a benign whole-tile compare tap. The app gates the *less* destructive
"Complete workout" behind a confirm sheet, so this is inconsistent. → **harden**

### P3 — Polish (fix if time permits)

- **[P3] Progress fills animate `width` not a composited transform** · Perf ·
  `index.css:748` & `:1864`. One-shot, tiny, `overflow:hidden` tracks → negligible
  today; purity only. Prefer `transform:scaleX()`. → **optimize**
- **[P3] `.seg__btn--on` bakes a near-white `oklch` fallback wrong for dark** ·
  Theming · `index.css:1775`. Dead today (`--on-accent` always defined) but a
  wrong-theme literal. Drop the fallback. → **harden**
- **[P3] `--faint` used for the "Up next" label where siblings use `--muted`** ·
  Theming · `index.css:971`. Token-role drift + ~4.14:1 near-miss. Use `--muted`.
  → **clarify**
- **[P3] Hero weight input is `width:4ch`, clips half-pound weights** ·
  Responsive · `index.css:801` *(verifier downgraded P2→P3 — overflow is only
  ~7px, mostly absorbed by tabular side-bearings)*. Widen to ~5ch. → **layout**
- **[P3] Exercise instructions hard-clip at `max-height:7.5em`** · Responsive ·
  `index.css:655`. `overflow:hidden`, no ellipsis/expand — long form cues cut
  mid-sentence, unreachable. Add fade + "Read more" or drop the clamp. →
  **clarify**
- **[P3] Four different ± / step controls, no shared primitive (two pixel-twins)**
  · Anti-Patterns · `index.css:907` *(verifier downgraded P2→P3 — all meet 44px;
  DRY concern, not perceived inconsistency)*. Collapse to one Stepper. → **polish**
- **[P3] Two controls for the same on/off setting + duplicate checkbox CSS** ·
  Anti-Patterns · `index.css:1778`. `.switch` (reminders) vs `.toggle`/`.antoggle`
  (equipment/analytics); `.antoggle` duplicates `.toggle`. Standardize on one. →
  **polish**
- **[P3] Two builder pages use a centered spinner in a skeleton-first app** ·
  Anti-Patterns · `WorkoutBuilderPage.tsx:36` (+ `RoutineBuilderPage.tsx:58`).
  `ui.tsx` documents "skeletons > spinners". Use `SkeletonList`. → **polish**
- **[P3] Set-logged `pop` keyframe overshoots (bounce)** · Anti-Patterns ·
  `index.css:1294`. `0.6 → 1.12 → 1` contradicts the stated no-bounce/ease-out
  rule. Animate `0.85 → 1`. → **animate**
- **[P3] Exercise-picker result rows fall under 44px** ·
  Accessibility (critic-found) · `index.css:601` · WCAG 2.5.8. `.picker__item`
  ~36–40px in a scrolling list; add `min-height:44px`. → **layout**

---

## Patterns & Systemic Issues

1. **One contrast root cause spans many components.** The light-theme
   `--warn`/`--good`-on-tint failure and the `--faint`-as-text failure recur
   across `.status--warn/ok`, `.badge--due`, `.std__band--advanced/intermediate`,
   `.tagchip--key`, `.input::placeholder`, `.upnext__label`, `.freqlist`
   counters. **Fixing the tokens (or adding `--on-warn`/`--on-good` and reserving
   `--faint` for non-text) clears the whole class at once.**
2. **Touch targets sized below the product's own ≥44px non-negotiable** recur:
   reminder switch (22px), photo delete (32px), standalone `.linkbtn` (~20px),
   picker rows (~38px). A phone-first, sweaty-hands product should enforce 44px
   systematically (e.g. a shared hit-area utility).
3. **Component-vocabulary drift** — steppers, toggles, and loading states each
   have 2–4 unshared implementations. Not slop, but the kind of inconsistency a
   category-fluent user notices; consolidate into primitives.
4. **Destructive-without-confirm** appears beyond photos (workout entry remove,
   rotation remove, archive) — those are recoverable, but the photo delete is
   irreversible and should gate.
5. **Modal a11y is unbuilt** — both bottom-sheets lack focus management and
   Escape; a single shared `<Dialog>`/`useFocusTrap` primitive fixes both.

## Positive Findings (keep these)

- **Genuinely clean against every AI-slop hard ban** (see verdict). This is rare.
- **Runtime performance on the hot path is right**: the 1s timer tick re-renders
  only the leaf timer; Recharts has `isAnimationActive={false}`; the radar derive
  is memoized on primitive deps; a global `prefers-reduced-motion` reset zeroes
  every animation; photos `loading="lazy"`, video `preload="metadata"`.
- **Theming is strong**: every token defined in both themes; the pre-paint script
  matches `useTheme` exactly (no flash); the theme transition is scoped to
  `<body>` + specific components (not a universal `*` selector).
- **A11y foundation is real**: icon buttons labeled, `label`/`htmlFor` pairing,
  global `:focus-visible` ring, landmarks, image alt text, timer/progress roles.
- Safe-area insets handled; measurements table has `overflow-x`; steppers /
  seg-buttons / repsteps / logbtn already hit 44px.

## Recommended Actions (priority order)

1. **[P1] `/impeccable colorize`** — fix the AA contrast tokens: raise light-theme
   `--warn`/`--good` (or add `--on-warn`/`--on-good` for on-tint text) and fix
   `--faint`-as-text in both themes. One pass clears the banners, `badge--due`,
   `std__band`, `tagchip--key`, placeholder, up-next label, and freq counters.
2. **[P1] `/impeccable harden`** — add focus management + Escape to the two
   bottom-sheets; give the reminder switch and routine-name input accessible
   names; gate the photo delete behind a confirm/undo.
3. **[P1] `/impeccable layout`** — fix the logged-set card horizontal overflow
   (wrap or restructure so Log / 🎥 stay on-card at 320px); widen the hero weight
   input; add `min-height:44px` to picker rows.
4. **[P1] `/impeccable optimize`** — route-split with `React.lazy`/`Suspense`
   (at minimum `/analytics` → Recharts into its own chunk); batch the photo
   signed-URLs into one `createSignedUrls` call.
5. **[P2] `/impeccable adapt`** — bring remaining sub-44px targets to the product
   minimum (switch, photo delete, standalone `.linkbtn`) and flip
   `meta[theme-color]` for the light theme.
6. **[P3] `/impeccable polish`** — consolidate the stepper/toggle/loading
   vocabulary, tokenize the `#fff` knob, drop the `pop` overshoot. **Run last** as
   the final quality pass once the above land.

## Coverage & method notes

- 15 surfaces were opened and vetted with **zero** findings (Auth, ResetPassword,
  Workouts, Exercises, Home, Profile, Equipment, History, Analytics, App,
  BootstrapGate, useTheme, RoutineBuilder, WorkoutBuilder aside from the spinner,
  ResetPasswordScreen) — real coverage, not silence.
- **Not rendered** (static code audit only): the 12-spoke radar label overlap at
  narrow widths and the 6-tab bottom bar crowding "Exercises" at ~320px are
  *plausible but unverified* — confirm with a device/screenshot pass if desired.
- The global `:focus-visible` ring is a `box-shadow`, which is clipped by
  `overflow:hidden/auto` ancestors (`.photothumb`, `.picker`) — low priority for
  a touch-first app, noted as a gap.
