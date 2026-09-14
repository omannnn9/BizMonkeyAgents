# Frontend

## Layout and shell

`app/layout.tsx` is the root HTML shell (fonts, metadata — `robots: {index:
false}` since this is an internal tool). `app/(cockpit)/layout.tsx` fetches
the company list server-side (or `DEMO_COMPANIES` in demo mode), wraps
children in `CompanyProvider` (`lib/company-context.tsx`), and renders
`CockpitShell`.

`lib/company-context.tsx`'s `CompanyProvider` holds the active company in
client state, persisted to `localStorage` (`od-group.active-company-id`) so
switching companies is a state update + re-fetch, never a navigation.
Defaults to the group-level company (`parent_id === null`) if present.

`components/CockpitShell.tsx` renders the header (logo, demo-mode banner,
`CompanySwitcher`) and the sidebar nav (`NAV`: Office/Chat; a `MORE_NAV`
disclosure: Graph/Documents/Memories/Approvals; `CREATE_NAV`: +New
company/+New agent). **One exception:** on `pathname === "/office"`, the
entire sidebar (and its mobile hamburger toggle) is suppressed — the office
page's own `LeftNav` component covers the same ground, so stacking a second
nav on top of it would be redundant. `<main>` padding also differs
(`p-4 sm:p-6` everywhere except `/office`, which owns its own spacing for
the 4-zone layout).

## Company/agent switching

`CompanySwitcher` (a plain `<select>`) reads/writes `useCompany()`.
`AgentSwitcher` is a `<select>` that only renders when a company has more
than one agent (a single-agent company has nothing to switch between).
Used on `/chat` and inside `OfficeAgentPanel`.

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
posting to `/api/documents/upload` as `FormData`, then a plain list of
uploaded documents (title, tags, date) fetched from `/api/documents`. A
`latestRequestedCompanyId` ref discards a slow response for a company the
user has since switched away from.

## Approvals

`app/(cockpit)/approvals/page.tsx` splits into "Pending" and "History"
sections. `PayloadPreview` renders `send_email` payloads specially (to/
subject/body) and falls back to a raw `JSON.stringify` for anything else.
Approve/Reject posts to `/api/approvals/:id` and surfaces the real outcome,
including the distinction between "approved" and "approved, but could not
execute: {error}" (an unconnected integration stub failing loudly, not
silently).

## Memories

`app/(cockpit)/memories/page.tsx` — lists memories for the active company
(group + founder + company-scope), with a "Promote to group" button on any
`company`-scope row (posts to `/api/memories/:id/promote`).

## Knowledge graph (`/graph`)

`app/(cockpit)/graph/page.tsx` fetches `/api/graph` once, lays the
nodes/edges out via `lib/graph-layout.ts`'s `forceLayout()` (a small
hand-rolled repulsion/spring/center-pull simulation, 300 fixed iterations —
deliberately not a new dependency like d3-force or React Flow, since this
is a few dozen nodes at most), and renders an SVG with a **glowing
"hologram" treatment**: an `feGaussianBlur`+`feMerge` filter for the
blur-behind-a-bright-core glow effect, a `<pattern>` grid background, edges
as quadratic-bezier `<path>`s bowed perpendicular to their segment (reads as
a circuit trace, not a wireframe diagram — the bow amount is deterministic,
not physics-based, so the same graph always draws the same way), and nodes
as glow-filtered rounded `<rect>` panels (width sized to label length) with
a small colored dot per node type (`colorForNodeType()`). Clicking a node
shows its connections in a side panel (`data-testid="graph-detail-panel"`).

## Company/agent creator wizards

`/companies/new` and `/agents/new` are plain controlled forms posting to
`POST /api/companies`/`POST /api/agents` respectively. The agent wizard's
`AVAILABLE_TOOLS` list is a small hardcoded mirror of
`lib/agent/tools/registry.ts`'s `ALL_TOOLS` (kept separate rather than
importing the registry into a client component, since the registry pulls
in server-only Supabase logic through its tool implementations) — every
tool name it can submit is validated server-side regardless.

## Office mission-control (`/office`)

