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

## The Colony (`/office`)

The home page (`app/page.tsx` redirects `/` → `/office`; the nav label is
"Colony" — the route path stayed `/office` on purpose, a URL slug being a
technical detail rather than brand-facing). This is the richest surface in
the app — a dense, four-zone shell rebuilt across four passes (2D pixel art
→ a "Night Shift" dark re-theme → a mission-control shell with a
grid-of-rooms 3D viewport → the current OD Cortex radial colony world),
documented in full in the root [`README.md`](../README.md#status).
`app/(cockpit)/office/page.tsx` polls `/api/map`, `/api/dashboard`, and
`/api/activity` every 20s and lays out:

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
  viewport, the only place in the app using 3D. Reads `lib/office-layout.ts`'s
  **radial colony layout** (`SCALE = 40` world units per layout unit — see
  the file's own comments for two real bugs this pass's camera math hit and
  fixed, caught by screenshots rather than by the math alone). OD Holdings
  (the company with no parent) is the **Central Command District** at the
  origin; every other company orbits it as its own tinted platform, sized by
  how many Operators are stationed there, connected to the center by a
  glowing bridge drawn from the same real `owns` edges `/graph` already
  visualizes (the bridge glows brighter when that company is active — real
  UI state, not decoration). Each Operator is a flat-colored capsule+sphere
  figure (color hashed from the agent id, desaturated when `sleeping`)
  standing at a HUD-styled console whose screen is lit once the agent has
  ever produced a run. A glowing colored halo above each figure's head is
  `lib/agent-visual-state.ts`'s `deriveAgentState()` (`executing` / `blocked`
  / `approval` / `delivered` / `sleeping` / `idle` — six real states, see
  below) and a two-line label under drei's `<Html>` shows the Operator's
  name plus its rank via `lib/agent-title.ts`'s `deriveAgentRank()`. The
  camera is fixed and steep/near-overhead (no `OrbitControls`) — a full
  360° radial layout needs a much steeper angle than the old left-to-right
  grid did to avoid clipping whichever district happens to orbit nearest
  the lens; a modest 3/4 angle (the old grid's working value) visibly
  clipped districts here, caught on a screenshot and fixed by raising the
  camera rather than by adding user controls. Text labels use drei's
  `<Html>` (a DOM overlay) and the starfield atmosphere is a hand-rolled
  point cloud seeded with a deterministic PRNG, **never** drei's `<Text>`
  or `<Stars>` — an unfamiliar component's asset/randomness behavior isn't
  worth verifying fresh in a network-restricted sandbox when a same-effect
  primitive is cheap to hand-roll. Clicking a district calls
  `onSelectCompany`; clicking an Operator calls `onSelectAgent`, both via
  r3f's built-in mesh `onClick` raycasting.
- **`components/office3d/LeftNav.tsx`** — active company name (labeled
  "District"), a "recent" list (`/api/dashboard`'s `recentDecisions`), and
  a `Surfaces` nav (Graph/Documents/Memories/Approvals/Chat) — the real
  equivalents of a generic reference's Whiteboard/Design Board/Builder/
  Chats/Projects/Workflows labels, remapped rather than inventing pages for
  labels with nothing real behind them.
- **`components/office3d/ActivityFeed.tsx`** — real `agent_runs.output`,
  attributed by Operator name **and rank** (`deriveAgentRank`, via an
  `agentInfoById` map built from `/api/map`'s node list, not a second
  lookup). An Operator with no output yet shows its last real status, never
  invented dialogue.
- **`components/office3d/TerminalStrip.tsx`** — the same `agent_runs`/
  `audit_log` rows the feed already fetched, re-presented as raw
  auto-scrolling monospace log lines (`[HH:MM:SS] agent_run agent=... `/
  `[HH:MM:SS] audit actor=...`). No second data source.
- **Category row** — `Documents`/`Memories`/`Graph`/`Approvals`/`+New
  company`/`+New agent`, plain links.
- **`components/OfficeAgentPanel.tsx`** — the click-an-Operator overlay:
  a header showing the Operator's name and rank, `AgentChatPanel` (the same
  chat implementation `/chat` uses), pending approvals for that one agent
  (Approve/Reject, reusing `POST /api/approvals/:id`), and recent runs.

`/office`'s `/activity` predecessor page is retired entirely — its job is
now this feed + terminal strip, the same "fold into `/office`, keep the API
route" pattern the earlier `/dashboard` and `/map` pages went through.

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
  breakdown (executing/awaiting-approval/blocked/delivered/sleeping/idle
  counts) reuses `lib/agent-visual-state.ts`'s existing `deriveAgentState()`
  — the exact function `AgentFigure` already calls per-character — via a
  new `summarizeAgentStates()` helper that sums it across every Operator in
  the org; only non-zero chips render, no padding to look busier than the
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

## Hierarchy Map (`/hierarchy`)

The founder's org-chart ask fulfilled literally: Founder → Group Executives
→ Company Executives → Department Leads, as a real tree rather than a
force-directed network. Built entirely from `/api/map`'s existing response
— no new route, no new fetch.

- **`lib/hierarchy-layout.ts`** — a deterministic top-down tree layout
  (`hierarchyLayout(nodes, edges)`), deliberately **not**
  `graph-layout.ts`'s force-directed `forceLayout()`: a hierarchy shouldn't
  visibly jitter into place or allow crossing edges. Two-pass algorithm —
  post-order to compute each subtree's width, pre-order to center each
  node under its children's span. Builds the tree from the same
  `MapNode`/`MapEdge` shape `/api/map` already returns: a synthetic
  `"founder"` root (a real label, not a fabricated row — there's no
  "founder" table, this position is the human user) above the company with
  no parent, which fans out into its own agents and child companies, each
  child company's own agents beneath it. Every agent node carries
  `lib/agent-title.ts`'s `deriveAgentRank()` label — the identical
  "Group Executive"/"Company Executive"/"`{Department}` Lead" language the
  colony world and `ActivityFeed` already use.
- **`app/(cockpit)/hierarchy/page.tsx`** — fetches `/api/map` once (the
  exact same call `/graph` makes), runs it through `hierarchyLayout()`,
  renders an SVG reusing `/graph`'s proven hologram glow system (the same
  `feGaussianBlur`+`feMerge` filter and grid `<pattern>` background,
  copied rather than extracted into a shared component — a little
  duplication between two small pages over a premature shared primitive)
  with **elbow bezier connectors** between a parent's bottom edge and each
  child's top edge instead of `/graph`'s bowed circuit-trace edges — reads
  as an org chart, not a network, while staying visually related to
  `/graph`. Agent nodes show two lines (name, then rank in a smaller/dimmer
  line, the same pattern the colony world's character labels use); the
  Founder node gets a distinct gold/amber border since it's the one node
  that isn't a data row. Nodes fade in staggered by tree depth on load (a
  plain CSS `transition-delay`, no animation library). Clicking a company
  node calls the same `setActiveCompanyId` every other company-switching
  interaction in the app already uses; clicking an agent node opens the
  **existing** `components/OfficeAgentPanel.tsx` overlay unchanged — real
  chat, pending approvals, and recent runs, from a component that already
  existed rather than a new one.

