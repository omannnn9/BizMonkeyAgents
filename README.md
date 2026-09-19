# OD Cortex

Internal AI command center for OD Group (ODAX, Tablo, NOVA, OD Holdings). See the original build
prompt and architecture doc for full context; this README covers what exists and how to bring it
online. For a deeper technical reference — the data model, the agent runtime and every tool, the
full API surface, and a per-page frontend breakdown — see **[`docs/`](./docs/README.md)**.

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

## Status

**Phase 1** (one CEO agent, cockpit UI, approval gate, audit log), **Phase 2** (Sales/Marketing
department agents, the knowledge-graph view, scheduled briefings), **Phase 3** (Tablo/NOVA onboarded
the same way, group-scope agents, memory promotion, company/agent creator wizards, OKRs/board-report
generation), a scoped-down **Phase 4** (a 3D preview at `/hq`, since retired), a **Phase 5** 2D
pixel-art `/office` (also since retired — two visual passes, "Night Shift," both superseded), and
**Phase 6** (the mission-control `/office`), **Phase 7** (the OD Cortex rebrand + colony world),
**Phase 8** (the `/hierarchy` organizational tree), **Phase 9** (the `/brain` AI Brain),
**Phase 10** (Founder Command Mode + district-switch camera transitions), and **Phase 11**
(the World shell — Colony/Relationships/Hierarchy/Knowledge unified into one persistent, layer-
switchable frame instead of four separate routes) are all built. On top of that, a second
Ecosystem Audit-driven pass rebuilt the organization itself: a real 20-agent roster with
non-overlapping jobs, agent-to-agent collaboration (`request_from_agent`, cycle- and depth-guarded),
a memory-creation/knowledge-flow tool set (`record_memory`, `assign_task`, `record_decision`,
`create_goal`), the Founder Command Center (`/command`), and pagination/spend-tracking scalability
work (all described below), and a swap of the entire LLM layer from the Anthropic Messages API to
Groq's genuinely-free self-serve tier (Anthropic has no ongoing free tier; Groq's does, and both
`openai/gpt-oss-120b`/`openai/gpt-oss-20b` support the same tool-calling agentic loop this app needs)
— everything passes `npm run build` / `npm run lint`. **A live Supabase project now exists**
(`od-cortex`) with all 11 migrations applied and the founder identity seeded. **Demo mode has been
removed** — the app always talks to the real stack now, no fixture fallback. What hasn't happened
yet: real end-to-end verification from an actual browser hitting real Supabase/Groq/Voyage — the
environment this was built in has an outbound network policy that blocks direct HTTPS to those three
services (confirmed via 403s on every CONNECT, not a bug to route around), so the first real chat
message / document upload / agent tool call needs to happen either on a Vercel deployment or a
machine with unrestricted egress. See [`docs/DEPLOYMENT.md`](./docs/DEPLOYMENT.md) for the current
state and what's left on the post-deploy checklist.

**A Group CEO now sits at the top of the org** (migration `0012_group_ceo.sql`), per explicit founder
direction: a single agent above every other group lead and every company, the founder's default point
of contact in chat, with real delegation tools (`assign_task`, `create_goal`, `request_from_agent`)
that reach straight down into any company, not just the other group agents. Chief of Staff's persona
was revised to describe supporting the CEO (the synthesis layer it always was, now reporting into a
real top-of-org role instead of standing in for one) rather than being framed as the founder's direct
right hand. The founder is never restricted to the CEO only — every agent, including Chief of Staff,
Group CFO, Group Strategy, and every company-level agent, stays directly reachable in the chat agent
switcher; the CEO is the default selection, not a gate. `/api/chat`'s server-side default-agent
fallback was also fixed in the process: it previously only ever considered `scope='company'` agents,
which meant OD Holdings — an entirely `scope='group'` company — would 404 if `agentId` were ever
omitted; it now checks for "Group CEO" first, then "Chief of Staff", then any department-less
company-scope agent, then whatever's active, covering both org shapes.

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

**On Phase 7 (the OD Cortex rebrand) specifically:** an audit against a much higher visual bar
("Arc Browser × Linear × an AI civilization sim," scored 38/100 going in) found the app real and
correct underneath but generic everywhere it wasn't `/office` or `/graph` — one flat accent color, no
motion system, plain `<select>` switchers, a repeated bordered-card pattern on every secondary page,
and no name of its own. This pass is presentation-layer only — no migration, no change to
`lib/agent/*`, no new API contract beyond one additive field — split across:

