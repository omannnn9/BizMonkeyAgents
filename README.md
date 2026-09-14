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
generation), a scoped-down **Phase 4** (a 3D preview at `/hq`, since retired), a **Phase 5** 2D
pixel-art `/office` (also since retired — two visual passes, "Night Shift," both superseded), and
**Phase 6** (the current mission-control `/office`, described below) are all built — everything that
doesn't require a live Supabase project passes `npm run build` / `npm run lint`. **Nothing has been
applied to a live database or run end-to-end yet** — that's blocked on a Supabase project existing
(see below). Until then, treat the agents' tool behavior as reviewed-but-unverified, not tested.
`/office`'s layout (no redirect, no login) was visually verified in a real browser with placeholder
Supabase credentials, including real headless-browser screenshots confirming the 3D scene actually
renders and a full click-through (character click → agent overlay with real pending-approval and
run data) — the actual data-bearing pages weren't fully exercised, since that needs a real database.

**On Phase 6 (`/office`) specifically:** two prior visual passes at `/office` (a 2D pixel-art canvas,
then a "Night Shift" dark/glow re-theme of it) missed the actual target — the founder's reference
turned out to be a dense, multi-panel **mission-control app shell** with a real 3D viewport as its
centerpiece, not 2D pixel art at all. Rather than guess a third time, this pass started by pulling
real screenshots/source from five reference projects (`paulrobello/claude-office`,
`ColdSlither/pixel-agents`, `fakeminjun7321/pixel-office`, `naolnegassa/StarOffice-UI`, a16z's
AI Town), confirmed the structural read (left nav / 3D viewport / right activity feed / bottom
terminal strip, plus a category-button row and a separately-styled `/graph`) with the founder before
building anything, then built it. `/office` is now four zones:

- **Left nav** (`components/office3d/LeftNav.tsx`) — active company, a short "recent" list (reuses
  `/api/dashboard`'s existing `recentDecisions`), and links to Graph/Documents/Memories/Approvals/
  Chat — the real equivalents of the reference's generic Whiteboard/Design Board/Builder/Chats/
  Projects/Workflows labels, not those labels themselves.
- **3D viewport** (`components/office3d/OfficeScene3D.tsx`, `@react-three/fiber` + `@react-three/
  drei`) — each company a room, each agent a simple capsule-and-sphere figure in one flat, saturated
  color, seated at a box desk with a box monitor. `three`/`@react-three/fiber`/`@react-three/drei`
  were removed from this project twice before (once after the original `/hq`, again when 2D pixel
  art replaced it) specifically to avoid this dependency weight — reintroduced now only because the
  confirmed reference genuinely calls for real 3D depth, and only for simple primitives (no rigging,
  no custom modeling, no `OrbitControls` — a fixed camera frames the whole layout). Room/agent
  placement still comes from the same deterministic grid (`lib/office-layout.ts`, unchanged), just
  read as 3D world coordinates instead of canvas pixels. The monitor is real, not decorative: lit
  once an agent has ever produced a run. Each agent's state signal
  (`lib/agent-visual-state.ts`'s `deriveAgentState` — same logic as every visual pass before this
  one, untouched) is a glowing colored halo above the character's head — **working** (blue, in-flight
  chat request), **error** (red), **needs-approval** (amber), **delivering** (green, a successful run
  in the last two minutes), else idle and dimmed so it recedes. Clicking a room calls the same
  `setActiveCompanyId()` the header's company switcher already used; clicking a character opens the
  same `components/OfficeAgentPanel.tsx` overlay (chat, recent runs, pending approvals) every prior
  pass has used, unchanged.
- **Right activity feed** (`ActivityFeed.tsx`) — real `agent_runs.output` (the column existed since
  `0001_init.sql`, just never selected before `/api/activity/route.ts` picked it up here), attributed
  by agent name. An agent with no output yet shows its last real status, never invented dialogue.
- **Bottom terminal strip** (`TerminalStrip.tsx`) — the same `agent_runs`/`audit_log` rows the feed
  already fetches, re-presented as raw monospace log lines. No second data source.
- A **category row** below the viewport links to Documents/Memories/Graph/Approvals/+New company/+New
  agent — the reference's generic Applications/Automation/Shared Packages/Knowledge/Verification/
  Creative Assets row, remapped onto what this app actually has rather than inventing pages for
  labels with nothing real behind them.

The standalone `/activity` page is retired — its job is now this feed + terminal strip, the same
"fold into `/office`, keep the API route" pattern the old `/dashboard` and `/map` pages went through.
`CockpitShell`'s sidebar is suppressed specifically on `/office` (one `pathname === "/office"`
conditional) since the left nav above covers the same ground; every other page's sidebar (including
"More" → Graph/Documents/Memories/Approvals) is untouched.

`/graph` gets a matching "hologram" treatment — glowing rounded-panel nodes and curved, glowing edge
lines on a dark blueprint-grid background (SVG `<filter>` blur behind a bright stroke) — on the
exact same `lib/graph-layout.ts` force-layout positions as before, unchanged. A rendering-only change,
not a second 3D scene: the reference calls this a differently-styled "companion screen," not a claim
that it needs real depth too.

**Testing note specific to this pass:** clicking a specific 3D character isn't covered by the
automated e2e suite — computing the right screen coordinate would mean duplicating
`@react-three/fiber`'s camera projection math just for a test. `tests/e2e/office.spec.ts` covers
everything DOM-based (the scene mounting, left-nav/category-row navigation, the feed and terminal
rendering real fixture data); the 3D scene's own correctness — camera framing, character/room
rendering, the click → agent-overlay round trip — was verified manually with real headless-browser
screenshots and an actual simulated click, not just a green test suite. (The first version of the
3D scene, using a smaller world-unit scale for the layout-pixel-to-3D conversion, rendered every
character as an invisible sub-pixel sliver — caught only by looking at a screenshot, the same lesson
this project's `/hq` work learned once already.)

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
   synergies worth flagging. `/office` (the home page) is the mission-control view of all of this
   at once — click a company's room to focus it, click an agent's character to open its chat/runs/
   approvals overlay. Check `/graph` for the full relationship explorer, now rendered as a glowing
   hologram schematic. Visit `/memories` and
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
| `npm run test:e2e` | Real Playwright suite (`tests/e2e/`) against demo mode — checks across the `/office` mission-control shell (3D scene mounts, left nav/category row navigation, activity feed and terminal strip render real data), chat (incl. both agent switchers), documents, approvals, the knowledge graph, memories, the creator wizards, navigation, and mobile responsiveness. Runs and passes right now, no Supabase needed (a 3D-click-to-open-agent-panel check is deliberately not automated — see the office page's test file header — and is instead verified with real headless-browser screenshots). Does NOT verify real data flows (RLS, real agent responses, real approvals, real PDF/DOCX extraction) — those need the scripts above against a live project. |

## What's genuinely not built yet

Project-scope agents in practice (the schema supports them; nothing creates one). Also still
pending: the real OSL lead database/scoring model, real API keys for Gmail/Apollo.io/Higgsfield,
actually deploying the daily-briefing Edge Function + its `pg_cron` schedule, and end-to-end
verification of real PDF/DOCX extraction through the live upload route (see "Status" above) — all
blocked on a live Supabase project and/or real credentials, not on any unwritten code.
