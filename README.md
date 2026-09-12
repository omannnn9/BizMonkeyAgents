# OD Group Cockpit

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

**Phase 1** (one CEO agent, cockpit UI, approval gate, audit log) and **Phase 2** (Sales/Marketing
department agents, the knowledge-graph view, scheduled briefings) are both built — everything that
doesn't require a live Supabase project passes `npm run build` / `npm run lint`. **Nothing has been
applied to a live database or run end-to-end yet** — that's blocked on a Supabase project existing
(see below). Until then, treat the agents' tool behavior as reviewed-but-unverified, not tested.
`/dashboard`'s layout (no redirect, no login) was visually verified in a real browser with
placeholder Supabase credentials; the actual data-bearing pages weren't, since that needs a real
database.

Known stubs — each fails loudly with a clear "not connected" error instead of pretending to act,
same pattern throughout:
- `lib/integrations/gmail.ts` — Gmail isn't connected for this app yet.
- `lib/integrations/apollo.ts` — Apollo.io isn't connected, **and** the real OSL lead database/
  scoring model hasn't been wired in (held off deliberately rather than inventing a placeholder —
  connect the real one when ready). There is no `leads` table in this schema yet for the same reason.
- `lib/integrations/higgsfield.ts` — Higgsfield isn't connected for this app yet.
- `supabase/functions/daily-briefing/` — written, but not deployed; needs a live Supabase project
  and the `pg_cron` schedule in `supabase/migrations/0004_phase2.sql` filled in and un-commented.

Note on these three: each is connected as an MCP server in the *Claude Code session* that built this
app, but that connection isn't reachable by the *deployed app* at runtime — the app needs its own
API key for each, same as Gmail.

## One-time setup

1. **Create a Supabase project** (new, dedicated — don't reuse another project's database) and
   note its project ref, URL, and service role key.
2. Copy `.env.local.example` to `.env.local` and fill in:
   - `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`
   - `ANTHROPIC_API_KEY`
   - `VOYAGE_API_KEY` (free tier at voyageai.com)
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` only if you want to run `test:rls` (the app itself never uses it)
3. Apply the migrations in order, via the Supabase MCP's `apply_migration` (or the Supabase CLI /
   SQL editor): `0001_init.sql`, `0002_seed_companies.sql`, `0003_storage.sql`, `0004_phase2.sql`.
   `0004_phase2.sql` seeds the Sales and Marketing agents under ODAX and some structural knowledge-
   graph edges; its `pg_cron` block at the bottom is commented out — see the comment inside it for
   how to wire up the daily briefing once this project's ref and service role key are known.
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
   agent about it, ask it to draft an email and confirm it shows up in Approvals (not sent). On
   ODAX, try the agent switcher in `/chat` — Sales and Marketing agents propose `enrich_lead` /
   `generate_creative_asset` the same approval-gated way, then fail loudly since those integrations
   aren't connected. Check `/graph` for the seeded structural relationships.

## Deploying

The app builds clean and doesn't crash on missing config, so it's safe to deploy before the
Supabase project is ready — nothing will actually work until the env vars below are set, but it
won't error either. **Once deployed, treat the URL as sensitive** — there's no login (see above).

1. Go to [vercel.com/new](https://vercel.com/new) and import `omannnn9/BizMonkeyAgents`. Vercel
   auto-detects Next.js; no build config changes needed. (The Vercel MCP connector available in
   this session could create a project but not deploy to it or read it back — a permissions
   limitation on that connector, not the code — so this is a manual step for now.)
2. In the new project's Settings → Environment Variables, add the same keys as `.env.local.example`
   (`NEXT_PUBLIC_SUPABASE_ANON_KEY` isn't needed here — it's only for the local RLS test). Sentry's
   `SENTRY_DSN`/`NEXT_PUBLIC_SENTRY_DSN` are already filled in in the example file — they're not
   secret — so error reporting works from the first deployment.
3. Redeploy (or it'll deploy automatically once the repo is imported and vars are set).

Sentry is already wired in (`instrumentation.ts`, `instrumentation-client.ts`, `sentry.*.config.ts`,
`app/global-error.tsx`, org `odax` / project `od-group-cockpit`) — no source-map upload yet, since
that needs a `SENTRY_AUTH_TOKEN` nobody's generated; error capture itself doesn't need it.

## Scripts

| Script | What it does |
|---|---|
| `npm run seed:founder` | Creates the one auth.users row (no login involved) and grants it membership + controls_approvals across all 4 companies. Run this first. |
| `npm run test:rls` | RLS defense-in-depth check for the anon key (the app itself doesn't use it — see "No login" above). |
| `npm run test:prompt-injection` | Seeds a document with an embedded fake instruction, asserts the agent reports rather than obeys it. |
| `npm run test:agent-scenarios` | Scripted tool-call-shape checks (not wording) for the CEO, Sales, and Marketing agents. |
| `npm run test:e2e` | Real Playwright suite (`tests/e2e/`) against demo mode — 44 checks across dashboard, chat (incl. the agent switcher), documents, activity, approvals, the knowledge graph, navigation, and mobile responsiveness. Runs and passes right now, no Supabase needed. Does NOT verify real data flows (RLS, real agent responses, real approvals) — those need the scripts above against a live project. |

## What's genuinely not built yet

PDF/DOCX document parsing (text/markdown/CSV only), group-scope/project-scope agents in practice
(the schema supports them; nothing creates one), Tablo/NOVA as fully onboarded companies with their
own department agents, memory promotion between companies, the Part 9 animated "living system" map
(distinct from the Part 8 knowledge-graph explorer, which is built), OKRs/board-report generation,
company/agent creator wizards, and the literal 3D headquarters (Phase 4, conditional) — see the
architecture doc's Part 16 for the full phased roadmap. Also still pending: the real OSL lead
database/scoring model, and real API keys for Gmail/Apollo.io/Higgsfield (see "Status" above).