- **The rebrand.** "OD Group Cockpit" → **OD Cortex** ("An operating system for companies"),
  everywhere including this README and `docs/`. Agents get a rank instead of raw `role_title`,
  derived from data that already existed (`lib/agent-title.ts`'s `deriveAgentRank()`: `scope`/
  `department_id` → Group Executive / Company Executive / `{Department}` Lead) — mapped onto the
  founder's requested hierarchy language with zero schema change. The collective term for an agent
  anywhere none is named specifically is "Operator."
- **Design tokens.** `app/globals.css` gained formalized state colors, glow utilities (applied only
  to genuinely live elements — an active nav item, a state ring — never blanket), and motion timing
  tokens most pages had none of before. `components/ui/Panel.tsx` is a new shared "instrument panel"
  primitive, now used on Documents/Approvals/Memories, replacing the raw bordered-card div repeated
  across each.
- **The colony world.** `/office`'s 3D viewport and `lib/office-layout.ts` were rewritten from a
  left-to-right wrapping grid of rooms into a radial layout: OD Holdings becomes the **Central
  Command District** at the origin, every other company orbits it, connected by a glowing bridge
  drawn from the same real `owns` edges `/graph` already visualizes — the hierarchy is now visible
  spatially, not just implied. Districts are tinted platforms (not rooms with walls); Operators stand
  at HUD-styled consoles instead of literal desks.
- **A richer, still 100%-real state system.** The founder's brief asked for 8 Operator states.
  Reconciled honestly rather than fabricated: Idle, Executing (now with two cosmetic animation
  motifs — a particle swirl and a data-stream — cycling on the one real in-flight signal, not three
  separate fake states), Waiting Approval, Blocked, Delivered are the prior 5, relabeled. **Sleeping**
  is new and real (`agents.status !== "active"`, or no run in 24h+ — `/api/map` now additionally
  selects `status`, the only API surface this pass touched). **Meeting** was not built — no
  multi-agent feature exists to back it with a real event, and this project doesn't fabricate signals
  that aren't backed by one; it becomes real if that feature ever exists.
- **Deferred, on purpose** at the time (see the plan file this pass used, or ask for the roadmap):
  a Hierarchy Map and an AI Brain knowledge visualization, each as their own route; a Founder Command
  Mode (a zoomed-out camera state within the same colony scene); and tweened camera transitions on
  district switch. The Hierarchy Map shipped next as **Phase 8**, the AI Brain as **Phase 9**, and
  Founder Command Mode + the camera transitions as **Phase 10** (all below) — closing out the
  original roadmap. Each gets its own visual-verification pass when built, the same discipline that
  caught the Phase 6 scale bug below.

**Phase 8 (`/hierarchy`)** is the founder's brief's most concrete ask fulfilled literally: *"I want
to instantly understand Founder → Group Executives → Company Executives → Department Leads →
Specialists... a living organizational tree. Animated. Interactive. Beautiful."* Built entirely from
data `/api/map` already returns (no new route, no new fetch) via a new deterministic **tree** layout,
`lib/hierarchy-layout.ts` — deliberately not `/graph`'s force-directed `forceLayout()`, since a
hierarchy shouldn't visibly jitter into place or allow crossing edges. Founder sits at the root (a
real label, not a fabricated row — there's no "founder" table, this position is the human user),
above the company with no parent, which fans out into its own agents and child companies, each
showing `lib/agent-title.ts`'s `deriveAgentRank()` — the same "Group Executive"/"Company
Executive"/"`{Department}` Lead" language the colony world already uses, so rank means the same thing
everywhere. Rendered as an SVG using `/graph`'s proven hologram glow system (same filter, same grid
background) but with elbow bezier connectors instead of bowed circuit traces, so the two pages read
as the same design system while staying structurally distinct — a tree next to a network, not two
networks. Nodes fade in staggered by depth on load (**Animated**); clicking a company switches the
active company, clicking an Operator opens the same `OfficeAgentPanel` overlay `/office` already uses,
with real chat/runs/pending-approvals (**Interactive**) — reusing an existing component, not a new
one. Caught and fixed one real bug via a screenshot before calling this done: the root node's own
top half was clipped by the SVG `viewBox` starting at `y=0` instead of accounting for the node's own
height above its center point.

