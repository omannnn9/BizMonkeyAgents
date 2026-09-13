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

**Phase 1** (one CEO agent, cockpit UI, approval gate, audit log), **Phase 2** (Sales/Marketing
department agents, the knowledge-graph view, scheduled briefings), **Phase 3** (Tablo/NOVA onboarded
the same way, group-scope agents, memory promotion, company/agent creator wizards, OKRs/board-report
generation), a scoped-down **Phase 4** (a 3D preview at `/hq`, since retired — see below), and
**Phase 5** (the pixel-art `/office` view that replaced it) are all built — everything that doesn't
require a live Supabase project passes `npm run build` / `npm run lint`. **Nothing has been applied
to a live database or run end-to-end yet** — that's blocked on a Supabase project existing (see
below). Until then, treat the agents' tool behavior as reviewed-but-unverified, not tested. `/office`'s
layout (no redirect, no login) was visually verified in a real browser with placeholder Supabase
credentials, including a real headless-browser screenshot confirming the tileset and sprites actually
render (not just that the canvas element mounts) — the actual data-bearing pages weren't fully
exercised, since that needs a real database.

**On Phase 5 (`/office`) specifically:** the 3D `/hq` view from Phase 4 was retired outright rather
than iterated on — it was real-data-driven but visually read as a tech demo (a stock rigged humanoid
on plain platforms), and the app had sprawled into nine equal-weight nav destinations that read as an
admin panel rather than an "ecosystem." `/office` replaces `/hq`, `/map`, and `/dashboard` as the new
home view: one canvas, each company as its own room, each agent a small pixel-art sprite. It's a
pure rendering/navigation change — `/api/map` (extended additively with `lastRunStatus` and
`hasPendingApproval`), `/api/dashboard`, `/api/activity`, `/api/approvals`, and `useCompany()` are
all reused as-is, not rebuilt. Rendered with a small hand-rolled Canvas 2D renderer
(`components/OfficeScene.tsx`) — no new runtime dependency, same preference this project already had
for hand-rolling small renderers (`lib/graph-layout.ts`'s force layout) over pulling in a library.
Room/agent placement is a deterministic grid (`lib/office-layout.ts`), not a physics simulation —
company areas need to read as distinct rooms, not a floating network.

Tiles and character sprites are Kenney's **RPG Urban Pack** (CC0 1.0 Universal — see
`public/sprites/office-tilemap.LICENSE.md`), sourced from a public mirror since kenney.nl/itch.io
weren't reachable from this build sandbox; license independently confirmed via a second public
source before use. Each agent sprite's visual state is a pure function of real rows, checked in this
order: **working** (blue — this browser has a chat request in flight to that agent right now; the one
state that is deliberately client-side-only, since no data anywhere records "an agent is mid-turn" —
`agent_runs` rows are written only after a turn completes, so there is nothing durable to poll for
this), **error** (red — the agent's last run failed), **needs-approval** (amber — a pending row in
`approvals`), **delivering** (green — a successful run in roughly the last two minutes), else idle.
Nothing here is a decorative animation that isn't gated by one of those checks; the only ambient
motion is a shared idle sprite-frame bob, the same category as `/map`'s old idle-breathing nodes —
cosmetic life, never itself a claim about a real event.

`/graph`, `/documents`, `/memories`, `/activity`, and `/approvals` remain full pages, reachable from
a "More" section in the sidebar rather than sitting as equal-weight items next to Office/Chat.
Clicking a company's room calls the same `setActiveCompanyId()` the header's company switcher
already used (both stay in sync); clicking an agent's sprite opens an overlay with its chat
(`components/AgentChatPanel.tsx`, extracted out of `/chat` so there's one chat implementation, not
two — `/chat` uses the same component), recent runs, and pending approvals, without navigating away
from the scene.

One deliberate deviation from the architecture doc, carried over unchanged from the old `/map`:
`/office` polls `/api/map` on an interval instead of subscribing to Supabase Realtime. There's no
browser-side Supabase client anywhere in this app by design (no login — the service role key must
never reach the browser), and Realtime needs exactly that; even the anon key would see nothing,
since RLS is keyed on `auth.uid()`, which is always null with no session. Polling is "near-live," not
literally push-driven, but it's consistent with the no-login decision rather than quietly reopening
it.

Known stubs — each fails loudly with a clear "not connected" error instead of pretending to act,
same pattern throughout:
- `lib/integrations/gmail.ts` — Gmail isn't connected for this app yet.
- `lib/integrations/apollo.ts` — Apollo.io isn't connected, **and** the real OSL lead database/
  scoring model hasn't been wired in (held off deliberately rather than inventing a placeholder —
  connect the real one when ready). There is no `leads` table in this schema yet for the same reason.
- `lib/integrations/higgsfield.ts` — Higgsfield isn't connected for this app yet.
- `supabase/functions/daily-briefing/` — written, but not deployed; needs a live Supabase project
  and the `pg_cron` schedule in `supabase/migrations/0004_phase2.sql` filled in and un-commented.

