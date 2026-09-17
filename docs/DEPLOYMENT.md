# Deployment

## Current state

**No live Supabase project exists yet.** The app builds clean and runs
fully in [demo mode](./ARCHITECTURE.md#demo-mode) without one, so it's safe
to deploy before the backend is ready — nothing will actually work (every
API route returns fixture data) until the env vars below are set, but
nothing will error either. Deploying now is a reasonable way to review the
UI on a real URL before wiring up the database.

## Setting up Supabase

1. Create a Supabase project.
2. Apply every migration in `supabase/migrations/`, in numeric order
   (`0001_init.sql` through `0006_synergy_detection.sql`) — via the
   Supabase CLI (`supabase db push`) or pasted into the SQL editor in
   order. `0001` needs the `pgcrypto`, `vector`, and `pg_cron` extensions;
   it creates them itself.
3. Run `npm run seed:founder` (needs `NEXT_PUBLIC_SUPABASE_URL` and
   `SUPABASE_SERVICE_ROLE_KEY` set locally, e.g. in `.env.local`) to create
   the single `auth.users` row and grant it `controls_approvals` membership
   across all 4 companies. Optionally set `FOUNDER_EMAIL` first — it's just
   a label for your own reference in the Supabase dashboard's user list,
   never used to sign in anywhere (there is no login UI).
4. (Optional, once real credentials exist) Deploy the daily-briefing Edge
   Function:
   ```
   supabase functions deploy daily-briefing
   supabase secrets set GROQ_API_KEY=...
   ```
   Then fill in `<PROJECT_REF>` and store the service-role key in Vault
   (Supabase Dashboard → Project Settings → Vault, or
   `select vault.create_secret('<service-role-key>', 'service_role_key')`),
   and re-run the commented-out `pg_cron` block at the bottom of
   `0004_phase2.sql` to schedule it daily at 06:00 UTC. It's left commented
   in the migration so applying that file elsewhere doesn't silently try to
   schedule a job against a placeholder URL.

## Environment variables

See `.env.local.example` for the authoritative list. Summary:

| Variable | Required for | Notes |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Leaving demo mode | Safe to expose — just the project endpoint. |
| `SUPABASE_SERVICE_ROLE_KEY` | Leaving demo mode | **Must never reach the browser.** Every data-touching route is server-side only. |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | `npm run test:rls` only | The app itself never uses the anon key. |
| `GROQ_API_KEY` | Any real agent turn, auto-tagging, the daily briefing | Server-only. Free self-serve tier, no card required. |
| `VOYAGE_API_KEY` | Document embedding, memory/document search | Server-only. |
| `SENTRY_DSN` / `NEXT_PUBLIC_SENTRY_DSN` | Error reporting | Not secret — already filled in in `.env.local.example` (org `odax`, project `od-group-cockpit`). |

Once Gmail/Apollo.io/Higgsfield are actually connected (see
[`AGENTS_AND_TOOLS.md`](./AGENTS_AND_TOOLS.md#integration-stubs)), each will
need its own server-side API key added here and to `lib/integrations/*.ts`.

## Deploying to Vercel

1. Go to [vercel.com/new](https://vercel.com/new) and import
   `omannnn9/BizMonkeyAgents`. Vercel auto-detects Next.js — no build
   config changes needed.
2. In the new project's Settings → Environment Variables, add every key
   above except `NEXT_PUBLIC_SUPABASE_ANON_KEY` (only needed for the local
   RLS test script, never at runtime).
3. Redeploy (or it deploys automatically once the repo is imported and vars
   are set).

Sentry is already wired in (`instrumentation.ts`, `instrumentation-client.ts`,
`sentry.server.config.ts`, `sentry.edge.config.ts`, `app/global-error.tsx`) —
there's no source-map upload yet (needs a `SENTRY_AUTH_TOKEN` nobody's
generated), but error capture itself doesn't need it and works from the
first deployment.

## Once deployed

**Treat the URL as sensitive.** There is no login (see
[`ARCHITECTURE.md`](./ARCHITECTURE.md#no-login-by-design)) — anyone with the
URL has full read/write access to every company's data. Keeping the URL
private is the actual production security boundary, not RLS.

## Post-deploy checklist (once a Supabase project exists)

- [ ] All 6 migrations applied, in order.
- [ ] `npm run seed:founder` run once.
- [ ] `npm run test:rls` passes (defense-in-depth verification).
- [ ] `npm run test:prompt-injection` passes against a real model call.
- [ ] `npm run test:agent-scenarios` passes against real model calls.
- [ ] Manually walk the cockpit: switch companies, upload a document and
      ask an agent about it, ask an agent to draft an email and confirm it
      lands in Approvals (not sent), try the agent switcher on ODAX
      (Sales/Marketing) and OD Holdings (Group CFO/Group Strategy).
- [ ] Decide whether to finish any of the three integration stubs
      (Gmail/Apollo.io/Higgsfield) — see
      [`AGENTS_AND_TOOLS.md`](./AGENTS_AND_TOOLS.md#integration-stubs).
- [ ] Optionally deploy and schedule the daily-briefing Edge Function.