**Phase 9 (`/brain`)** is the founder's other concrete ask: *"a large glowing neural sphere...
When memories are created, connections appear. When documents are uploaded, knowledge flows into
the core. The AI Brain should become visibly larger and richer over time."* Reconciled with this
project's real-data-only discipline rather than fabricated: the core's radius is a real function of
an actual `count(*)` query against `memories` (small right now, since this app has almost no seeded
memory data — the honest state, not a minimum chosen to look impressive), individual memory nodes
are real rows (capped at 200, newest first), and "connections" are exclusively the output of
`match_cross_company_memories` — the same RPC `detect_synergies` already calls, nothing invented.
There is no fabricated live "packet traveling into the core" animation on document upload, since
this app has no Realtime infrastructure by design (no browser-side Supabase client); what's real and
does animate is the page's existing 20s poll diffing this cycle's memory-id set against the last
one, giving any genuinely new id a one-time arrival animation. This is also the one deliberate
exception to the "no new API surface" discipline the last two passes held to exactly:
`GET /api/brain` (see [`docs/API_REFERENCE.md`](./docs/API_REFERENCE.md)) is a small, read-only,
additive route, justified because every other route is scoped to a single company on purpose and the
Brain is explicitly org-wide. Rendered with `@react-three/fiber` — like the colony world, a genuinely
volumetric idea that would read flat in 2D SVG — with memory nodes distributed on a shell around the
core via a Fibonacci-sphere formula, colored by scope, connected by glowing synergy arcs. Clicking a
node opens an inline detail panel with a "Promote to group" action for company-scope memories, reusing
the existing `POST /api/memories/:id/promote` endpoint unchanged. Went through the same iterative
screenshot-tune-reshoot cycle as every prior 3D pass: the first render was a flat, underwhelming solid
sphere with too much empty margin, fixed with layered transparent glow-halo shells (a cheap stand-in
for a real bloom pass this app's pipeline doesn't have) and a re-derived, explicitly margin-checked
camera distance. See [`docs/FRONTEND.md`](./docs/FRONTEND.md) for the full breakdown.

**Phase 10** closes out the original roadmap's last two deferred items — **Founder Command Mode**
and **tweened camera transitions on district switch** — by making them one feature. The colony's
camera was fully static until now (set once on mount; react-three-fiber never repositions an
already-created camera from prop changes), always framed to fit the whole colony, so switching
companies only ever highlighted a ring — the camera never moved. Now a `CameraRig` inside the scene
lerps the real camera toward a target every frame: by default, tightly framed on whichever company is
active (switching companies now visibly *means* something in 3D space); or, with an explicit "Command
Mode" toggle, pulled back to frame the entire colony — which is exactly the original fixed shot, made
reachable on demand instead of the only option. Command Mode also raises a real metrics HUD (district
count, Operator count, pending approvals, and a live state breakdown) computed entirely client-side
from data the page already has in memory — **zero new fetch, zero new API route**, an even stronger
position than the last two passes (the Hierarchy Map reused an existing route; the AI Brain justified
one new one). Caught one real bug via a screenshot before calling this done: the HUD first rendered
hundreds of pixels below the viewport instead of floating over the scene, because `Panel`'s own
hardcoded `relative` class fought an `absolute` override passed alongside it through Tailwind's
class-order cascade — fixed by wrapping `Panel` in its own positioned element instead. See
[`docs/FRONTEND.md`](./docs/FRONTEND.md) for the full breakdown.

