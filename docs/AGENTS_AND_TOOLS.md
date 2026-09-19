# Agents, tools, and the approval gate

> Named `AGENTS_AND_TOOLS.md` rather than `AGENTS.md` on purpose — this
> repo's `AGENTS.md` at the project root is auto-generated/re-written by
> `next dev` itself (Next.js's own agent-instructions file) and is unrelated
> to this app's own AI agents.

## The agents themselves

There is no hardcoded agent roster in code. Every agent is a row in the
`agents` table (`name`, `role_title`, `company_id`, `department_id`, `scope`,
`persona`, `model`, `tools`, `status`). Migration `0009_org_rebuild.sql`
replaced the original templated CEO/Sales/Marketing-Agent-per-company
roster (flagged by the Ecosystem Audit as its top agent-level finding —
four near-identical CEO Agents, three near-identical Sales/Marketing
pairs, Group CFO and Group Strategy sharing one persona) with 20 agents
that each have a real, non-overlapping job grounded in what each
company's own `config`/`industry` says about its actual business:

**OD Holdings (group scope)** — six agents. **Group CEO** (migration
`0012_group_ceo.sql`) sits at the top: the founder's default point of
contact and the only group agent that actually delegates real work rather
than just reporting on it — `assign_task` and `create_goal` reach straight
down into any company, not just the other five group agents. Below it:
Group CFO (spend discipline, `generate_board_report`), Group Strategy
(goal cascade, `create_goal`, `detect_synergies`), Group Operations
(execution health across every company, the routing point for
cross-company `request_from_agent` calls, `assign_task`), Group
Intelligence (curates memories — `promote_memory`, `update_memory`,
proactive `detect_synergies`), and Chief of Staff (synthesizes the other
four *for the CEO*, the way it used to for the founder directly; owns no
functional lane of its own). The founder is never restricted to talking to
the CEO only — every agent, including these five, stays directly reachable
in chat; the CEO is the default, not a gate.

**Each company (ODAX, Tablo, NOVA)** — five company-scope agents: a
Managing Director/Studio Director (company-wide synthesis, `assign_task`,
`create_goal`, `send_email`), a department-specific sales-motion lead
(Sales Lead / Restaurant Growth Lead / Growth Lead — matched to how that
company actually acquires customers), a Marketing Lead, a Customer
Success Lead, and one company-specific fifth seat (Operations Lead for
ODAX, Partnerships Lead for Tablo, Engineering Lead + Product Lead +
Delivery Lead for NOVA, whose real unit of work is the client project, not
a sales funnel).

`request_from_agent` and `record_memory` (migrations
`0007_agent_collaboration.sql`, `0009_org_rebuild.sql`, and
`0012_group_ceo.sql` for the Group CEO itself) are granted to every one of
the 21 active agents — real agent-to-agent collaboration and self-service
memory writing are baseline capabilities, not scoped to group-level agents
the way `detect_synergies` is (see below).

`role_title` is `null` for every agent whose `name` is already the fully
specific title (e.g. "Sales Lead" — no separate title to add) — only the
four group agents whose name doesn't already say what they do (Group CFO,
Group Strategy, Group Operations, Group Intelligence) carry a distinct
`role_title` ("Chief Financial Officer", "Head of Strategy", "Head of
Operations", "Head of Intelligence"). `lib/agent-title.ts`'s
`deriveAgentRank()` deliberately never interpolates `role_title` into the
displayed rank — it returns a generic tier label (Group Executive /
Company Executive / Department Lead / Specialist) from `scope`/
`department_id` alone, so a name like "Sales Lead" never renders as
"Sales Lead Lead".

A founder can create more via `/agents/new` (`POST /api/agents`) — any
combination of name, persona, model, and tools, as long as every requested
tool name is actually registered (see below).

## The agent runtime

`lib/agent/agent-runtime.ts`'s `runAgentTurn()` is the single entry point
for running one user turn against **any** agent row — the CEO agent, a
department agent, a future custom one, or another agent invoked mid-turn by
`request_from_agent` (see below). It takes `{agentId, activeCompanyId,
userId, userMessage, history, depth?}` and:

1. Loads the agent's `model` and `tools` columns.
2. Resolves `tools` to real `AgentTool` objects via `resolveTools()`.
3. Calls `assembleSystemPrompt()` once (see below) to build the system
   prompt for this turn.
4. Loops against `anthropic.messages.create()`, up to `MAX_TOOL_ITERATIONS = 6`
   times: on `stop_reason === "tool_use"`, executes every tool-use block
   server-side via the tool's own `handler`, appends the results as
   `tool_result` blocks, and calls again. Stops as soon as the model returns
   a non-tool-use response (or the iteration cap is hit).
5. Inserts **exactly one** `agent_runs` row for the whole turn regardless of
   how many tool iterations happened inside it — input, output, the full
   `tool_calls` log, model, `tokens_in`/`tokens_out` (summed across every
   API call in the loop), `latency_ms`, and `status` (`success`/`error`).
6. On a thrown error mid-loop, catches it, sets `status: "error"`, and
   still writes the run row with a plain-language error message as the
   output — a crash is a real, visible run, never a silent gap in the log.

Returns `{message, toolCalls}` to the caller — normally `POST /api/chat`,
but `request_from_agent`'s handler calls `runAgentTurn()` directly too, the
same function, no special-cased "internal" variant. `depth` (default `0`)
is threaded into that inner call's `ToolContext` so a chain of
collaboration requests can be bounded — see `request_from_agent` below.

## Context assembly

`lib/agent/context-assembly.ts`'s `assembleSystemPrompt()` builds a fresh
system prompt every turn — a shared "who we are" + role-discipline
preamble, persona, a handful of directly relevant structured rows, and the
most relevant memories, **never a full-table dump** (this is what keeps
token cost and noise down as the business's data grows, and — as of
migration `0013_role_boundaries.sql` — what keeps one agent from seeing
another company's or another agent's private data). Concretely:

- The agent's `persona` text, prefixed with `"You are {name}, {role_title}
  for {company}."`
- **Group structure** (`buildGroupStructureSection()`): real, DB-backed —
  queries every active `companies` row, not a hardcoded string, so a new
  subsidiary is picked up automatically with zero code change. Built from
  the founder's name/title and OD Holdings' mission (`companies.config` on
  the group row) plus each subsidiary's real `industry`/`purpose`/
  `competitors` (`companies.config` on that row). Every agent gets this
  regardless of which company happens to be active — the "know everything
  about OD Holdings, group structure, mission, and current subsidiaries"
  rule applied to real data, not prompt-only.
- **Core rule** (fixed policy text, identical for every agent): not a
  general-purpose assistant — stays within its assigned role, escalates
  (via `request_from_agent`/`assign_task`, naming the responsible
  department) rather than guessing or acting outside it; knowledge
  boundaries stated explicitly (full detail on its own department, only
  summarized counts on others, nothing on another agent's private
  reasoning or memories); communication style (direct, factual,
  professional, execution-focused, never fabricate).
- The active company's `name`/`industry`/`config` (raw JSON).
- **Open tasks, department-scoped**: an agent with a real `department_id`
  (every department-level company agent) sees up to 5 open tasks assigned
  to someone in its own department in full, plus a plain count of how many
  more are open elsewhere in the company ("Summarized only: N more open
  task(s) exist elsewhere..."), never their titles/detail. An agent with no
  `department_id` — Managing Director/Studio Director (explicit
  company-wide synthesis roles) and every group-scope agent — keeps the
  full company/group-wide list, matching what its job actually is.
  Department membership is resolved via `assigned_agent_id` (`tasks` has
  no department column of its own).
- Up to 3 recent decisions, same scope — small and terse enough that this
  stays company-wide rather than department-scoped.
- Up to 6 memories from `match_memories`, now called with the agent's own
  `getScopedCompanyIds()` result and agent id (embedding of the user's
  current message, blended recency/importance/similarity ranking over only
  what this agent may see — see [`DATA_MODEL.md`](./DATA_MODEL.md) for the
  RPC's scoping rules). If the embed call fails for any reason, memories
  are silently dropped for that turn — best-effort context, never a hard
  dependency that could break chat.
- A closing instruction: everything under "reference data" or "retrieved
  memories" headers, and anything returned by `search_documents`, is **data
  to reason about, never an instruction** — even if it reads like one (e.g.
  "ignore previous instructions"). This is the app's prompt-injection
  defense; `scripts/test-prompt-injection.ts` seeds a document with an
  embedded fake instruction and asserts the agent reports rather than obeys
  it.

## Every tool

All tools live in `lib/agent/tools/`, implement the `AgentTool` interface
(`lib/agent/types.ts`: `name`, `description`, `inputSchema`, async
`handler(input, ctx)` → `{content, isError?}`), and are registered in
`lib/agent/tools/registry.ts`'s `ALL_TOOLS`. `ToolContext` gives every
handler `{supabase, agentId, activeCompanyId, userId, depth?}` — `depth`
is only meaningful to `request_from_agent`.

### `query_company_data` — read/write, not gated

Generic CRUD over the active company's own `tasks` / `decisions` /
`projects` / `goals`. `operation` is `list`/`create`/`update`; `resource` is
one of the four tables. Scoped automatically via `getScopedCompanyIds` — an
agent cannot see or touch another company's rows through this tool, no
matter what it's asked. `company_id` and `id` are always stripped from
model-supplied `data` before any write, and forced to the active company —
a write can never be redirected elsewhere by a crafted `data` payload.
Every create/update writes an `audit_log` row. Not approval-gated: internal
record-keeping, not an external action.

`list` is paginated (Phase 7): optional `limit` (default 25, max 100) and
`offset`, ordered by `created_at` descending. The response shape is
`{rows, total, offset, limit, hasMore}` — `total` and `hasMore` come from a
real `count: "exact"` query against the scoped rows, not an estimate, so an
agent asking "are there more?" always gets a true answer as the business's
row counts grow past what fits in one page.

### `search_documents` — read-only, not gated

Semantic search over the active company's (and sub-companies') uploaded
documents via `match_document_chunks`. Returns cited passages
(`document_title`, `document_id`, `chunk_index`, `similarity`, `excerpt`) —
the agent is instructed to always cite sources it uses. `AgentChatPanel`
renders these citations under the assistant's reply.

### `send_email` — always approval-gated

Drafts `{to, subject, body}` and calls `gateAction()` with
`actionType: "send_email"`. **Always** routed through approval — there is
no automatic path in `action_policies` for it yet, and the tool's own
description tells the model this is non-negotiable regardless of phrasing.
If a future policy row ever does mark it automatic, the handler still
refuses to claim success (Gmail isn't connected — see
[Integration stubs](#integration-stubs)).

### `enrich_lead` — always approval-gated

Same shape as `send_email`, for Apollo.io lead enrichment
(`{domainOrEmail, reason}`). Only granted to Sales agents. Always gated —
touches a prospective customer's data.

### `generate_creative_asset` — always approval-gated

Same shape, for Higgsfield image/video generation (`{prompt, assetType}`).
Only granted to Marketing agents. Always gated — an external, brand-facing
action.

### `promote_memory` — write, not gated

Copies a `company`-scope memory into `group` scope (found via the first
`parent_id is null` company row), bumping `importance` by +0.1 (capped at
1.0). Writes an `audit_log` row. Internal knowledge management, not an
external action — no gate. The founder has the same action available
directly from `/memories` (`POST /api/memories/:id/promote`), logged with
`actor_type: "user"` instead of `"agent"`.

**Scoping (Phase 8)**: before promoting, resolves the original memory's
owning company via `resolveMemoryOwnerCompanyId()`
(`lib/agent/scoped-companies.ts`) and refuses if it isn't inside the
caller's own `getScopedCompanyIds` — the same boundary `record_memory`
enforces on write. Since `ctx.supabase` is the service-role client (RLS is
defense-in-depth, not the actual boundary), this app-level check is what
actually stops an agent from promoting a memory it was never scoped to see.

### `generate_board_report` — read/compile, not gated

Pulls goals, the 10 most recent decisions, and up to 20 open tasks across
the scoped company set and formats them as markdown (`# Board report —
{period}`). Every figure comes from a real row — never invents numbers.
Granted to every CEO-style agent plus both group-scope agents.

### `detect_synergies` — read-only, not gated

Calls `match_cross_company_memories` and returns candidate pairs
(`similarity`, both companies' names, both memory contents). Presented
explicitly as "candidates worth a look," not conclusions — this is plain
cosine similarity over existing embeddings, not a separate pattern-mining
system. Granted only to the two group-scope agents (Group CFO, Group
Strategy) — cross-company comparison is inherently a group-level concern.

### `request_from_agent` — agent-to-agent collaboration, not gated

`lib/agent/tools/request-from-agent.ts`. Takes `{targetAgentId, request}`,
loads the target `agents` row, and calls `runAgentTurn()` again — the
*same* runtime function `POST /api/chat` uses, not a separate "internal
agent call" code path. The target agent runs its own full turn (its own
tools, its own approval gates for anything external) and gets its own
independent `agent_runs` row, exactly like a real user turn would. The
calling agent's own tool result is `"{Target agent name} replied: {their
message}"`.

Not approval-gated: this is internal collaboration between agents already
in the same organization, the same trust boundary as calling your own
tools — the same reasoning as `promote_memory`/`generate_board_report`.
Anything the *target* agent tries to do externally (`send_email`, etc.)
still goes through its own gate independently; `request_from_agent` itself
never bypasses that.

**Recursion guard**: `MAX_COLLAB_DEPTH = 2`. `ToolContext.depth` (default
`0`) is incremented on every nested call; the handler refuses to recurse
once `depth >= MAX_COLLAB_DEPTH`, returning an error tool result instead of
calling `runAgentTurn()` again. Without this, two agents that both hold
`request_from_agent` and reference each other could recurse unboundedly —
nothing else in the runtime bounds nested calls.

**Cycle guard** (Phase 7, on top of the depth cap): `ToolContext.collabChain`
carries the list of agent ids already visited in this collaboration's
lineage (seeded with the turn's own `agentId` in `runAgentTurn()`, extended
with `target.id` on every nested call the handler makes). Before recursing,
the handler checks whether the requested `targetAgentId` is already in that
chain and refuses immediately if so — a real A → B → A ping-pong is caught
on its first repeat, rather than being allowed to burn the entire
`MAX_COLLAB_DEPTH` budget bouncing between the same two agents instead of
reaching anyone new. The depth cap and the cycle guard are independent
checks: depth bounds *how long* a chain can get, the cycle guard bounds
*where it can go*.

**Collaboration-routing rule** (`canCollaborateAcrossCompanies()` in
`lib/agent/scoped-companies.ts`, added Phase 3): same-company requests and
requests where either side is scope `'group'` go through freely; two
different companies' agents cannot reach each other directly — the handler
refuses with a message pointing at Group Operations/Group Strategy, the
same routing a real holding company would use. `getAgentScopeInfo()` fetches
the calling agent's own `{company_id, scope}` (`ctx.agentId` doesn't carry
this directly), then checks it against the target's. `assign_task` uses the
same helper and rule.

Granted to all 21 seeded agents (migrations `0007_agent_collaboration.sql`,
`0009_org_rebuild.sql`, `0012_group_ceo.sql`). Writes one `audit_log` row directly (`action:
"collaborate:request_from_agent"`) — the same "skip `gateAction`, write the
log yourself" pattern `promote_memory` uses for ungated internal actions —
and, best-effort (wrapped so a failure here never fails the collaboration
itself), a real **collaboration memory**: `scope: "agent"`, `scope_id` the
*calling* agent's own id, embedded and retrievable via `match_memories` on
that agent's future turns, summarizing what was asked and what came back.
This is what makes a collaboration a durable part of the organization's
knowledge instead of only a log line nobody's context ever re-reads —
and, since `match_memories` (migration `0013_role_boundaries.sql`) only
returns a `scope: 'agent'` row to the exact agent it belongs to, it stays
genuinely private: no other agent, including the one on the other end of
the collaboration, ever retrieves it.

**Visualized in three places**: `AgentChatPanel`'s `NOTEWORTHY_TOOLS`
surfaces the target agent's reply as an inline note under the calling
agent's message; the Colony (Organization layer) draws a connecting beam
between the two agents' real 3D positions for a couple of minutes after the
call; and, since this is the same real signal `assign_task` produces (see
below), the requesting Operator's own figure walks partway out toward the
target Operator's desk for that same window — see
[`FRONTEND.md`](./FRONTEND.md#the-colony-collaboration-beam--and-real-movement).

### `record_memory` — write a new memory, not gated

`lib/agent/tools/record-memory.ts`. Takes `{scope, scopeId?, content,
importance?, confidence?, sourceDocumentId?}`. Closes the gap the Ecosystem
Audit found central: until this tool existed, nothing in the codebase ever
created the *first* memory at a given scope — `promote_memory` only ever
copies one that already exists. Embeds `content` via Voyage
(`embedDocuments`) before inserting, so the memory is immediately
retrievable through `match_memories`. Validates that the resolved owning
company (via `departments`/`projects`/`agents` lookups for those scopes) is
inside the caller's own `getScopedCompanyIds` — an agent cannot record a
memory against a company it can't see, even indirectly through a department
or project row. `scope: "group"` additionally requires `scopeId` to be the
real top-level company. Writes with `source: "agent"` (migration
`0008_knowledge_flow.sql` added this value to `memories.source`'s check
constraint, alongside the existing `manual`/`briefing`/`document`/`promoted`).

### `update_memory` — revise a memory, not gated

`lib/agent/tools/update-memory.ts`. Takes `{memoryId, confidenceDelta?,
archive?, content?}`, at least one required. `confidenceDelta` is added to
the row's current `confidence` and clamped to `[0, 1]` — never set
absolutely, since two agents could otherwise race and stomp each other's
adjustment. `archive: true` sets the new `archived_at` column (migration
`0008`), which `match_memories` now excludes from retrieval entirely — a
deliberate "no longer useful" mark, distinct from the existing time-based
`expires_at`. `archive: false` un-archives. `content` replaces the text and
re-embeds it via Voyage.

**Scoping (Phase 8)**: same `resolveMemoryOwnerCompanyId()` +
`getScopedCompanyIds` check as `promote_memory` above — an agent can only
revise a memory whose owning company it can actually see.

### `assign_task` — delegate real work, not gated

`lib/agent/tools/assign-task.ts`. Takes `{title, description?,
assigneeAgentId, priority?, dueAt?, projectId?}`. Creates a real `tasks`
row with `assigned_agent_id` set — the column already existed in the
schema and was completely unused by any tool before this one. Validates
the assignee is `active` and applies the same `canCollaborateAcrossCompanies()`
routing rule `request_from_agent` uses, refusing (with a pointer to route
the request through Group Operations instead) rather than silently
assigning across an organizational boundary. The task's `company_id` is
the *assignee's* company, not the caller's active one — they can differ
when a group-scope agent delegates down into a specific company, and the
task genuinely belongs to whichever company will do the work. This is the
asynchronous counterpart to `request_from_agent`'s synchronous
request/reply: use it for anything that will take the assignee more than
one exchange. It's now the Group CEO's primary delegation tool (migration
`0012_group_ceo.sql`), and `lib/collaboration.ts`'s
`deriveCollaborationEdges()` treats a real, recent `assign_task` call as
the same kind of Colony signal `request_from_agent` produces — see
[`FRONTEND.md`](./FRONTEND.md#the-colony-collaboration-beam--and-real-movement).

### `record_decision` — log a structured decision, not gated

`lib/agent/tools/record-decision.ts`. Takes `{title, description?,
rationale?, relatedTaskId?}`. Writes directly to `decisions` — a fact of
record, distinct from a memory (a retrievable insight). `generate_board_report`
already reads this table; before this tool, nothing ever wrote to it
outside a manual insert.

### `create_goal` — the top of the work chain, not gated

`lib/agent/tools/create-goal.ts`. Takes `{objective, keyResults?, period?,
companyId?, parentGoalId?, departmentId?}`. `parentGoalId` and
`departmentId` are new `goals` columns (migration `0008`) that make a real
cascade possible for the first time: a group goal's children are company
goals, a company goal's children can be department goals. The tool's own
description tells agents never to create a goal on their own initiative —
only when the founder has actually asked for it or confirmed a proposal,
deliberately stricter than tasks or memories, which agents create freely.

## The approval gate

`lib/agent/approval-gate.ts`'s `gateAction()` is the **single** place any
tool checks whether it's allowed to act. No tool decides
automatic-vs-gated inline in its own body.

```
gateAction(supabase, {agentId, actionType, payload, riskLevel?})
  → look up action_policies.classification for actionType
  → classification ?? "founder_only"   (fail-safe default)
  → "automatic":
      write an audit_log row, return {allowed: true}
  → anything else:
      insert a pending `approvals` row, write an audit_log row,
      return {allowed: false, approvalId}
```

An `action_policies` row must **explicitly** say `automatic` before
anything skips human approval — an unrecognized `actionType` (e.g. a typo,
or a brand-new tool whose policy row hasn't been seeded yet) is treated as
the strictest tier, never the most permissive.

### Deciding an approval

`POST /api/approvals/:id` (see [`API_REFERENCE.md`](./API_REFERENCE.md))
checks `controlsApprovalsFor()`, updates `status`, writes an audit row, and
— only on `approved` — attempts real execution against the matching
integration stub. The result (`executed` or `failed`, with the stub's error
message) is written back to the row and the audit log. Nothing is ever
silently marked `approved` and left alone; an unconnected integration still
produces a visible, honest failure.

## Integration stubs

`lib/integrations/{gmail,apollo,higgsfield}.ts` are all deliberate stubs —
none of Gmail, Apollo.io, or Higgsfield are connected to this deployed app
yet (a Claude Code session's own MCP connectors, even if connected there,
aren't reachable by the app at runtime — each needs its own server-side API
key). Each stub's function signature and approval-gated call shape is real
and correct; the body always returns a `{sent: false, error}` /
`{enriched: false, error}` / `{generated: false, error}` explaining exactly
what's missing and what to do about it. This means:

- The full propose → approve → attempt-execution → fail pipeline is real
  and testable today.
- Approving one of these actions in the live app currently always ends in
  `status: "failed"`, with a clear reason shown in the Approvals page — never
  a false "sent successfully."
- Finishing any of the three integrations is a scoped, isolated change: add
  the real API key as an env var, replace the stub body, done — no other
  file needs to change.

## Tool registry and dynamic dispatch

`lib/agent/tools/registry.ts` is intentionally the only place that lists
every tool. `resolveTools(agent.tools)` filters an agent's declared tool
names down to real, registered tools (silently dropping unknown names at
runtime inside the chat loop — but see below, the creator UI refuses this
upfront). `getToolByName()` backs `POST /api/agents`'s validation: creating
an agent with an unrecognized tool name is rejected with a 400 rather than
silently creating an agent that's quietly missing a capability the founder
thought they'd granted.
