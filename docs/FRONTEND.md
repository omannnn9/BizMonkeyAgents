# Frontend

## Design system

Product-wide UI/UX transformation, per explicit founder direction: the app
should feel like one operating system with real spatial/organizational
relationships, not a collection of separately-styled dashboards. Two new
primitives make every other change below possible:

- **`lib/company-identity.ts`** — real company differentiation, not just a
  different color. `getCompanyIdentity({slug, industry})` returns a
  curated `{accent, accentSoft, motif}` for OD Holdings/ODAX/Tablo/NOVA
  (motif is each company's real business, e.g. "Booking & appointment
  SaaS"), falling back to a deterministic hash-derived accent (the same
  technique `OfficeScene3D`'s chassis-color hashing already used) for any
  future subsidiary with no curated entry yet — never grey, never
  decorative randomness.
- **Typography scale** (`app/globals.css`): five real tiers —
  `.text-context` (where am I), `.text-section`, `.text-primary-emphasis`
  (reserved for one genuine headline per screen), `.text-secondary-emphasis`,
  `.text-meta` — used deliberately at the handful of places a real
  hierarchy matters, not a blanket replacement for existing `text-sm`/
  `text-xs` body copy. Also: `--company-accent`/`--company-accent-soft`
  CSS custom properties (set per-page by `CockpitShell` from the active
  company's identity, consumed by `.glow-company` and `.atmosphere-company`),
  and one restrained motion primitive (`.pulse-live`, a slow low-amplitude
  opacity pulse for a genuine "this just changed" signal — a new attention
  item, a live state dot — respecting `prefers-reduced-motion`).

## Layout and shell

`app/layout.tsx` is the root HTML shell (fonts, metadata — `robots: {index:
false}` since this is an internal tool). `app/(cockpit)/layout.tsx` fetches
the real company list server-side (now including `industry`, for
`getCompanyIdentity()`), wraps children in `CompanyProvider`
(`lib/company-context.tsx`), and renders `CockpitShell`.

`lib/company-context.tsx`'s `CompanyProvider` holds the active company in
client state, persisted to `localStorage` (`od-group.active-company-id`) so
switching companies is a state update + re-fetch, never a navigation.
Defaults to the group-level company (`parent_id === null`) if present.

**`components/CockpitShell.tsx` is now one persistent rail, not a website
navbar bolted onto a separately-shelled 3D page.** Previously `/office` opted
entirely out of the shared shell (its own `LeftNav` stood in for navigation);
that meant the app was actually two different shells wearing the same colors
— a real product-coherence problem, not just a styling one. Now every route,
`/office` included, renders inside the same left rail: a brand mark, primary
destinations (Command/Colony/Chat, icon + micro-label, matching the
`PRIMARY`/`SECONDARY` split in the component) with a real "something needs
you" badge (best-effort, reused from `/api/command`'s own attention count —
never fabricated, silently absent rather than showing a stale zero if the
fetch fails), then a visually distinct second tier for the reference surfaces
(Documents/Memories/Approvals), then a Create menu. `/office` is still the
one route that renders full-bleed inside `<main>` (a 3D viewport is
inherently spatial, not a document with margins) — that is now the *only*
place this shell special-cases a route; the rail and header are identical
everywhere else. Below `md`, the same primary destinations become a fixed
bottom tab bar with a "More" sheet for the reference surfaces and Create,
rather than collapsing the desktop sidebar into a hamburger drawer.

The whole shell tints subtly per active company: `CockpitShell` sets
`--company-accent`/`--company-accent-soft` as inline CSS custom properties
from `getCompanyIdentity()`, so the active nav item's glow, the header's
hover border, and any `.atmosphere-company`/`.glow-company` usage on the
page itself all shift together when the founder switches environments —
restrained (a border/glow tint, never a full recolor) but real.

`components/office3d/LeftNav.tsx` (inside `/office`'s own 4-zone layout)
dropped its "Surfaces" link list entirely — those were the same five links
the persistent rail now already owns, said twice in two different visual
languages. What's left there is genuinely page-specific: which district
you're looking at, and what's recently happened in it.

## Company/agent switching

`CompanySwitcher` used to be a plain `<select>` reading "Company: ODAX" —
functional, but not company *context*. It's now a real environment switch:
a button showing the active company's accent dot, name, and real motif
(`getCompanyIdentity()`), opening a panel that lists every company the same
way, OD Holdings pinned first as the group level. Selecting one still just
calls `useCompany()`'s `setActiveCompanyId` underneath (same state-update-not-
navigation mechanism as before) — only the surface changed. `AgentSwitcher`
is unchanged: a `<select>` that only renders when a company has more than
one agent, used on `/chat` and inside `OfficeAgentPanel`.

## Command (`/command`)

Rebuilt around one question — "what needs me?" — instead of a stats-dashboard
layout. `GET /api/command` (org-wide, unscoped by the company switcher, the
one page in the app that's deliberately not) now also joins real agent names
onto both the attention list and the activity feed (`agentLabel()` in the
route), so the page never shows a raw agent id. Sections, top to bottom:

- **Headline** — a real count ("N things need you" / "Nothing needs you
  right now"), plus, when `lib/temporal.ts`'s `getLastVisit("command")`
  finds a real previous visit in this browser's `localStorage`, how many of
  those items are new since then. `markVisit()` is called once per mount
  after reading the old value, so the comparison stays meaningful across
  reloads in the same sitting rather than resetting itself immediately.
- **Immediate attention** (`attention-center`) — pending approvals, blocked
  tasks, overdue tasks, at-risk/off-track goals, merged and sorted by
  recency. Every row is a real founder action, not just a label: `Review`
  (approvals → `/approvals`) or `Open` (→ `/office`), per `attentionMeta()`.
  A new-since-last-visit row gets a `.pulse-live` dot instead of a static
  one.
- **Agent situation** — a real, org-wide count of `deriveAgentState()`
  results (`lib/agent-visual-state.ts`), fetched from the same `/api/map`
  the Colony itself reads — not a second data source. `isWorking` is always
  `false` here (Command has no way to know an agent is mid-turn in someone
  else's browser tab the way `/office`'s own optimistic client state does),
  so this section is honestly missing `executing` rather than guessing it.
- **Company pulse** — one real row per company (accent dot + name + motif +
  ownership/momentum/spend), not a grid of identical stat cards — the
  `getCompanyIdentity()` accent is what makes ODAX read as visually
  different from Tablo here, the same as everywhere else now.
- **Opportunities** / **Weekly executive briefing** — unchanged behavior
  (see below), restyled to the same Panel/typography language.
- **Executive activity** (`agent-activity`) — the 15 most recent
  `agent_runs` org-wide, now grouped into real "Just now / Earlier today /
  Yesterday / Earlier" buckets via `lib/temporal.ts`'s `groupByRecency()`,
  and read as "**Group Strategy** (ODAX) ran with no output." / "hit an
  error." instead of a raw status string.
- **Daily briefings** — unchanged; only rendered once at least one exists
  (an honest empty state was removed in favor of just omitting the section,
  since "no daily briefings yet" duplicated the explanation `DEPLOYMENT.md`
  already gives for why).

`Opportunities` stays the same live `match_cross_company_memories` RPC
`detect_synergies` also calls; `Weekly executive briefing`'s `Generate`
button still calls `POST /api/briefing` (the real Chief of Staff agent via
`runAgentTurn()`, deliberately not stored — see
[`AGENTS_AND_TOOLS.md`](./AGENTS_AND_TOOLS.md)); `Company pulse`'s numbers
are the same `tasks`/`goals`/`approvals`/`agent_runs` counts the old
"Company Health" grid computed, including `companies.config`'s
`ownership`/`market`/`monthly_spend_cap_usd` (Phase 6/7) — only the layout
changed, not the data source.

## Chat

`components/AgentChatPanel.tsx` is **the one chat implementation** —
extracted specifically so `/chat` and the office overlay panel both use it
verbatim rather than maintaining two. Holds its own message list/input
state, posts to `/api/chat`, renders assistant replies as markdown
(`react-markdown` + `remark-gfm`), and extracts two things out of the raw
`toolCalls` array from the response:

- **Citations** — if a `search_documents` call's result parses as a JSON
  array, renders it as a "Sources" list under the reply (title, chunk
  position, similarity).
- **Tool notes** — for `send_email`/`enrich_lead`/`generate_creative_asset`
  calls (the three approval-gated, external-facing tools), surfaces the
  tool's raw result text inline as a warning-colored note under the reply,
  so the founder sees the outcome ("submitted for approval") without
  digging into Activity.

`onSendStart`/`onSendEnd` callbacks let a caller derive a transient
"request in flight to this agent" signal without the panel knowing
anything about how that signal is used — the office scene's 3D "working"
glow state is built entirely on this.

`app/(cockpit)/chat/page.tsx` re-fetches the agent list whenever the active
company changes and resets to that company's CEO-style default — a
`hasLoadedAgentsOnce` ref guards against a slow fetch for a previously
active company clobbering a faster switch that happened after it.

## Documents

`app/(cockpit)/documents/page.tsx` — file input (accepts `.txt/.md/.csv/.pdf/.docx`)
posting to `/api/documents/upload` as `FormData`, then a responsive card
grid (`grid-cols-1 sm:grid-cols-2 lg:grid-cols-3`) of uploaded documents
fetched from `/api/documents`, each a `Panel` showing a type badge, title,
tags, and date. The badge comes from **NEW `lib/document-type.ts`**'s
`documentTypeLabel(mimeType)` — a small pure mapping from the real
`mime_type` column (`application/pdf` → `PDF`, the DOCX mime → `DOCX`,
`text/csv` → `CSV`, `text/markdown` → `MD`, `text/plain`/null → `TXT`,
anything else → `FILE`), the same small-caps pill styling Memories/
Approvals already use. A `latestRequestedCompanyId` ref discards a slow
response for a company the user has since switched away from.

## Approvals

`app/(cockpit)/approvals/page.tsx` splits into "Pending" and "History"
sections. `PayloadPreview` renders `send_email` payloads specially (to/
subject/body) and falls back to a raw `JSON.stringify` for anything else.
Approve/Reject posts to `/api/approvals/:id` and surfaces the real outcome,
including the distinction between "approved" and "approved, but could not
execute: {error}" (an unconnected integration stub failing loudly, not
silently). Each "History" row is a plain (non-glow — these are settled,
not live) `Panel`, with its real decided status
(`executed`/`approved`/`rejected`/`failed`, the values
`app/api/approvals/[id]/route.ts` actually writes) colored via the app's
existing `--success`/`--danger` tokens instead of flat muted text.

## Memories

`app/(cockpit)/memories/page.tsx` — lists memories for the active company
(group + founder + company-scope), with a "Promote to group" button on any
`company`-scope row (posts to `/api/memories/:id/promote`). Each memory's
scope badge distinguishes all three real scopes — `founder` gets the same
amber `components/brain/BrainScene.tsx`'s `FOUNDER_COLOR` and the
Hierarchy layer's founder-node border already use, `group` the accent color,
`company` stays neutral — and a thin importance meter (a filled bar sized
to the real `importance` value, plus the number) sits next to the badge,
surfacing a field the page's own fetch already returned but previously
discarded.

## Company/agent creator wizards

`/companies/new` and `/agents/new` are plain controlled forms posting to
`POST /api/companies`/`POST /api/agents` respectively, wrapped in the
shared `Panel` and built from **NEW `components/ui/Field.tsx`**'s `Field`
label-wrapper and `fieldInputClass` — both pages had been copy-pasting an
identical local `Field` component and an identical input className since
before the Phase 7 rebrand's Panel migration, which missed these two. The
agent wizard's `AVAILABLE_TOOLS` list is a small hardcoded mirror of
`lib/agent/tools/registry.ts`'s `ALL_TOOLS` (kept separate rather than
importing the registry into a client component, since the registry pulls
in server-only Supabase logic through its tool implementations) — every
tool name it can submit is validated server-side regardless.

## The World shell (`/office`)

The home page (`app/page.tsx` redirects `/` → `/office`; the nav label is
"Colony" — the route path stayed `/office` on purpose, a URL slug being a
technical detail rather than brand-facing). This is the richest surface in
the app — a dense, four-zone shell rebuilt across many passes (2D pixel art
→ a "Night Shift" dark re-theme → a mission-control shell with a
grid-of-rooms 3D viewport → the OD Cortex radial colony world → the current
**World shell**, unifying every spatial/relational visualization into one
persistent frame), documented in full in the root
[`README.md`](../README.md#status). `app/(cockpit)/office/page.tsx` lays
out:

```
┌───────────┬─────────────────────────┬──────────────┐
│ LeftNav   │   Layer-switched         │ ActivityFeed │
│ (desktop  │   viewport               │ (desktop     │
│  only)    │   (always visible)       │  only)       │
├───────────┴─────────────────────────┴──────────────┤
│  WorldLayerSwitcher: Organization / Relationships /   │
│  Hierarchy / Knowledge                                │
├──────────────────────────────────────────────────────┤
│  Category row (Documents/Memories/Approvals…)         │
├──────────────────────────────────────────────────────┤
│  TerminalStrip                                        │
└──────────────────────────────────────────────────────┘
```

### The shell mechanism

Until this pass, Colony/Relationships (`/graph`)/Hierarchy (`/hierarchy`)/
Knowledge (`/brain`) were four separate routes and four separate page
loads. They're now **layers** switched by client state inside one
persistent shell — no navigation, no chrome unmount, between any of them:

- **`components/office3d/WorldLayerSwitcher.tsx`** exports the `WorldLayer`
  type (`"organization" | "relationships" | "hierarchy" | "knowledge"`),
  a `LAYER_META` map (each layer's name and header description — one
  source of truth for both the switcher's labels and the shell's header),
  and the switcher control itself — a HUD-styled pill row, the same
  pressed-state styling the Command Mode toggle already used.
- `office/page.tsx`'s `activeLayer` state defaults to `"organization"` on
  every render (server and client alike) and is synced from a real
  `?layer=` URL param in a mount effect — reading `window.location.search`
  synchronously during the initial render would risk a hydration mismatch
  for a `"use client"` page with no `searchParams` prop threaded through,
  so the sync happens one tick after mount instead (a one-frame flash to
  Organization on a direct deep link, never a hydration error).
  `selectLayer()` updates the URL via `window.history.replaceState` — a
  raw browser API, not `next/navigation`'s router, so switching layers
  never triggers an RSC round-trip.
- Each layer's data is fetched by the shell, not by the layer component
  itself, and reused where the data already overlaps: **Organization**
  and **Hierarchy** both consume the exact same `/api/map` response the
  shell already fetches for the colony (one fetch, two layouts —
  `officeLayout()` and `hierarchy-layout.ts`'s `hierarchyLayout()`).
  **Relationships** lazily fetches `/api/graph` the first time that layer
  is activated, then caches it in shell state for the rest of the session.
  **Knowledge** (`components/office3d/BrainLayer.tsx`) is the one
  exception — it owns its complete fetch/poll/promote lifecycle
  internally (unlike the others, nothing else on the page already has its
  data), and unmounts/stops polling when you switch away, exactly like
  navigating away from the old `/brain` route already did.
- The retired routes (`/graph`, `/hierarchy`, `/brain`) are now thin
  `redirect()` pages pointing at `/office?layer=...` — kept as real
  redirects, not deleted outright, so an existing bookmark still lands
  somewhere real, the same pattern this project used retiring `/hq`,
  `/map`, `/dashboard`, and `/activity` in earlier passes.
- Documents/Memories/Approvals/Chat deliberately **stay their own routed
  pages** — real forms and lists, not spatial views, so forcing them into
  "layers" would be a gimmick, not a clarity win. They're one click away
  from the World shell via the category row and `LeftNav`'s `Surfaces`
  list, same as before.

### Organization layer (the colony)

- **`components/office3d/OfficeScene3D.tsx`** — the `@react-three/fiber`
  viewport, the only place in the app using 3D for this layer. Reads
  `lib/office-layout.ts`'s **radial colony layout** (`SCALE = 40` world
  units per layout unit — see the file's own comments for two real bugs
  this pass's camera math hit and fixed, caught by screenshots rather than
  by the math alone). OD Holdings (the company with no parent) is the
  **Central Command District** at the origin; every other company orbits
  it as its own tinted platform, sized by how many Operators are
  stationed there, connected to the center by a glowing bridge drawn from
  the same real `owns` edges the Relationships layer already visualizes
  (the bridge glows brighter when that company is active — real UI state,
  not decoration). Each Operator is a **digital-operator chassis** — a
  tapered, 8-sided (faceted, not round) torso, angular shoulder
  pauldrons, and a boxy visor head carrying a thin emissive strip lit with
  the real state glow color, replacing the original flat capsule+sphere
  figure with something that reads more like a mechanical worker than a
  Lego minifigure — standing at a HUD-styled console whose screen is lit
  once the agent has ever produced a run. A glowing colored halo above
  each figure's head is `lib/agent-visual-state.ts`'s `deriveAgentState()`
  (`executing` / `blocked` / `approval` / `collaborating` / `delivered` /
  `sleeping` / `idle` — seven real states, see below) and a two-line label under drei's
  `<Html>` shows the Operator's name plus its rank via
  `lib/agent-title.ts`'s `deriveAgentRank()`. The camera is a real
  `CameraRig` (see Command Mode below), not fixed. Text labels use drei's
  `<Html>` (a DOM overlay) and the starfield atmosphere is a hand-rolled
  point cloud seeded with a deterministic PRNG, **never** drei's `<Text>`
  or `<Stars>` — an unfamiliar component's asset/randomness behavior isn't
  worth verifying fresh in a network-restricted sandbox when a same-effect
  primitive is cheap to hand-roll. Clicking a district calls
  `onSelectCompany`; clicking an Operator calls `onSelectAgent`, both via
  r3f's built-in mesh `onClick` raycasting. Each district's label (Phase 5)
  gets a second, smaller line showing `companies.industry` — the real
  business that district represents, surfaced via `/api/map`'s new
  `industry` field on company nodes, not a synthetic per-company color
  scheme with nothing behind it.
- **`components/office3d/LeftNav.tsx`** — active company name (labeled
  "District"), a "recent" list (`/api/dashboard`'s `recentDecisions`), and
  a `Surfaces` nav (Documents/Memories/Approvals/Chat — Relationships/
  Hierarchy/Knowledge aren't real destinations from here anymore, since
  this component lives inside the World shell itself, where
  `WorldLayerSwitcher` is the way to reach them).
- **`components/office3d/ActivityFeed.tsx`** — real `agent_runs.output`,
  attributed by Operator name **and rank** (`deriveAgentRank`, via an
  `agentInfoById` map built from `/api/map`'s node list, not a second
  lookup). An Operator with no output yet shows its last real status, never
  invented dialogue. Visible alongside every layer, not just Organization.
- **`components/office3d/TerminalStrip.tsx`** — the same `agent_runs`/
  `audit_log` rows the feed already fetched, re-presented as raw
  auto-scrolling monospace log lines (`[HH:MM:SS] agent_run agent=... `/
  `[HH:MM:SS] audit actor=...`). No second data source. Also visible
  alongside every layer.
- **`components/OfficeAgentPanel.tsx`** — the click-an-Operator overlay:
  a header showing the Operator's name and rank, `AgentChatPanel` (the same
  chat implementation `/chat` uses), a **Workload** section (Phase 5 — real
  open/blocked task counts from `tasks.assigned_agent_id`, the same
  `openTaskCount`/`blockedTaskCount` fields `/api/map` now returns),
  pending approvals for that one agent (Approve/Reject, reusing `POST
  /api/approvals/:id`), and recent runs. Used by both the Organization and
  Hierarchy layers.

`/office`'s `/activity` predecessor page is retired entirely — its job is
now this feed + terminal strip, the same "fold into `/office`, keep the API
route" pattern the earlier `/dashboard` and `/map` pages went through.

### The Colony collaboration beam — and real movement

A real signal for the `request_from_agent` tool
([`AGENTS_AND_TOOLS.md`](./AGENTS_AND_TOOLS.md#request_from_agent--agent-to-agent-collaboration-not-gated))
**and** the `assign_task` tool (the Group CEO's own primary delegation
lane — see [`AGENTS_AND_TOOLS.md`](./AGENTS_AND_TOOLS.md)), not
decoration: `lib/collaboration.ts`'s `deriveCollaborationEdges()` scans the
same `agent_runs` rows `ActivityFeed`/`TerminalStrip` already poll
(`/api/activity`, now selecting `tool_calls` too) for a
`request_from_agent` or `assign_task` call within the last two minutes
(`RECENT_DELIVERY_MS`, the same window `delivered` already uses), and
extracts the real `{sourceAgentId, targetAgentId}` pair from the call's
own logged input — `targetAgentId` from `request_from_agent`'s input,
`assigneeAgentId` from `assign_task`'s. Each derived `CollaborationEdge`
carries a `kind: "request" | "delegation"` so the two real tool calls stay
distinguishable downstream without a second scan over the same rows.
`app/(cockpit)/office/page.tsx` derives this once via `useMemo` and passes
it to `OfficeScene3D` as `collaborationEdges`.

Three independent effects come out of the same derived data, not three
separate signals:

- **The glow**: `deriveAgentState()` gains an `isCollaborating` parameter,
  checked after `blocked`/`approval` (a real error or pending decision
  stays more urgent than "recently collaborated") but before `delivered` —
  functionally the same "just happened" tier, distinguished only by what
  kind of run it was.
- **The beam**: a `CollaborationBeam` component in `OfficeScene3D.tsx` —
  the same raw `<line>`/`bufferGeometry` technique `GraphScene.tsx`'s
  `GraphEdgeLine` already established for the Relationships layer —
  connects the two Operators' real glow-orb world positions, pulsed via
  the same `useFrame` sine pattern `ExecutingFX` already uses, tinted with
  the `collaborating` state color (`#c77dff`). Renders regardless of
  either Operator's glow state, so the beam stays visible even when one
  side is showing `blocked`/`approval`.
- **Real movement**: `AgentOperator` (wraps `AgentFigure`) is the piece
  that answers "I see them moving around working" literally, not just
  with a static glow — an Operator that is the real `sourceAgentId` of an
  active edge steps out from its desk, partway toward the target
  Operator's own desk (`WALK_REACH`, 55% of the real distance between the
  two — a hand-off, not a desk swap), pacing back and forth there via a
  `useFrame` sine while the edge stays live, and eases back home
  (`WALK_LERP_SPEED`) the moment `deriveCollaborationEdges()` stops
  returning it (the edge aged out of the two-minute window, or the
  underlying tool call simply hasn't recurred). The walk target is always
  resolved from the same `layout.agents` desk positions the beam's own
  endpoints use — never a fabricated waypoint.

Command Mode's HUD chip row picks this up too (`summarizeAgentStates()`'s
`collaboratingAgentIds` parameter) — org-wide, not scoped to whichever
district is active.

### Relationships layer

A real 3D scene now (`components/office3d/GraphScene.tsx`,
`@react-three/fiber`, ssr:false) — the one layer besides Organization and
Knowledge that earns real depth, and the reason is a genuine design idea,
not decoration: **depth encodes what kind of thing a node is.** Every real
node type `/api/graph` returns (`company`/`department`/`agent`/`project`/
`task`/`decision`/`document` — all seven, `colorForNodeType()` in
`lib/graph-layout.ts` now gives each its own color instead of lumping
three of them into a generic grey fallback) maps to a fixed z-depth band:
companies/departments form a foundation layer, agents/projects/tasks a
working layer, decisions/documents an output layer. The x/y position
within each band still comes from the **existing, unchanged**
`forceLayout()` (the same hand-rolled repulsion/spring/center-pull
simulation, 300 fixed iterations, that's always powered this view) — this
pass only adds a `z` on top of it via a `TYPE_DEPTH` map, no new physics
code. Nodes render as glow-halo spheres (the same halo-mesh technique
`BrainScene.tsx`'s `MemoryNode` established) with a drei `<Html>` label
for the real name — **never** drei's `<Text>`, the standing rule every 3D
pass in this app holds to. Edges render as glowing 3D line segments (a raw
three.js `<line>`, the same technique `BrainScene.tsx`'s `SynergyArc`
uses). The camera is fixed, no `OrbitControls`, and deliberately flatter/
more eye-level than the Organization layer's near-overhead angle — a
steep top-down angle compresses the depth bands into near-invisibility,
caught on the first real screenshot and fixed by lowering the elevation
ratio, not by the math alone, the same discipline that's caught a real bug
on every 3D pass this project has built. `components/office3d/GraphLayer.tsx`
(the former standalone `/graph` page's body) keeps the exact same side
detail panel (`data-testid="graph-detail-panel"`) and `selectedId` state
it always had — only the viewport's rendering technology changed, not the
interaction model or the data.

**Collaboration/delegation history** (Phase 5) — two new edge relations,
`collaborated_with` and `delegated_to`, computed live by `/api/graph` from
recent `audit_log` rows (see [`API_REFERENCE.md`](./API_REFERENCE.md#get-apigraph))
rather than a second edges-table write. `GraphEdgeLine` colors them
distinctly from the structural `owns`/`has_agent` backbone —
`collaborated_with` in the same `#c77dff` the Organization layer's
collaboration beam already uses, `delegated_to` in `#ffc24d` — so real
recent activity between two agents reads as a genuinely different kind of
line, not more org-chart scaffolding.

Same trade-off as the Organization and Knowledge layers: clicking a
specific node isn't covered by the automated suite — duplicating r3f's
camera projection math to compute a screen point isn't worth it for what
it'd buy. `tests/e2e/graph.spec.ts` covers everything DOM-based (the
scene mounting, real node labels via drei's `<Html>` DOM output); the
click → detail-panel interaction was verified manually with a real
headless-browser screenshot instead.

### Hierarchy layer

The founder's org-chart ask fulfilled literally: Founder → Group Executives
→ Company Executives → Department Leads, as a real tree rather than a
force-directed network. Built entirely from the shell's own `/api/map`
data — no separate fetch.

- **`lib/hierarchy-layout.ts`** — a deterministic top-down tree layout
  (`hierarchyLayout(nodes, edges)`), deliberately **not**
  `graph-layout.ts`'s force-directed `forceLayout()`: a hierarchy shouldn't
  visibly jitter into place or allow crossing edges. Two-pass algorithm —
  post-order to compute each subtree's width, pre-order to center each
  node under its children's span. Builds the tree from the same
  `MapNode`/`MapEdge` shape the Organization layer's own fetch already
  returns: a synthetic `"founder"` root (a real label, not a fabricated
  row — there's no "founder" table, this position is the human user)
  above the company with no parent, which fans out into its own agents
  and child companies, each child company's own agents beneath it. Every
  agent node carries `lib/agent-title.ts`'s `deriveAgentRank()` label —
  the identical "Group Executive"/"Company Executive"/"`{Department}`
  Lead" language the Organization layer and `ActivityFeed` already use.
- **`components/office3d/HierarchyLayer.tsx`** (the former standalone
  `/hierarchy` page's body) — takes the shell's already-fetched
  `nodes`/`edges` as props (no fetch of its own), runs them through
  `hierarchyLayout()`, and renders an SVG reusing the Relationships
  layer's proven hologram glow system (the same `feGaussianBlur`+`feMerge`
  filter and grid `<pattern>` background, copied rather than extracted
  into a shared component — a little duplication between two small
  layers over a premature shared primitive) with **elbow bezier
  connectors** between a parent's bottom edge and each child's top edge
  instead of the network's bowed circuit-trace edges — reads as an org
  chart, not a network, while staying visually related to it. Agent nodes
  show two lines (name, then rank in a smaller/dimmer line, the same
  pattern the colony world's character labels use); the Founder node gets
  a distinct gold/amber border since it's the one node that isn't a data
  row. Agent nodes also carry a real **workload badge** (Phase 5) — a
  small numbered circle showing `openTaskCount` (the same field
  `/api/map` now returns) when non-zero, plus a small red dot when any of
  those tasks are `blocked` — the same two fields `OfficeAgentPanel`'s
  Workload section shows for the same agent. Nodes fade in staggered by
  tree depth on load (a plain CSS `transition-delay`, no animation
  library). Clicking a company node
  calls the same `setActiveCompanyId` every other company-switching
  interaction in the app already uses; clicking an agent node opens the
  **existing** `components/OfficeAgentPanel.tsx` overlay unchanged — real
  chat, pending approvals, and recent runs, from a component that already
  existed rather than a new one.

Unlike the Organization layer's 3D character clicks, Hierarchy's node
clicks are plain SVG `<g role="button">` elements — fully automatable, no
camera projection math to duplicate — so `tests/e2e/hierarchy.spec.ts`
covers the agent-click → `OfficeAgentPanel` interaction directly, real data
included, rather than deferring it to a manual screenshot check.

### Knowledge layer

The founder's central-intelligence-core ask: *"a large glowing neural
sphere... When memories are created, connections appear. When documents
are uploaded, knowledge flows into the core. The AI Brain should become
visibly larger and richer over time."* Unlike Relationships/Hierarchy,
this is a genuinely volumetric idea that reads flat in 2D SVG, so it's the
one other place besides the Organization layer that earns real 3D depth
(`@react-three/fiber`, already a dependency).

- **`GET /api/brain`** (see [`API_REFERENCE.md`](./API_REFERENCE.md))
  aggregates across every company at once, since every other route is
  deliberately per-company-scoped for the per-company pages — the one
  deliberate exception to "reuse an existing route" the shell otherwise
  holds to.
- **What's honestly real, decided up front:** the core's size is a real
  function of an actual `count(*)` query (`base + log(count + 1) * factor`
  — small now, since this app has almost no seeded memory data, and that's
  the honest state to show rather than a minimum chosen to look impressive).
  Individual memory *and document* nodes are real rows (capped at 200/100
  respectively, newest first, the same `.limit()` precedent `/api/map`
  already sets). Connections between nodes are exclusively
  `match_cross_company_memories` output — the same RPC `detect_synergies`
  already calls — and if it returns nothing for a small dataset, the Brain
  shows no arcs and says so in the stat row ("real result, not a failure,"
  the same phrasing `detect_synergies`'s own tool description already
  uses). There is no fabricated live "packet traveling into the core"
  animation — this app has no Realtime infrastructure (no browser-side
  Supabase client, by design). What *is* real and safe to animate: the
  layer polls `/api/brain` on the same 20s interval the rest of the shell
  already uses, diffs this poll's combined memory+document id set against
  the previous one, and gives any genuinely new id a one-time scale-in
  arrival animation — event-driven off a real diff, not a looping
  decoration.
- **`components/brain/BrainScene.tsx`** — the core is a layered
  wireframe/glow sphere (several transparent `meshBasicMaterial` halo
  shells at increasing radius/decreasing opacity, a cheap stand-in for a
  real bloom pass this app's pipeline doesn't have). Memory and document
  nodes share one Fibonacci-sphere index space (memory indices first,
  document indices after, so the two kinds never land on top of each
  other regardless of their relative counts) — a deterministic, even
  coverage formula, no physics simulation and no new dependency, the same
  "hand-roll it for a few dozen items" precedent `graph-layout.ts`'s
  `forceLayout` and `hierarchy-layout.ts`'s tree layout already set,
  extended to 3D. Memories render as spheres colored by scope
  (group/founder get fixed colors; company-scope memories are tinted per
  company using the same `hashToIndex` palette approach
  `OfficeScene3D.tsx` uses for districts); **documents render as cubes**
  (same per-company palette, a different marker shape rather than a new
  color language, so a document reads as a different *kind* of thing on
  sight, not just a differently-colored dot) and are now **clickable**
  (Phase 5) — the same `selected`/`onSelect(id)` pattern `MemoryNode`
  already used, keyed by the `doc:` prefix the position map already
  namespaced documents under, so a memory and a document can never
  collide on the same selection id. Previously the only node type in this
  scene with no click handler at all. Synergy connections render as
  glowing bezier arcs through 3D space
  between the two real memory nodes in each pair. Camera distance is
  computed from the shell radius with generous margin, verified with a real
  screenshot before calling this done — the same discipline that already
  caught camera-framing bugs in the colony world (twice) and the Hierarchy
  layer's `viewBox` (once).
- **`components/office3d/BrainLayer.tsx`** (the former standalone
  `/brain` page's body) — polls `/api/brain` every 20s, tracks the
  previous poll's combined memory+document id set in a ref to compute
  arrivals, and shows a stat row (memories retained / documents indexed /
  cross-company connections, or the honest "no connections yet" message).
  Clicking a memory node opens an inline detail panel — own to this
  layer, not `OfficeAgentPanel` (that component is agent-specific and
  doesn't fit a memory) — showing content/scope/importance/confidence/
  source, and for a `company`-scope memory, a "Promote to group" button
  that calls the **existing** `POST /api/memories/:id/promote` endpoint
  unchanged. Clicking a document node (Phase 5) opens a second, separate
  detail panel (`data-testid="brain-document-panel"`) showing its real
  title/company/mime type/upload date — the same fields `/api/brain`
  already returned but nothing in the UI ever surfaced before this.

Same trade-off as the Organization layer: clicking a specific memory or
document node isn't covered by the automated suite — duplicating r3f's
camera projection math to compute a screen point isn't worth it for what
it'd buy. `tests/e2e/brain.spec.ts` covers everything DOM-based (the scene
mounting, the real stat counts); the click → detail-panel interaction, and
the core/node visual correctness, were verified manually with real
headless-browser screenshots instead.

### Operator rank

`lib/agent-title.ts`'s `deriveAgentRank()` maps an agent's existing `scope`/
`department_id` columns onto the founder-facing hierarchy language (no
schema change, no new API field beyond what `/api/map` and `/api/agents`
already needed to additionally select): `scope="group"` → **Group
Executive**; `scope="company"` with no department → **Company Executive**
(the CEO-style agents); `scope="company"` with a department → **`{role_title}`
Lead** (e.g. "Sales Lead"). Every surface that shows an agent's role — the
colony world's character labels, `ActivityFeed`, `OfficeAgentPanel`, and
`AgentSwitcher` — calls this instead of displaying raw `role_title`.

### Command Mode

The colony's camera was fully static until this pass — set once via the
`camera={{position: [...]}}` prop on `<Canvas>` (react-three-fiber only
calls `camera.lookAt(0,0,0)` once, on initial mount; changing the `camera`
prop afterward never repositions an already-created camera), always framed
to fit the entire colony. Switching companies changed `activeCompanyId`
and highlighted a ring, but the camera never moved. This pass makes
company-switching and "seeing everything" two real, distinct camera
states, connected by a smooth tween:

- **`CameraRig`** (an internal, unexported component inside
  `OfficeScene3D.tsx`) lives inside the `<Canvas>` and uses `useThree()` +
  `useFrame()` to lerp the real camera's position toward a target every
  frame, calling `camera.lookAt()` each frame — the standard r3f rig
  pattern for a camera that must move after mount. `cameraTargetFor()`
  computes that target purely from real layout geometry: focused on the
  active district's own `x`/`y`/`radius` by default, or the whole colony's
  extent (`colonyDist()` — the same computation the original fixed camera
  always used) when Command Mode is on. Both share the same angled-overhead
  ratios (`cameraPositionFor()`) so the two states read as one camera on a
  dolly, not two different cameras.
- **Founder Command Mode** is an explicit toggle (`office/page.tsx`'s
  header button, `aria-pressed`) that pulls the camera back to frame the
  whole colony and raises `components/office3d/CommandHUD.tsx`, a plain DOM
  overlay (not a drei `<Html>` inside the Canvas — avoids z-index/event
  complexity for something that isn't part of the 3D world) built on the
  shared `Panel` primitive. Every number on it is computed client-side from
  `layout.agents`/`layout.districts` — the same org-wide object
  `officeLayout()` already produces from `/api/map`'s unscoped response —
  so it's correct regardless of which company happens to be selected in
  the switcher, with **zero new fetch and zero new API route**. The state
  breakdown (executing/blocked/awaiting-approval/collaborating/delivered/
  sleeping/idle counts) reuses `lib/agent-visual-state.ts`'s existing
  `deriveAgentState()` — the exact function `AgentFigure` already calls
  per-character — via a `summarizeAgentStates()` helper that sums it across
  every Operator in the org; only non-zero chips render, no padding to look busier than the
  fixture data actually is.
- One real bug this pass caught only by looking at a screenshot: the HUD
  first rendered hundreds of pixels below the viewport, in normal document
  flow rather than floating over the scene — `Panel`'s own hardcoded
  `relative` class was fighting an `absolute` override passed alongside it
  through Tailwind's class-order (not DOM-order) cascade. Fixed by wrapping
  `Panel` in its own positioned `<div>` instead of overriding its
  className directly.

### Testing note

Clicking a specific 3D district or Operator isn't covered by the automated
Playwright suite — computing the exact screen coordinate would mean
duplicating r3f's camera projection math just to compute a click point,
which isn't worth it for what it'd buy. Everything DOM-based (scene
mounting, left nav/category row navigation, activity feed/terminal
rendering real fixture data, and — new this pass — Command Mode's HUD
counts and state chips) has real e2e coverage. The scene's own visual
correctness (camera framing, district/Operator rendering, the state glow,
and the camera tween itself) and the click → active-company / click →
agent-overlay interactions were verified manually via real
headless-browser screenshots — see `tests/e2e/office.spec.ts`'s header
comment and [`TESTING.md`](./TESTING.md).

