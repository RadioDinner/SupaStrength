# SupaStrength

Personalized strength-training tracker. **Web app first** (mobile-web / PWA),
offline + Android later.

- **Stack:** Vite + React + TypeScript SPA → Vercel · Supabase (Postgres / Auth /
  Storage / RLS).
- **Source of truth:** `docs/SPEC.md` → `docs/DATA_MODEL.md` →
  `docs/BUILD_PLAN.md`. Cross-session state in `HANDOFF.md`.

## Local development

```bash
nvm use            # Node 22 (see .nvmrc)
npm install
cp .env.example .env.local   # fill in Supabase URL + anon key
npm run dev
```

Scripts: `npm run dev` · `npm run build` · `npm run preview` · `npm run typecheck`
· `npm run lint` · `npm run format`.

## Environment variables

| Var | Where to get it | Notes |
| --- | --- | --- |
| `VITE_SUPABASE_URL` | Supabase → Project Settings → API | Public |
| `VITE_SUPABASE_ANON_KEY` | Supabase → Project Settings → API | Public anon key only — **never** the service-role key |

Vite inlines `VITE_*` at **build** time, so these must be set wherever the app
is built (locally and in Vercel). If you add them in Vercel after a deploy,
trigger a redeploy.

## Deploy to Vercel

1. **Push to GitHub** (already on `main`).
2. In Vercel → **Add New… → Project** → import the `SupaStrength` repo.
3. Framework preset auto-detects **Vite** (build `npm run build`, output `dist`).
4. Add the two env vars above under **Environment Variables** (Production +
   Preview).
5. **Deploy.** Pushes to `main` ship to production; PRs get preview URLs.

## Supabase setup

1. Create a Supabase project; copy the URL + anon key into Vercel + `.env.local`.
2. Open the **SQL Editor**, paste `supabase/migrations/9999_init.sql`, run it.
   It is re-runnable, so it's safe to run again.
3. **Auth → URL Configuration** (so magic-link / confirmation emails return to the
   app instead of the default `http://localhost:3000`):
   - **Site URL:** your primary app URL — `http://localhost:3000` for local dev
     (`npm run dev` now serves on :3000), or your Vercel domain in production.
   - **Redirect URLs:** add every origin you'll sign in from, e.g.
     `http://localhost:3000/**` and `https://<your-app>.vercel.app/**`.
   The app passes `emailRedirectTo = window.location.origin`, so the link returns
   to wherever you launched it — as long as that origin is in this allowlist.
   For a single-user personal app you can also just turn **off** "Confirm email"
   (Auth → Providers → Email) and use password sign-in.
4. Seed data (exercise library, strength standards) lands later via
   `supabase/seed/` (see `BUILD_PLAN.md` M2).

When configured, the home screen shows **"Connected ✓ — schema live"** with the
seeded muscle-group count.

## Project layout

See `docs/BUILD_PLAN.md` §0.1. Key rule: UI/features never import
`src/lib/supabase` directly — they go through `src/data` (the repo layer / seam)
so a local-first store can slot in for Phase-2 offline.