Note on the three integrations above: each is connected as an MCP server in the *Claude Code
session* that built this app, but that connection isn't reachable by the *deployed app* at runtime —
the app needs its own API key for each, same as Gmail. Approving an `enrich_lead` or
`generate_creative_asset` action does attempt real execution against these stubs (same as
`send_email`) and records the resulting failure — it was never silently skipped.

Also fixed this pass: a real race condition in `documents`, `approvals`, and `memories` — a slow,
now-stale fetch for the previously active company could resolve after a fast company switch and
clobber the new company's already-rendered data. All three now guard against it (`/api/dashboard`'s
consumer and `activity` already did).

**Document parsing now includes PDF and DOCX**, not just plain text/Markdown/CSV — `pdfjs-dist`
(its Node/legacy build, text-extraction only, so it never touches its own optional
`@napi-rs/canvas` native dependency) for PDF, `mammoth` (pure JS) for DOCX. Both were verified
against real hand-built test files before being wired in, not just assumed to work from the docs —
extraction of a real PDF/DOCX has NOT been verified end-to-end through the actual upload route yet,
since that needs a live Supabase project the same as every other document-upload path.

**Cross-company synergy detection** (`detect_synergies`, granted to Group CFO/Group Strategy) is a
plainly-scoped heuristic — memories that read similarly across two different companies, via
embedding cosine similarity already computed for every memory, nothing more. It's presented as
candidates worth a look, never as a claim of deeper pattern-mining intelligence, since that's honestly
all it is. Building it surfaced a real gap from Phase 3: Group CFO and Group Strategy had never been
added to demo mode, so they were unreachable in the frontend preview this whole time — fixed
alongside this feature.

## One-time setup

1. **Create a Supabase project** (new, dedicated — don't reuse another project's database) and
   note its project ref, URL, and service role key.
2. Copy `.env.local.example` to `.env.local` and fill in:
   - `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`
   - `ANTHROPIC_API_KEY`
   - `VOYAGE_API_KEY` (free tier at voyageai.com)
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` only if you want to run `test:rls` (the app itself never uses it)
3. Apply the migrations in order, via the Supabase MCP's `apply_migration` (or the Supabase CLI /
   SQL editor): `0001_init.sql`, `0002_seed_companies.sql`, `0003_storage.sql`, `0004_phase2.sql`,
   `0005_phase3.sql`, `0006_synergy_detection.sql`. `0004_phase2.sql` seeds the Sales and Marketing
   agents under ODAX and some structural knowledge-graph edges; its `pg_cron` block at the bottom is
   commented out — see the comment inside it for how to wire up the daily briefing once this
   project's ref and service role key are known. `0005_phase3.sql` mirrors that pattern for Tablo and
   NOVA, adds the two group-scope agents (Group CFO, Group Strategy) at OD Holdings, and adds the
   `goals` table. `0006_synergy_detection.sql` adds the cross-company similarity RPC and grants
   `detect_synergies` to the two group-scope agents.
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
7. `npm run dev` and walk the cockpit yourself: switch companies, upload a doc (`.txt`/`.md`/`.csv`/
   `.pdf`/`.docx` all work now) and ask the agent about it, ask it to draft an email and confirm it
   shows up in Approvals (not sent). On ODAX, Tablo, or NOVA, try the agent switcher in `/chat` —
   Sales and Marketing agents propose `enrich_lead` / `generate_creative_asset` the same
   approval-gated way, then fail loudly since those integrations aren't connected. At OD Holdings,
   try Group CFO / Group Strategy — ask for a board report, or whether there are any cross-company
   synergies worth flagging. `/office` (the home page) is the pixel-art view of all of this at
   once — click a company's room to focus it, click an agent's sprite to open its chat/runs/
   approvals overlay. Check `/graph` for the full relationship explorer. Visit `/memories` and
   promote a company-scope memory to group. Try `/companies/new` and `/agents/new`.

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
| `npm run test:agent-scenarios` | Scripted tool-call-shape checks (not wording) for the CEO, Sales, Marketing, and Group CFO agents — including promote_memory, generate_board_report, and detect_synergies. |
| `npm run test:e2e` | Real Playwright suite (`tests/e2e/`) against demo mode — 54 checks across the `/office` pixel-art view (canvas render, company-room focus, agent-sprite overlay), chat (incl. both agent switchers), documents, activity, approvals, the knowledge graph, memories, the creator wizards, navigation, and mobile responsiveness. Runs and passes right now, no Supabase needed. Does NOT verify real data flows (RLS, real agent responses, real approvals, real PDF/DOCX extraction) — those need the scripts above against a live project. |

## What's genuinely not built yet

Project-scope agents in practice (the schema supports them; nothing creates one). Also still
pending: the real OSL lead database/scoring model, real API keys for Gmail/Apollo.io/Higgsfield,
actually deploying the daily-briefing Edge Function + its `pg_cron` schedule, and end-to-end
verification of real PDF/DOCX extraction through the live upload route (see "Status" above) — all
blocked on a live Supabase project and/or real credentials, not on any unwritten code.