Unlike the colony world's 3D character clicks, `/hierarchy`'s node clicks
are plain SVG `<g role="button">` elements — fully automatable, no camera
projection math to duplicate — so `tests/e2e/hierarchy.spec.ts` covers the
agent-click → `OfficeAgentPanel` interaction directly, real data included,
rather than deferring it to a manual screenshot check.

## AI Brain (`/brain`)

The founder's central-intelligence-core ask: *"a large glowing neural
sphere... When memories are created, connections appear. When documents
are uploaded, knowledge flows into the core. The AI Brain should become
visibly larger and richer over time."* Unlike the Hierarchy Map, this is a
genuinely volumetric idea that reads flat in 2D SVG, so it's the one other
place besides the colony world that earns real 3D depth
(`@react-three/fiber`, already a dependency).

- **`GET /api/brain`** (new route — see [`API_REFERENCE.md`](./API_REFERENCE.md))
  aggregates across every company at once, since every other route is
  deliberately per-company-scoped for the per-company pages. Demo-mode-aware
  like every other route: `lib/demo-mode.ts`'s `demoBrain()` is built from
  the same fixture memories `demoMemories()` and `demoChatReply()`'s Group
  CFO synergy example already define, not new invented content.
- **What's honestly real, decided up front:** the core's size is a real
  function of an actual `count(*)` query (`base + log(count + 1) * factor`
  — small now, since this app has almost no seeded memory data, and that's
  the honest state to show rather than a minimum chosen to look impressive).
  Individual memory nodes are real rows (capped at 200, newest first, the
  same `.limit()` precedent `/api/map` already sets). Connections between
  nodes are exclusively `match_cross_company_memories` output — the same
  RPC `detect_synergies` already calls — and if it returns nothing for a
  small dataset, the Brain shows no arcs and says so in the stat row
  ("real result, not a failure," the same phrasing `detect_synergies`'s own
  tool description already uses). There is no fabricated live "packet
  traveling into the core" animation — this app has no Realtime
  infrastructure (no browser-side Supabase client, by design). What *is*
  real and safe to animate: the page polls `/api/brain` on the same 20s
  interval `/office` already uses, diffs this poll's memory-id set against
  the previous one, and gives any genuinely new id a one-time scale-in
  arrival animation — event-driven off a real diff, not a looping decoration.