**A visual-consistency pass** (not a numbered phase — no new functionality, just closing gaps the
rebrand didn't reach) brought Documents/Memories/Approvals up to the same instrument-panel visual
language the rest of the app already uses, every addition traced to a real field these pages already
fetch but didn't show. `/documents` was a bare list of thin bars with no e2e coverage at all — now a
responsive card grid with a real type badge per document (derived from the actual `mime_type` column
via new `lib/document-type.ts`), plus a new `tests/e2e/documents.spec.ts` closing the only real gap in
the suite. `/memories` fetched `importance`/`confidence` per memory and discarded both — now a thin
importance meter sits next to each memory's badge, and the badge itself distinguishes all three real
scopes (`founder` gets the same amber color `/brain` and `/hierarchy` already use for it, not a new
choice) instead of lumping founder in with company. `/approvals`'s History section was raw unstyled
divs with every decided status in the same flat grey — now `Panel`-wrapped with the real status
(`executed`/`approved`/`rejected`/`failed`) colored via the app's existing success/danger tokens.
The creator wizards (`/companies/new`, `/agents/new`) had the same gap in the other direction — an
identical local `Field` component and input className copy-pasted across both, predating the Panel
migration — now factored into shared `components/ui/Field.tsx` and wrapped in `Panel` like every
other page.

**Phase 11 — the World shell.** A founder-authored "OD Cortex Vision 3.0" brief asked for something
closer to a living digital-headquarters world than a set of pages — audited honestly against that
brief first (see the plan file this pass used, or ask for the audit): the underlying data model
already supports it (every entity the brief asks for — companies, departments, agents, tasks,
documents, memories, decisions, approvals — is a real table, already wired into `/graph`'s relationship
graph), but three of the brief's asks (real financial flow layers, visible agent-to-agent
collaboration, a predictive/time layer) have **no real data behind them today** — no financial tables
exist at all, and no agent can hand work to another agent yet — so per explicit direction, those stay
deferred rather than faked. What *is* real and shipped this pass: Colony, Relationships (the former
`/graph`), Hierarchy, and Knowledge (the former `/brain`) are no longer four separate routes and four
separate page loads — they're **layers** inside one persistent World shell (still `/office`), switched
by client state via a new `WorldLayerSwitcher`, with zero navigation and zero chrome unmount between
them. `/graph`, `/hierarchy`, and `/brain` are now thin redirects into `/office?layer=...`, the same
clean-retirement pattern `/hq`/`/map`/`/dashboard`/`/activity` went through earlier. Command Mode's HUD
grew two more real signals it already had the data for but didn't show (a per-company pending-approvals
breakdown, a real recent-decisions list). Agents got a sleeker, more angular "digital operator" chassis
(replacing the old capsule-and-sphere figure) with a visor strip lit by the real state glow color
instead of a separate decoration. The AI Brain's Knowledge layer now renders real document nodes (not
just a per-company count) as cubes alongside memory spheres, sharing one Fibonacci-sphere index space so
the two kinds never collide — one additive field on `GET /api/brain`, the only API surface this pass
touched. See [`docs/FRONTEND.md`](./docs/FRONTEND.md) for the full breakdown.

**The Relationships layer went real 3D** as the next slice (of the other two candidates offered after
Phase 11 — a real financial data model, agent-to-agent collaboration — both cross the schema/
agent-runtime line and needed a business decision only the founder could make; this one didn't need
that decision, so it went first. Agent-to-agent collaboration is now built too, see below; the
financial data model is still deferred).
Depth isn't decoration: every real node type `/api/graph` returns maps to a fixed z-band — companies/
departments form a foundation layer, agents/projects/tasks a working layer, decisions/documents an
output layer — while the x/y within each band still comes from the existing, unchanged `forceLayout()`.
Hierarchy stays SVG on purpose: a tree's clarity comes from a clean top-down layout with non-crossing
connectors, and forcing it into 3D would more likely hurt legibility than help it. See
[`docs/FRONTEND.md`](./docs/FRONTEND.md) for the full breakdown.

