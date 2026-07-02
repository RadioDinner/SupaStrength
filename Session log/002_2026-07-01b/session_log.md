# Session 002b — 2026-07-01 (remote Claude session)

Second session of the day (hence the `b` suffix per standing orders). Focus,
chosen by the user via AskUserQuestion: **the design-backlog P1s** from the
session-002 audit/critique re-runs.

## What shipped

Developed on `claude/supastrength-kickoff-veem2a`; **everything merged to
`main`** during the session (fast-forwards, user-directed).

- `5b03ef1` Session 002b: kickoff — session folder + prompt log
- `67c49a5` Completion payoff sheet + hardened finish, audit P1s, 9997 view fix
- `8acc963` Close out part 1 — HANDOFF + session log
- `8c01885` Prompt log — merge request (first merge to main landed here)
- `fbd775c` **Design system v2: full visual teardown — "calibrated instrument"**
- (wrap commit) final handoff + session log

### Backlog items 1–6 — all DONE

1. **Completion payoff sheet (crit P1).** "Finish & lock" now opens a payoff
   sheet: sets / volume / duration stats, per-exercise best set + Epley e1RM,
   PR badge, and "Next time: X lb (±Δ)" from the engine. New pure module
   `src/features/session/summary.ts` (`summarizeSession`, `epleyE1rm` —
   matches the DB view's formula exactly, incl. no reps=1 special case) with
   **14 unit tests** in `tests/features/sessionSummary.test.ts`.
   `commitSessionProgression` returns `ProgressionOutcome[]`
   (`{exerciseId, fromLb, nextLb}`); `sessionsRepo.complete()` returns a
   `CompletionReport` (outcomes + all-time e1RM bests read post-completion).
2. **onComplete try/catch (crit P1).** Toast on failure, confirm sheet stays
   open, navigation only from the payoff sheet. The payoff renders *ahead of*
   the `status !== 'in_progress'` guard so a refetch can't unmount it.
3. **`.linkbtn` 44 px tap target** — `min-height: 44px; display: inline-flex`,
   all five call sites (AuthScreen ×2, two builder card-actions, measurements
   Edit) checked by the review's a11y lens.
4. **`aria-pressed` + Check icon** on the secondary-muscle chips.
5. **Dead `.setrow--done` rule deleted** (`pop` keyframes kept — `.logbtn`).
6. **DESIGN.md motion drift reconciled** — the Home lobby entrance is now a
   documented, sanctioned exception (kept the shipped motion; amended the doc).

### Adversarial review → fixes (the important part)

Ran a 31-agent review workflow (4 lenses → findings → 3 skeptics each,
majority rules). 6 confirmed, 1 empirically refuted. Fixed all confirmed:

- **[P1] Retry of `complete()` double-advanced progression + rotations.**
  The status flip is now a **compare-and-swap run FIRST**
  (`update sessions … where id=? and status='in_progress'`; 0 rows → no-op
  report). Verified the CAS + trigger interaction on real PG16: first flip
  updates 1 row, retry updates 0 rows and does **not** raise. Trade-off is
  documented in the code: post-flip failure loses that session's advance
  (weight holds — safe) rather than doubling it.
- **[P2] Completion raced in-flight set-log writes** (fire-and-forget
  `update.mutate`). onComplete now waits up to 6 s on
  `queryClient.isMutating()` before completing.
- **[P3] Delta semantics**: `fromLb` = pre-advance weight line (not lifted
  max), so an input-override doesn't flip the direction color.
- **[P3] Phantom-set PRs**: **`supabase/migrations/9997_e1rm_completed_sets_only.sql`**
  gates `est_1rm_lb` on `is_completed`. Validated on local PG16 (stubs +
  fixture: un-completed 315×5 no longer beats completed 225×5; ran twice →
  re-runnable). **User must paste it into the SQL Editor.**
- **[P3] Payoff numerals** on `--font-num`/`--tnum`.
- Refuted: `.payoff__stats` overflow at 320 px (measured fine with real fonts).

### Verification

- typecheck / lint / build green; **83 tests** (69 → 83).
- Payoff sheet rendered via headless Chromium in both themes at 390/320 px
  panel widths; screenshots sent to the user. (Note: this container's Chromium
  ignores `--window-size` for layout — emulate widths via a `max-width`
  override on the panel, not the window.)
- Local PG16 harness: `su postgres`, cluster under `/var/lib/postgresql`,
  Supabase stubs (auth.uid GUC, storage schema, roles) — same approach as
  earlier sessions; nothing committed, rebuilt ad hoc.

## Directional decisions

- **PR badge definition:** computed **post-completion** against
  `v_exercise_e1rm` (which then includes today), so "ties-or-beats all-time"
  ⇒ record. A first-ever exercise counts as a PR (accepted; can't distinguish
  cheaply, and it's technically true).
- **Payoff delta is engine-truth** (next vs pre-advance line), not
  experience-relative (next vs lifted). Chosen after the review confirmed the
  mislabeling corner case.
- **CAS-first completion** accepted the "lost advance on post-flip failure"
  trade-off over double-advance corruption.
- Kept the Home entrance animation; DESIGN.md amended instead.

## Open questions / next step

1. **Live smoke-test is still the operational gate** (unchanged from HANDOFF) —
   plus the new **9997 paste**. The payoff sheet + CAS flow have never run
   against the live project.
2. Remaining design backlog: the audit/crit **P2s** (see HANDOFF list).
3. **Decide:** should `v_muscle_volume_weekly` also exclude un-completed sets'
   tonnage/reps (same phantom family)? Deliberate analytics-semantics change —
   left untouched.
4. ~~Merge `claude/supastrength-kickoff-veem2a` → `main`~~ — DONE during the
   session (user authorized direct pushes to `main`; branch and `main` are in
   sync at wrap).

## Project notes for future sessions

- `noUncheckedIndexedAccess` is ON for tests — index into arrays via a helper
  or `!`.
- This container needs `npm ci` at session start (fresh clone, no
  node_modules) and has no `.env` — live-DB work needs the user's
  `VITE_SUPABASE_URL`/anon key.
- Next migration number: **9996**.

---

# Part 2 — full visual teardown → design system v2 ("calibrated instrument")

User directive mid-session: tear the entire visual design down and rebuild —
clean, professional, sharp corners, "not something stupid vibe coded"; merge
directly to main for the rest of the session.

## What shipped

- **v2 design system** replacing the v1 "bold high-energy electric-indigo,
  rounded, dark-gym" look (which was itself the workout-app category reflex):
  - True-neutral chassis: light = pure white `oklch(1 0 0)`, dark = graphite;
    chroma 0 throughout — the identity lives in ink + amber + mono, not the
    surface tint.
  - Primary actions are **ink keys** (new `--action`/`--on-action`/
    `--action-hover` tokens); `--accent` is now an **amber signal lamp**
    (bronze in light for AA text) used ONLY for live + selected state.
  - **JetBrains Mono on every numeral** (`--font-num`), Inter-only UI.
    Archivo/Oswald/Space-Grotesk deps removed.
  - **Radius 0 everywhere** (tokens kept, zeroed), hairline 1px borders,
    `--shadow: none`, backdrop-blur glass removed, gradients flattened,
    square switch knob / lamps / badges. Favicon + PWA colors updated.
- **Verification:** palette locked by a WCAG script (38 pairs, both themes,
  all ≥4.5:1 text / ≥3:1 UI); `impeccable` detect.mjs = 0 findings; static
  previews screenshotted in both themes at 390px.
- **Adversarial review** (3 parallel lenses: token drift / layout fallout /
  craft+slop) returned 22 findings; all fixed, headliners:
  - Amber had leaked onto static UI (radar fill, std gauge, freq counts,
    badges, info banners, std-band ladder, links, taxonomy chips) → data marks
    are ink, labels neutral, `.badge--live` added for active/next; the
    novice-vs-advanced band collision resolved by making the ladder neutral
    (position is read off the gauge).
  - Sticky `.sprogress` was sliced under the now-opaque appbar → offset is now
    `max(12px, env(safe-area-inset-top)) + 57px` (exact appbar height).
  - Mono digits are ~8% wider: rest timer lost its stale 96px min-width and
    wraps; payoff stats row wraps at 320px; plate chips + progress counters +
    payoff deltas brought onto the mono system.
  - Switch knob re-machined (16px + 1px edge = exact 2px inset; was
    overhanging its track at dpr≥2 once squared); skeletons squared (radius
    lived in TSX inline styles); input focus unified to the crisp amber edge;
    top/bottom chrome unified on `--bg`; spinner squared.
- DESIGN.md fully rewritten for v2; PRODUCT.md personality/anti-refs updated
  (rounded "bubble gum" styling is now an explicit anti-reference).
- typecheck / lint / build / 83 tests green; committed straight to main
  (user-authorized).

## Notes for next session

- The old audit (15/20) and critique (31/40) scored v1 — **re-run both against
  v2** when design work resumes.
- The `.impeccable/` critique snapshots and older session screenshots show v1.
- Live smoke-test gate unchanged (plus the 9997 paste).
