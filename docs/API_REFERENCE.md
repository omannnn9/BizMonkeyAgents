# API reference

All routes live under `app/api/`, are wrapped in `withApiErrorHandling`
(`lib/api-error.ts` — an unhandled throw becomes a clean JSON 500 + a Sentry
capture rather than crashing), and check `isDemoMode()` first — with no
Supabase project configured, every route below returns realistic fixture
data from `lib/demo-mode.ts` instead of touching a database. There is no
authentication on any route; the app has no login (see
[`ARCHITECTURE.md`](./ARCHITECTURE.md#no-login-by-design)).

## `GET /api/companies`

Lists every company (`id, name, slug, parent_id`), ordered by name.

## `POST /api/companies`

The company-creator wizard's endpoint (`/companies/new`).

**Body:** `{name, slug, parentId: string | null, industry?}`

Creates the company, then **always** seeds a default CEO Agent for it
(`query_company_data`, `search_documents`, `send_email`,
`generate_board_report`) and the matching `edges` rows (`owns` from parent,
`has_agent` to the new agent) — enforced structurally, not left as a manual
follow-up step. Writes an `audit_log` row (`create_company`).

**Response:** `{company: {id, name, slug, parent_id}, agentId}`

## `GET /api/agents?companyId=`

Lists active agents for a company (`id, name, role_title, scope,
department_id`). The last two, added this pass, feed
`lib/agent-title.ts`'s `deriveAgentRank()` — the display rank shown in
`AgentSwitcher` instead of raw `role_title`.

## `POST /api/agents`

The agent-creator wizard's endpoint (`/agents/new`). A founder-direct
action — not agent-proposed, so it isn't approval-gated.

**Body:** `{name, roleTitle?, companyId, scope, persona, model?, tools: string[]}`

Every tool name in `tools` must resolve via `getToolByName()`
(`lib/agent/tools/registry.ts`) — an unrecognized name returns `400 Unknown
tool(s): ...` rather than silently creating an agent missing a capability.
Writes the matching `edges` row (`has_agent`) and an `audit_log` row
(`create_agent`).

**Response:** `{agent: {id, name, role_title}}`

## `POST /api/chat`

Runs one turn against an agent.

**Body:** `{activeCompanyId, agentId?, message, history: Array<{role, content}>}`

If `agentId` is omitted, resolves the company's default `scope='company'`
agent (sorted by name, so "CEO Agent" wins alphabetically over
"Marketing"/"Sales" when more than one exists). Delegates to
`runAgentTurn()` — see
[`AGENTS_AND_TOOLS.md`](./AGENTS_AND_TOOLS.md#the-agent-runtime).

**Response:** `{message: string, toolCalls: Array<{name, input, result}>}`

## `GET /api/dashboard?companyId=`

Aggregate counts for a company (and its sub-companies, via
`getScopedCompanyIds`):

**Response:**
```
{
  openTasksCount: number,
  pendingApprovalsCount: number,
  lastAgentRun: {created_at, status, model} | null,
  recentDecisions: Array<{id, title, created_at}>,
  latestBriefing: {content, created_at} | null   // from the daily-briefing
                                                   // Edge Function, scoped
                                                   // to exactly companyId
                                                   // (not descendants)
}
```

## `GET /api/command`

The Founder Command Center's single data source (Phase 4) — org-wide,
unlike every other route here: no `companyId` param, since the whole point
is a cross-company view the founder can't get by clicking through each
company one at a time.

**Response:**
```
{
  companies: Array<{id, name, parent_id}>,
  attention: {
    pendingApprovals: Array<{id, proposed_by_agent_id, company_id, company_name, action_type, risk_level, created_at}>,
    blockedTasks: Array<{id, title, company_id, company_name, created_at}>,
    overdueTasks: Array<{id, title, company_id, company_name, due_at}>,
    atRiskGoals: Array<{id, objective, company_id, company_name, status}>,
  },
  companyHealth: Array<{
    companyId, companyName, openTasks, blockedTasks, pendingApprovals,
    lastRunAt, lastRunStatus, goalsOnTrack, goalsAtRisk, goalsOffTrack,
  }>,
  opportunities: Array<{similarity, companyA, memoryA, companyB, memoryB}>,  // match_cross_company_memories, same RPC detect_synergies uses
  recentActivity: Array<{id, agentId, status, output, createdAt}>,          // 15 most recent agent_runs, org-wide
  dailyBriefings: Array<{companyId, companyName, content, createdAt}>,     // latest memories.source='briefing' row per company
}
```

Every field traces to a real table already in the schema; `opportunities`
is computed live via `match_cross_company_memories`, never an LLM call —
that's reserved for `/api/briefing` below.

## `POST /api/briefing`

The Command Center's "Weekly Executive Briefing" action — a live
synthesis, not a stored artifact. Resolves OD Holdings' Chief of Staff
agent and runs it through `runAgentTurn()` (the same function `POST
/api/chat` uses) with a fixed prompt asking it to compile the week's
briefing from real tasks/decisions/goals across every company. Gets its
own independent `agent_runs` row, exactly like a real chat turn.

**Response:** `{message: string}` (same shape `POST /api/chat` returns) or
`{error: string}` (404) if no active Chief of Staff agent exists yet.

## `GET /api/activity?companyId=&agentId=`

Real activity feed data — the same query the `/office` right panel and
terminal strip (and, before its retirement, the standalone `/activity`
page) run.

**Response:** `{runs: RunRow[], logs: LogRow[]}` — up to 30 of each,
newest first. `runs` includes `output` (added specifically so the office
view's feed can show what an agent actually said, not just what it was
asked) and `tool_calls` (added so the World shell can derive real
`request_from_agent` collaboration edges — see
[`AGENTS_AND_TOOLS.md`](./AGENTS_AND_TOOLS.md#request_from_agent--agent-to-agent-collaboration-not-gated)
— from the same feed it already polls, no separate endpoint). Optional
`agentId` filters `runs` to one agent (used by `OfficeAgentPanel`).

## `GET /api/approvals?companyId=&agentId=`

**Response:** `{approvals: Array<{id, proposed_by_agent_id, action_type,
payload, risk_level, status, created_at}>}` — up to 50, newest first,
scoped via `getScopedCompanyIds`. Optional `agentId` filters to one
proposer.

## `POST /api/approvals/:id`

Decides a pending approval.

**Body:** `{decision: "approved" | "rejected"}`

1. 404 if the approval doesn't exist; 409 if it's not `pending`.
2. 403 unless `controlsApprovalsFor(userId, approval.company_id)` — a
   controlling member of that company or an ancestor.
3. On `rejected`: updates status, writes an audit row, returns
   `{status: "rejected"}`.
4. On `approved`: updates status, writes an audit row, then **attempts real
   execution** against the matching integration stub
   (`send_email`/`enrich_lead`/`generate_creative_asset` → `lib/integrations/*`).
   Writes the final status (`executed` or `failed`) and a second audit row.
   All three integrations are currently unconnected stubs, so approving any
   of them today resolves to `failed` with an explanatory error — see
   [`AGENTS_AND_TOOLS.md`](./AGENTS_AND_TOOLS.md#integration-stubs).

**Response:** `{status: "rejected" | "approved" | "executed" | "failed", error?: string}`

## `GET /api/documents?companyId=`

**Response:** `{documents: Array<{id, title, mime_type, tags, created_at}>}`

## `POST /api/documents/upload`

`multipart/form-data`: `file`, `companyId`, `title?` (defaults to the
file's name).

Accepts `.txt`/`.md`/`.csv`/`.pdf`/`.docx` (by MIME type or extension —
`415` otherwise). PDF text comes from `pdfjs-dist` (text extraction only,
never rendering — avoids a native-binary dependency), DOCX from `mammoth`.
Everything downstream only ever sees plain text. Uploads the raw file to
the `documents` storage bucket, inserts the `documents` row, chunks the
extracted text (`lib/documents/chunk.ts` — fixed 1000-char chunks, 150-char
overlap), embeds every chunk via Voyage (`lib/embeddings/voyage.ts`), and
inserts `document_chunks`. Auto-tags via a cheap Haiku call
(`lib/documents/auto-tag.ts`) — best-effort, a tagging failure never fails
the upload. Writes an `audit_log` row (`upload_document`).

**Response:** `{documentId, chunkCount, tags: string[]}` (or a `4xx/5xx`
with `{error}` at any failed step — extraction failure is `422`, unsupported
type is `415`).

## `GET /api/graph`

The full relationship graph (`/graph` page). Reads every row in `edges`
(capped at 500), resolves a human-readable label for each distinct
`(type, id)` via one explicit query per known entity type (`companies`,
`agents`, `documents`, `decisions`, `tasks`, `projects`, `departments` —
deliberately not a dynamic `.from(type)`, since the typed Supabase client
only accepts literal table names).

**Response:** `{nodes: Array<{id, type, label}>, edges: Array<{source,
target, relation}>}` — `id` is `"{type}:{uuid}"`.

## `GET /api/map`

A narrower slice of the same graph, purpose-built for the `/office` colony
viewport: only `company`→`company`/`agent` edges, each agent node enriched
with everything the scene needs without a second round trip — the
state-glow signal, and (added this pass) the fields
`lib/agent-title.ts`'s `deriveAgentRank()` needs for the colony's rank
labels.

**Response:** same node/edge shape as `/api/graph`, plus on agent nodes:
```
lastRunAt: string | null
lastRunStatus: "success" | "error" | "pending" | null
hasPendingApproval: boolean
status: string | null          // agents.status — powers the "sleeping" state
scope: string | null           // agents.scope
departmentId: string | null    // agents.department_id
roleTitle: string | null       // agents.role_title
```

## `GET /api/memories?companyId=`

**Response:** `{memories: Array<{id, scope, scope_id, content, importance,
confidence, source, created_at, promoted_from_id}>}` — every `group`/`founder`
memory plus `company`-scope memories for the active company and its
children (department/project/agent-scope memories aren't surfaced here yet
since nothing in the app currently creates one).

## `POST /api/memories/:id/promote`

The founder's manual promotion from `/memories` (mirrors the
`promote_memory` tool, but `actor_type: "user"` in the audit log instead of
`"agent"`). No body. Copies the memory to `group` scope, bumps importance
by +0.1 (capped at 1). **Response:** `{promoted: true, newMemoryId}`.

## `GET /api/brain`

The one new route the AI Brain pass added (the Knowledge layer inside the
World shell since the layers rearchitecture) — every other route is
scoped to a single `companyId` by design (the per-company pages), and there
was genuinely no existing endpoint that aggregates memories/documents/
connections across every company at once. Read-only, additive, no new
tables: `memories`/`documents` plus the existing `match_cross_company_memories`
RPC (the same one `detect_synergies` already calls).

**Response:**
```
{
  totalMemoryCount: number,          // count(*) from memories — drives the core's size
  memories: Array<{
    id, scope, scopeId, scopeLabel,  // scopeLabel resolved server-side:
    content, importance, confidence, // "Group" / "Founder" / the company's name
    source, createdAt,
  }>,                                 // newest 200
  documentCounts: Array<{companyId, companyName, count}>,  // only companies with >0
  documents: Array<{                 // newest 100 — individual rows the
    id, title, mimeType,             // Knowledge layer renders as document
    companyId, companyName, createdAt, // nodes, distinct from documentCounts
  }>,                                 // (an aggregate the stat row still uses)
  synergies: Array<{memoryAId, memoryBId, similarity}>,    // match_cross_company_memories, capped at 20
}
```
