// Edge Function: purge expired media (BUILD_PLAN M8).
//
// Calls the SECURITY DEFINER routine `purge_expired_media()` (granted to
// service_role) with the service-role key, deleting expired form-videos (30d)
// and progress photos (~1yr) — storage objects + rows.
//
// This is an ALTERNATIVE to the pg_cron schedule in
// supabase/migrations/9998_purge_media_cron.sql, for teams that prefer an HTTP
// entrypoint with external observability. Deploy + schedule:
//   supabase functions deploy purge-media --no-verify-jwt
//   # then add a daily schedule (Dashboard → Edge Functions → Schedules),
//   # or invoke from pg_cron via net.http_post.
//
// Protect it with a shared secret: set PURGE_SECRET in the function's env and
// send it as the `x-purge-secret` header. Runs on Deno (Supabase Edge runtime),
// NOT bundled with the Vite app — eslint/tsc here are intentionally Deno-typed.
import { createClient } from 'jsr:@supabase/supabase-js@2'

Deno.serve(async (req: Request) => {
  const expected = Deno.env.get('PURGE_SECRET')
  if (expected && req.headers.get('x-purge-secret') !== expected) {
    return new Response('forbidden', { status: 403 })
  }

  const url = Deno.env.get('SUPABASE_URL')
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!url || !serviceKey) {
    return json({ ok: false, error: 'missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY' }, 500)
  }

  const supabase = createClient(url, serviceKey)
  const { error } = await supabase.rpc('purge_expired_media')
  if (error) return json({ ok: false, error: error.message }, 500)
  return json({ ok: true, purgedAt: new Date().toISOString() })
})

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}