**Agent-to-agent collaboration is now real**, the deliberate exception to this project's own
"no `lib/agent/*` changes" discipline — made because the capability genuinely needs the runtime, not
just a new view over existing data. A new `request_from_agent` tool (all five seeded agents, migration
`0007_agent_collaboration.sql`) lets one agent ask another for data or work and get its real reply back:
the handler calls `runAgentTurn()` — the same function `POST /api/chat` already uses — so the target
agent runs its own full turn, its own tools, its own approval gates, and gets its own independent
`agent_runs` row, exactly like a real user turn. Not approval-gated (internal collaboration, the same
trust boundary as `promote_memory`), but bounded: a new `depth` parameter threaded through
`ToolContext`/`runAgentTurn()` caps collaboration chains at `MAX_COLLAB_DEPTH = 2`, since nothing else in
the runtime stops two agents holding this tool from recursing into each other forever. Visualized two
ways from the same real signal — a recent `request_from_agent` call inside `agent_runs.tool_calls` — not
two fabricated ones: `AgentChatPanel` surfaces the target agent's reply inline, and the Colony draws a
real, pulsing beam between the two Operators' actual 3D positions for the same two-minute window the
`delivered` state already uses. See
[`docs/AGENTS_AND_TOOLS.md`](./docs/AGENTS_AND_TOOLS.md#request_from_agent--agent-to-agent-collaboration-not-gated)
and [`docs/FRONTEND.md`](./docs/FRONTEND.md#the-colony-collaboration-beam) for the full breakdown. The
other remaining candidate from Phase 11 — a real financial data model — is still deferred; no financial
tables exist yet and building one is a business decision, not a presentation-layer one.

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

**The OD Cortex Ecosystem Transformation** followed a full audit (scored the system 46/100 against its
own founder-operating-system vision) and a Future-State Specification, both written as living docs
before any code changed. Phase 1 built the knowledge-flow foundation every later phase depends on:
`record_memory`/`update_memory` (the first tools that actually *write* a new memory or archive a stale
one — `promote_memory` only ever copied an existing one), `assign_task` (the first write path for the
long-unused `tasks.assigned_agent_id` column), `record_decision`, and `create_goal` (with
`goals.parent_goal_id`/`department_id` for real goal cascading — see migration
`0008_knowledge_flow.sql`). Phase 2 then rebuilt the organization on top of that foundation: migration
`0009_org_rebuild.sql` replaces the templated CEO/Sales/Marketing-Agent-per-company roster with 20
agents that each have a real, non-overlapping job — 5 at OD Holdings (Group CFO, Group Strategy, plus
new Group Operations/Group Intelligence/Chief of Staff seats) and 5 per company (a Managing
Director/Studio Director, a sales-motion lead matched to how that company actually acquires customers,
a Marketing Lead, a Customer Success Lead, and one company-specific fifth seat — NOVA's is an
Engineering Lead, closing the audit's most glaring gap: a dev studio with zero engineering
representation). See [`docs/AGENTS_AND_TOOLS.md`](./docs/AGENTS_AND_TOOLS.md#the-agents-themselves)
for the full roster. Rebuilding the roster surfaced a real display bug: `lib/agent-title.ts`'s
`deriveAgentRank()` used to interpolate `role_title` into the displayed rank (`"${roleTitle} Lead"`),
which would have rendered as "Sales Lead Lead" once role titles themselves started saying "Lead" —
fixed by having `deriveAgentRank()` return a generic tier label instead, and nulling `role_title` in
the migration for every agent whose name is already the fully specific title.

Phase 3 made collaboration between agents genuinely bounded by organizational structure instead of
wide open. `request_from_agent` previously let any of the (then five) seeded agents reach any other
directly, no matter which company each belonged to. With 20 real agents across 4 companies, that
stopped being organizationally honest, so a new `canCollaborateAcrossCompanies()` rule
(`lib/agent/scoped-companies.ts`) now governs both `request_from_agent` and `assign_task`: same-company
requests and anything where either side is a group-scope agent go through freely, but two different
companies' agents can't reach each other directly — that has to route through Group Operations or
Group Strategy, the same way it would in a real holding company. `assign_task` also gained a real fix
alongside this: the task it creates is now filed under the *assignee's* company, not the caller's
active one (they can differ when a group-scope agent delegates downward). And every successful
`request_from_agent` call now writes a real **collaboration memory** — `scope: 'agent'`, embedded via
Voyage, retrievable through `match_memories` on the calling agent's own future turns — so a
collaboration becomes durable organizational knowledge instead of a log line nobody's context ever
re-reads. See
[`docs/AGENTS_AND_TOOLS.md`](./docs/AGENTS_AND_TOOLS.md#request_from_agent--agent-to-agent-collaboration-not-gated)
for the full breakdown.

**Phase 4 built the Founder Command Center** (`/command`) — the one page in the app that's genuinely
org-wide, not scoped to whichever company happens to be active in the header switcher. A single new
route, `GET /api/command`, feeds six real sections: an **Attention Center** merging pending approvals,
blocked tasks, overdue tasks, and at-risk goals into one list; **Opportunities**, the same
`match_cross_company_memories` synergy search `detect_synergies` already runs, computed live rather
than duplicated; **Company Health** cards (open/blocked tasks, pending approvals, last activity,
goal-status counts) per company; **Daily Briefings**, the latest `memories.source = 'briefing'` row per
company (empty until the daily-briefing Edge Function is actually deployed — never faked in the
meantime); and org-wide **Agent Activity**. The one interactive piece, **Weekly Executive Briefing**, is
a "Generate" button that calls a new `POST /api/briefing` — deliberately not a stored artifact: it runs
the real Chief of Staff agent through `runAgentTurn()` with a fixed synthesis prompt and returns its
live reply, getting its own independent `agent_runs` row like any other turn, so asking again always
reflects current data instead of a stale cache. See
[`docs/FRONTEND.md`](./docs/FRONTEND.md#command-center-command) and
[`docs/API_REFERENCE.md`](./docs/API_REFERENCE.md#get-apicommand) for the full breakdown.

**Phase 5 made the World shell's four spatial layers show more of what was already real but invisible.**
`/api/map`'s agent nodes now carry real workload (`openTaskCount`/`blockedTaskCount`, from
`tasks.assigned_agent_id`) and company nodes carry `industry` — surfaced as a Workload section in
`OfficeAgentPanel` (used by both the Organization and Hierarchy layers), a numbered badge on each
Hierarchy tree node, and a second label line under each Colony district showing the real business it
represents. `/api/graph` now derives two more edge relations — `collaborated_with` and `delegated_to` —
live from recent `audit_log` rows (the same ones `request_from_agent`/`assign_task` already write, not
a second table), rendered in the Relationships layer with their own colors so real recent collaboration
reads as a genuinely different kind of line from the static org-chart backbone. And the Knowledge
layer's document nodes are clickable for the first time — previously the only node type in that scene
with no click handler at all — opening a detail panel with the document's real title/company/type,
the same fields `/api/brain` already returned but nothing in the UI ever surfaced. See
[`docs/FRONTEND.md`](./docs/FRONTEND.md#organization-layer-the-colony) and
[`docs/API_REFERENCE.md`](./docs/API_REFERENCE.md#get-apimap) for the full breakdown.

**Phase 6 closed out the Ecosystem Audit's specific "hidden real data" finding**: `companies.config`
(a free-form jsonb — real ownership splits and market notes, seeded per company since
`0002_seed_companies.sql`) was never read by any page in the app. The Command Center's Company Health
cards (Phase 4) now show it — `GET /api/command` reads defensively from `config` (no assumption about
which keys exist) and formats `ownership` from whatever `{role_pct: number}` entries that company's
config actually has (e.g. "60% Founder / 40% Partner" for ODAX, matching its real 60/40 founder/partner
split) alongside `market` and `industry` (the latter already surfaced in the Colony's district labels,
Phase 5). Nothing invented — every value traces to the exact `config` object seeded for that company.

**Phase 7 addressed the Ecosystem Audit's scalability findings** — the app was built and verified
against a handful of seeded rows per company, and three specific gaps would have broken down as real
data accumulates. `query_company_data`'s `list` operation (tasks/decisions/projects/goals) was a flat,
unpaginated `.limit(25)` with no ordering; it's now a real `{rows, total, offset, limit, hasMore}` page
over `created_at desc`, backed by an actual `count: "exact"` query — an agent asking about the business's
open tasks a year from now gets a true page, not a silently truncated one. `agent_runs.cost_usd` existed
in the schema since the very first migration and was never once written; `lib/agent/model-pricing.ts`
now computes it from each turn's real `tokens_in`/`tokens_out` against Anthropic's published per-model
pricing, and the Command Center's Company Health cards show a real trailing-30-day spend per company
against an optional founder-set `companies.config.monthly_spend_cap_usd` (shown only when the founder
has actually set one — never a fabricated default), flagging red when a company is over. And
`request_from_agent`'s existing `MAX_COLLAB_DEPTH` guard only bounded how *long* a collaboration chain
could get, not where it could go — two agents that both hold the tool and reference each other could
still burn the whole depth budget bouncing back and forth. A new `ToolContext.collabChain` (the list of
agent ids already visited in this collaboration's lineage) lets the handler refuse a request back to
anyone already in the chain immediately, the first time it would loop, rather than only once depth ran
out. See [`docs/AGENTS_AND_TOOLS.md`](./docs/AGENTS_AND_TOOLS.md#request_from_agent--agent-to-agent-collaboration-not-gated)
for the cycle-guard details and [`docs/DATA_MODEL.md`](./docs/DATA_MODEL.md) for `cost_usd`.

**Phase 8 closed out the transformation with a real technical-debt pass** — deliberately last, after
every functional phase above, per the mandate's own ordering. A codebase-wide survey (TODO/FIXME
markers, `any` types, dead code, unused dependencies, naming drift, error-handling consistency) came
back clean on most fronts, but found one genuine authorization gap: `update_memory` and `promote_memory`
fetched and mutated a `memories` row by bare id with no check that the memory's owning company was one
the calling agent could actually see — unlike `record_memory` and `assign_task`, which already enforce
this. Since `ctx.supabase` is the service-role client (RLS is defense-in-depth, not the boundary — see
`lib/supabase/server.ts`), this app-level check was the only authorization boundary in play, and it was
missing on two of three memory-mutating tools. Fixed by extracting the owning-company resolution
`record_memory` already had inline into a shared `resolveMemoryOwnerCompanyId()`
(`lib/agent/scoped-companies.ts`) and applying the same scope check to all three tools. Also fixed: the
new-company page telling founders it seeds a "CEO Agent" (stale since the Phase 2 org rebuild renamed it
to "Managing Director"), a redundant inner try/catch in `/api/chat` that silently skipped the Sentry
reporting every other route gets, and an unused `@supabase/ssr` dependency.

## One-time setup

**A live Supabase project already exists** (`od-cortex`) — all 11 migrations are applied and the
founder identity is seeded (see [`docs/DEPLOYMENT.md`](./docs/DEPLOYMENT.md) for the details, and
that doc's "Setting up Supabase" section for doing this from scratch against a fresh project). What's
left to actually run the app:

1. Copy `.env.local.example` to `.env.local` and fill in:
   - `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (from the live project's dashboard →
     Project Settings → API)
   - `GROQ_API_KEY` (free self-serve tier at console.groq.com, no card required)
   - `VOYAGE_API_KEY` (free tier at voyageai.com, no card required)
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` only if you want to run `test:rls` (the app itself never uses it)
2. Optional but recommended: regenerate `lib/supabase/types.ts` from the real schema instead of the
   hand-written version here (`mcp__Supabase__generate_typescript_types`, or
   `supabase gen types typescript`).
3. Run the scripted tests, from an environment with real outbound access to Supabase/Groq/Voyage
   (the sandbox this was built in has a network policy that blocks all three — see
   [`docs/TESTING.md`](./docs/TESTING.md)):
   ```
   npm run test:rls               # defense-in-depth only, see "No login" above
   npm run test:prompt-injection
   npm run test:agent-scenarios
   ```
4. `npm run dev` and walk the cockpit yourself: switch companies, upload a doc (`.txt`/`.md`/`.csv`/
   `.pdf`/`.docx` all work now) and ask the agent about it, ask it to draft an email and confirm it
   shows up in Approvals (not sent). Try the agent switcher across the full agent roster — a company's
   Sales/Marketing Lead proposes `enrich_lead` / `generate_creative_asset` the same approval-gated
   way, then fails loudly since those integrations aren't connected; at OD Holdings, try Group CFO /
   Group Strategy — ask for a board report, or whether there are any cross-company synergies worth
   flagging. `/office` (the home page) is the Colony — a living view of all of this at once — click a
   district to focus that company, click an Operator to open its chat/runs/approvals overlay. Check
   `/graph` for the full relationship explorer, rendered as a glowing hologram schematic. Visit
   `/memories` and promote a company-scope memory to group. Try `/companies/new` and `/agents/new`.

## Deploying

The app builds clean and requires real env vars to run correctly — see [`docs/DEPLOYMENT.md`](./docs/DEPLOYMENT.md)
for the full walkthrough. **Once deployed, treat the URL as sensitive** — there's no login (see above).

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
| `npm run test:agent-scenarios` | Scripted tool-call-shape checks (not wording) across the seeded agent roster — including promote_memory, generate_board_report, detect_synergies, and the Phase 7 collaboration cycle guard. |
| `npm run test:e2e` | Playwright config only (`tests/e2e/` is currently empty) — the old suite ran entirely against demo mode and was retired when demo mode was removed, since it asserted on fixture content that no longer exists. See [`docs/TESTING.md`](./docs/TESTING.md#why-the-e2e-suite-was-retired). |

## What's genuinely not built yet

Project-scope agents in practice (the schema supports them; nothing creates one). Also still
pending: the real OSL lead database/scoring model, real API keys for Gmail/Apollo.io/Higgsfield,
actually deploying the daily-briefing Edge Function + its `pg_cron` schedule, real e2e test coverage
(see above), and end-to-end verification of the whole app against a real browser — all blocked on
either those real credentials, or on an environment with real network access to Supabase/Groq/Voyage
(see "Status" above), not on any unwritten code.
