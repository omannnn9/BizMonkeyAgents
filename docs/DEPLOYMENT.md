# Deployment

## Current state

**A live Supabase project exists** (`od-cortex`, org `omanronaldo7@gmail.com's Org`,
free tier). All 11 migrations are applied, in order, and the founder
identity is seeded — see [`DATA_MODEL.md`](./DATA_MODEL.md) for the schema
and [`ARCHITECTURE.md`](./ARCHITECTURE.md) for the LLM/embeddings providers
(Groq, Voyage — both genuinely free, no card required). Demo mode has been
removed: the app always talks to the real stack now, there is no fixture
fallback.

**Not yet done:** the app has not been deployed anywhere with public
internet access (no Vercel project imported yet — see below), and it has
not been exercised end-to-end from a real browser, because the development
environment used to build this has an outbound network policy that blocks
direct HTTPS to `*.supabase.co`, `api.groq.com`, and `api.voyageai.com` (a
403 on every CONNECT through its proxy — confirmed, not a bug). The
Supabase MCP tool could still apply migrations and run SQL because it
operates on a separate channel outside that sandbox's network policy; the
app's own runtime cannot. First real end-to-end verification (a real chat
message actually producing a real agent reply, a real document upload
actually getting embedded) needs to happen either on Vercel or on a machine
with unrestricted outbound access.

## Setting up Supabase (already done for the live project — for reference / a fresh project)

1. Create a Supabase project.
2. Apply every migration in `supabase/migrations/`, in numeric order
   (`0001_init.sql` through `0011_seed_founder.sql`) — via the Supabase CLI
   (`supabase db push`), the Supabase MCP's `apply_migration`, or pasted
   into the SQL editor in order. `0001` needs the `pgcrypto`, `vector`, and
   `pg_cron` extensions; it creates them itself.
3. Run `npm run seed:founder` (needs `NEXT_PUBLIC_SUPABASE_URL` and
   `SUPABASE_SERVICE_ROLE_KEY` set locally, e.g. in `.env.local`) to create
   the single `auth.users` row and grant it `controls_approvals` membership
   across all 4 companies. Optionally set `FOUNDER_EMAIL` first — it's just
   a label for your own reference in the Supabase dashboard's user list,
   never used to sign in anywhere (there is no login UI). Idempotent, safe
   to re-run — if it's already been done (as it has for the live project,
   via `0011_seed_founder.sql`'s direct SQL insert), it no-ops.
4. (Optional) Deploy the daily-briefing Edge Function:
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
| `NEXT_PUBLIC_SUPABASE_URL` | Everything | Safe to expose — just the project endpoint. |
| `SUPABASE_SERVICE_ROLE_KEY` | Everything | **Must never reach the browser.** Every data-touching route is server-side only. |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | `npm run test:rls` only | The app itself never uses the anon key. |
| `GROQ_API_KEY` | Any real agent turn, auto-tagging, the daily briefing | Server-only. Free self-serve tier, no card required. |
| `VOYAGE_API_KEY` | Document embedding, memory/document search | Server-only. Free tier, 200M tokens, no card required. |
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

## Post-deploy checklist

- [x] All 11 migrations applied, in order.
- [x] `npm run seed:founder` run once (via direct SQL, see `0011_seed_founder.sql`).
- [ ] `npm run test:rls` passes (defense-in-depth verification) — needs a
      network-unrestricted environment.
- [ ] `npm run test:prompt-injection` passes against a real model call.
- [ ] `npm run test:agent-scenarios` passes against real model calls.
- [ ] Manually walk the cockpit: switch companies, upload a document and
      ask an agent about it, ask an agent to draft an email and confirm it
      lands in Approvals (not sent), try the agent switcher across the
      20-agent roster (see [`AGENTS_AND_TOOLS.md`](./AGENTS_AND_TOOLS.md)).
- [ ] Decide whether to finish any of the three integration stubs
      (Gmail/Apollo.io/Higgsfield) — see
      [`AGENTS_AND_TOOLS.md`](./AGENTS_AND_TOOLS.md#integration-stubs).
- [ ] Optionally deploy and schedule the daily-briefing Edge Function.
- [ ] Write real e2e specs (`tests/e2e/` is currently empty — see
      [`TESTING.md`](./TESTING.md#why-the-e2e-suite-was-retired)) once a
      network-unrestricted CI runner or dev machine is available.