The home page (`app/page.tsx` redirects `/` → `/office`). This is the
richest surface in the app — a dense, four-zone shell rebuilt across three
passes (2D pixel art → a "Night Shift" dark re-theme → the current
mission-control shell with a real 3D viewport), documented in full in the
root [`README.md`](../README.md#status). `app/(cockpit)/office/page.tsx`
polls `/api/map`, `/api/dashboard`, and `/api/activity` every 20s and lays
out:

```
┌───────────┬─────────────────────────┬──────────────┐
│ LeftNav   │      OfficeScene3D       │ ActivityFeed │
│ (desktop  │  (always visible)        │ (desktop     │
│  only)    │                          │  only)       │
├───────────┴─────────────────────────┴──────────────┤
│  Category row (Documents/Memories/Graph/Approvals…) │
├──────────────────────────────────────────────────────┤
│  TerminalStrip                                        │
└──────────────────────────────────────────────────────┘
```

- **`components/office3d/OfficeScene3D.tsx`** — the `@react-three/fiber`
  viewport, the only place in the app using 3D (reintroduced a third time
  specifically for this pass, after being removed twice before — once
  after the original `/hq` prototype, once when 2D pixel art replaced it —
  each time to avoid the dependency weight until a reference genuinely
  called for real 3D depth again). Reuses `lib/office-layout.ts`'s
  deterministic per-company grid coordinates unchanged, read as a 3D floor
  plan (`SCALE = 40` world units per layout pixel — see the file's own
  comment for the invisible-character bug this value was tuned to fix) instead
  of canvas pixels — `office-layout.ts` itself has no knowledge of 3D.
  Each company is a room (two walls, open toward a fixed camera — no
  `OrbitControls`); each agent is a flat-colored capsule+sphere figure
  (color hashed from the agent id) seated at a desk with a monitor that's
  actually lit once the agent has ever produced a run (not decorative). A
  glowing colored halo above each character's head is
  `lib/agent-visual-state.ts`'s `deriveAgentState()` — the same
  working/error/needs-approval/delivering/idle logic every visual pass of
  this page has used, now centralized so it doesn't get reimplemented per
  renderer. Text labels use drei's `<Html>` (a DOM overlay), **never**
  drei's `<Text>` (troika-three-text), which fetches a font file over the
  network and silently breaks in a network-restricted sandbox — a lesson
  carried over from the retired `/hq` prototype. Clicking a room calls
  `onSelectCompany`; clicking a character calls `onSelectAgent`, both via
  r3f's built-in mesh `onClick` raycasting.
- **`components/office3d/LeftNav.tsx`** — active company name, a "recent"
  list (`/api/dashboard`'s `recentDecisions`), and a `Surfaces` nav
  (Graph/Documents/Memories/Approvals/Chat) — the real equivalents of a
  generic reference's Whiteboard/Design Board/Builder/Chats/Projects/
  Workflows labels, remapped rather than inventing pages for labels with
  nothing real behind them.
- **`components/office3d/ActivityFeed.tsx`** — real `agent_runs.output`,
  attributed by agent name (via a `Map` built from `/api/map`'s node list,
  not a second lookup). An agent with no output yet shows its last real
  status, never invented dialogue.
- **`components/office3d/TerminalStrip.tsx`** — the same `agent_runs`/
  `audit_log` rows the feed already fetched, re-presented as raw
  auto-scrolling monospace log lines (`[HH:MM:SS] agent_run agent=... `/
  `[HH:MM:SS] audit actor=...`). No second data source.
- **Category row** — `Documents`/`Memories`/`Graph`/`Approvals`/`+New
  company`/`+New agent`, plain links.
- **`components/OfficeAgentPanel.tsx`** — the click-a-character overlay:
  `AgentChatPanel` (the same chat implementation `/chat` uses), pending
  approvals for that one agent (Approve/Reject, reusing
  `POST /api/approvals/:id`), and recent runs.

`/office`'s `/activity` predecessor page is retired entirely — its job is
now this feed + terminal strip, the same "fold into `/office`, keep the API
route" pattern the earlier `/dashboard` and `/map` pages went through.

### Testing note

Clicking a specific 3D character isn't covered by the automated Playwright
suite — computing the exact screen coordinate for a given character would
mean duplicating r3f's camera projection math just to compute a click
point, which isn't worth it for what it'd buy. Everything DOM-based (scene
mounting, left nav/category row navigation, activity feed/terminal
rendering real fixture data) has real e2e coverage. The scene's own visual
correctness (camera framing, character/room rendering, the state glow) and
the click → agent-overlay interaction were verified manually via real
headless-browser screenshots — see `tests/e2e/office.spec.ts`'s header
comment and [`TESTING.md`](./TESTING.md).