- **`components/brain/BrainScene.tsx`** — the core is a layered
  wireframe/glow sphere (several transparent `meshBasicMaterial` halo
  shells at increasing radius/decreasing opacity, a cheap stand-in for a
  real bloom pass this app's pipeline doesn't have). Memory nodes sit on a
  shell around the core, positioned via a Fibonacci-sphere formula
  (deterministic, even coverage, no physics simulation and no new
  dependency — the same "hand-roll it for a few dozen items" precedent
  `graph-layout.ts`'s `forceLayout` and `hierarchy-layout.ts`'s tree layout
  already set, extended to 3D), colored by scope (group/founder get fixed
  colors; company-scope memories are tinted per company using the same
  `hashToIndex` palette approach `OfficeScene3D.tsx` already uses for
  districts). Synergy connections render as glowing bezier arcs through 3D
  space between the two real memory nodes in each pair. Camera distance is
  computed from the shell radius with generous margin, verified with a real
  screenshot before calling this done — the same discipline that already
  caught camera-framing bugs in the colony world (twice) and the Hierarchy
  Map's `viewBox` (once).
- **`app/(cockpit)/brain/page.tsx`** — polls `/api/brain` every 20s, tracks
  the previous poll's memory-id set in a ref to compute arrivals, and shows
  a stat row (memories retained / documents indexed / cross-company
  connections, or the honest "no connections yet" message). Clicking a
  memory node opens an inline detail panel — own to this page, not
  `OfficeAgentPanel` (that component is agent-specific and doesn't fit a
  memory) — showing content/scope/importance/confidence/source, and for a
  `company`-scope memory, a "Promote to group" button that calls the
  **existing** `POST /api/memories/:id/promote` endpoint unchanged.

### Testing note

Same trade-off as the colony world: clicking a specific memory node isn't
covered by the automated suite — duplicating r3f's camera projection math
to compute a screen point isn't worth it for what it'd buy.
`tests/e2e/brain.spec.ts` covers everything DOM-based (the scene mounting,
the real stat counts, the honest empty-synergy message); the click →
detail-panel interaction, and the core/node visual correctness, were
verified manually with real headless-browser screenshots instead.
