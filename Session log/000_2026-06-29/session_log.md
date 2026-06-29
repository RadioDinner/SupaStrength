# Session 000 — 2026-06-29

## What shipped

- `7592ca0` — Add new_session_instructions standing orders and CLAUDE.md
  (session 000). Created `new_session_instructions.md`, `CLAUDE.md` (imports
  the instructions + quick-reference summary), and started the `Session log/`
  convention with `000_2026-06-29/prompt_history.txt`.
- `session_log.md` (this file) committed to close out the session.

## Directional decisions

- This is the bootstrap session ("session 000"). The repo started completely
  empty — no commits on the local branch or the remote.
- Per the user's explicit instruction, work this session is committed to
  `main` (created here as the repo's first branch), overriding the default
  feature-branch convention for this session only.
- `CLAUDE.md` imports `new_session_instructions.md` via `@`-import so the
  standing orders load automatically every session, with a distilled
  quick-reference section in `CLAUDE.md` itself.

## Open questions / next step

- No `HANDOFF.md` exists yet — create one when actual project work begins.
- No `supabase/migrations/` directory yet; the descending-numbering rule
  (`9999_init.sql` and counting down, re-runnable migrations) applies once the
  Supabase schema work starts.
- Next session: pick up actual SupaStrength application/schema work and start
  folder `001_<date>`.

## Project notes for future-me

- Standing orders are authoritative in `new_session_instructions.md`; update
  that file directly when the user says "update new_session_instructions" and
  mirror default-behavior changes into `CLAUDE.md`.
- Migrations are pasted into the Supabase SQL Editor by hand — every migration
  must be re-runnable.
