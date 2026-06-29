# CLAUDE.md

Project memory for SupaStrength. Loaded automatically at the start of every
session.

## Standing orders

The user's standing orders live in `new_session_instructions.md` and are
imported below so they load with this file every session. Treat them as a
living contract — re-read them at the start of each session.

@new_session_instructions.md

## Default behaviors (quick reference)

These are the load-time defaults distilled from the standing orders. The full
text in `new_session_instructions.md` is authoritative; this section is the
fast summary.

- **Session log folder.** At session start, create
  `Session log/NNN_<YYYY-MM-DD>/` (zero-padded, auto-incrementing). Append a
  letter suffix if today's folder already exists; never overwrite.
- **Prompt history.** Append every user prompt verbatim — with a
  `--- YYYY-MM-DD HH:MM ---` separator — to `prompt_history.txt` in the current
  session folder. No exceptions, including one-word replies.
- **End-of-session log.** Before the session ends, write `session_log.md` in
  the session folder (what shipped, decisions, open questions, project notes)
  and keep `HANDOFF.md` (repo-root, cross-session state) up to date.
- **Supabase migrations.** New files under `supabase/migrations/` use
  **descending** 4-digit numbering (`9999_init.sql`, then `9998_*`, `9997_*`,
  …) so the newest sorts to the top. Migrations are pasted into the Supabase
  SQL Editor by hand, so make every migration **re-runnable**
  (`drop ... if exists` before `create policy`/triggers/etc.).
- **Updating instructions.** When the user says "update
  new_session_instructions", edit `new_session_instructions.md` directly,
  commit on the current branch, and mirror any default-behavior change here.
