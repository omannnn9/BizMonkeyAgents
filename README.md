# OD Group Cockpit — Phase 1

Internal AI command center for OD Group (ODAX, Tablo, NOVA, OD Holdings). See the original build
prompt and architecture doc for full context; this README covers what exists and how to bring it
online.

## No login, by design

This is a single-user internal tool and there's no login screen — the app always talks to Supabase
server-side as the **service role key**, which bypasses Row-Level Security by design. That's a real
trade-off, made deliberately: anyone who has the deployed URL gets full read/write access (there's
no per-request identity check at all), and there's no DB-level isolation stopping one company's
data from mixing with another's within the app — the UI's company switcher is the only boundary.
RLS policies stay in the schema as defense-in-depth for the anon key (which the app itself never
uses), verified by `npm run test:rls`, but they are not what protects this app in production —
**keep the deployed URL private.**

There's still exactly one `auth.users` row (created by `npm run seed:founder`), purely to satisfy
foreign keys on `documents.uploaded_by`, `approvals.decided_by`, `audit_log.actor_id`, etc. — it's
never used to sign in anywhere.

## Demo mode

If `NEXT_PUBLIC_SUPABASE_URL` or `SUPABASE_SERVICE_ROLE_KEY` aren't set (e.g. before the Supabase
project exists yet), every page falls back to realistic mock data (`lib/demo-mode.ts`) instead of
erroring, with a persistent orange banner saying so — so the actual UI can be reviewed before the
backend is wired up. Nothing in demo mode is real or persists (approve/reject and upload just prove
the round-trip works); it disappears automatically the moment real env vars are set.

## Status

Everything that doesn't require a live Supabase project is built and passes `npm run build` /
`npm run lint`: schema + RLS, the CEO agent (Messages API + custom tool loop), the approval gate,
and the full cockpit UI. **Nothing has been applied to a live database or run end-to-end yet** —
that's blocked on a Supabase project existing (see below). Until then, treat the agent's tool
behavior as reviewed-but-unverified, not tested. `/dashboard`'s layout (no redirect, no login) was
visually verified in a real browser with placeholder Supabase credentials; the actual data-bearing
pages weren't, since that needs a real database.

Known stub: `lib/integrations/gmail.ts` — Gmail isn't connected yet, so approved email actions fail
loudly with a clear error instead of sending anything.

## One-time setup

1. **Create a Supabase project** (new, dedicated — don't reuse another project's database) and
   note its project ref, URL, and service role key.
2. Copy `.env.local.example` to `.env.local` and fill in:
   - `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`
   - `ANTHROPIC_API_KEY`
   - `VOYAGE_API_KEY` (free tier at voyageai.com)
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` only if you want to run `test:rls` (the app itself never uses it)
3. Apply the migrations in order, via the Supabase MCP's `apply_migration` (or the Supabase CLI /
   SQL editor): `supabase/migrations/0001_init.sql`, `0002_seed_companies.sql`, `0003_storage.sql`.
4. Seed the founder identity (creates the one `auth.users` row for FK purposes and grants it
   `controls_approvals` across all four companies — no login involved):
   ```
   npm run seed:founder
   ```
5. Optional but recommended: regenerate `lib/supabase/types.ts` from the real schema instead of the
   hand-written version here (`mcp__Supabase__generate_typescript_types`, or
   `supabase gen types typescript`).
6. Run the scripted tests:
   ```
   npm run test:rls               # defense-in-depth only, see "No login" above
   npm run test:prompt-injection
   npm run test:agent-scenarios
   ```
7. `npm run dev` and walk the cockpit yourself: switch companies, upload a `.txt` doc and ask the
   agent about it, ask it to draft an email and confirm it shows up in Approvals (not sent).

## Deploying

The app builds clean and doesn't crash on missing config, so it's safe to deploy before the
Supabase project is ready — nothing will actually work until the env vars below are set, but it
won't error either. **Once deployed, treat the URL as sensitive** — there's no login (see above).

1. Go to [vercel.com/new](https://vercel.com/new) and import `omannnn9/BizMonkeyAgents`. Vercel
   auto-detects Next.js; no build config changes needed. (The Vercel MCP connector available in
   this session could create a project but not deploy to it or read it back — a permissions
   limitation on that connector, not the code — so this is a manual step for now.)
2. In the new project's Settings → Environment Variables, add the same keys as `.env.local.example`
   (`NEXT_PUBLIC_SUPABASE_ANON_KEY` isn't needed here — it's only for the local RLS test).
3. Redeploy (or it'll deploy automatically once the repo is imported and vars are set).
4. Connect Sentry once that first deployment exists (the brief's own sequencing) and wire
   `@sentry/nextjs` in — not done yet, since there was no deployment to point it at.

## Scripts

| Script | What it does |
|---|---|
| `npm run seed:founder` | Creates the one auth.users row (no login involved) and grants it membership + controls_approvals across all 4 companies. Run this first. |
| `npm run test:rls` | RLS defense-in-depth check for the anon key (the app itself doesn't use it — see "No login" above). |
| `npm run test:prompt-injection` | Seeds a document with an embedded fake instruction, asserts the agent reports rather than obeys it. |
| `npm run test:agent-scenarios` | Scripted tool-call-shape checks (not wording) for the CEO agent. |

## What's genuinely not built yet (by design, out of Phase 1 scope)

Department agents beyond the single CEO agent, PDF/DOCX document parsing (text/markdown/CSV only),
the interactive knowledge-graph view, scheduled briefings, group-scope/project-scope agents in
practice (the schema supports them; nothing creates one), and anything from the roadmap's Phase
2-4 list.
