# Data model

The full schema lives in `supabase/migrations/`, applied in order to a
live Supabase project (`od-cortex`, see [`DEPLOYMENT.md`](./DEPLOYMENT.md))
— every migration through `0013_role_boundaries.sql` is applied. Everything
below describes what's actually running, not just what's written.

## Migrations, in order

| File | Adds |
|---|---|
| `0001_init.sql` | Every core table, RLS policies, the two retrieval RPCs (`match_memories`, `match_document_chunks`), denormalization triggers. |
| `0002_seed_companies.sql` | The four real companies (OD Holdings, ODAX, Tablo, NOVA), one CEO Agent each, the `send_email` action policy. |
| `0003_storage.sql` | The `documents` storage bucket + its RLS policies. |
| `0004_phase2.sql` | Sales/Marketing departments + agents for ODAX, `enrich_lead`/`generate_creative_asset` action policies, structural `edges`, `memories.source` column, a **commented-out** `pg_cron` daily-briefing schedule (template — needs a real project ref + Vault secret). |
| `0005_phase3.sql` | Sales/Marketing for Tablo and NOVA, the two group-scope agents (Group CFO, Group Strategy), `goals` table + RLS, `memories.source` gains `'promoted'`. |
| `0006_synergy_detection.sql` | `match_cross_company_memories` RPC, grants `detect_synergies` to the two group-scope agents. |
| `0007_agent_collaboration.sql` | Grants `request_from_agent` to all five seeded agents. |
| `0008_knowledge_flow.sql` | `memories.archived_at`, `memories.source` gains `'agent'`, `match_memories` excludes archived rows, `goals.parent_goal_id` + `goals.department_id` for real goal cascading. |
| `0009_org_rebuild.sql` | Replaces the templated CEO/Sales/Marketing-Agent roster with 20 real, non-overlapping agents (5 OD Holdings group agents + 5 per company); 7 new departments (Customer Success/Operations for ODAX, Partnerships/Customer Success for Tablo, Engineering/Product/Delivery for NOVA); grants `request_from_agent` + `record_memory` to every agent. |
| `0010_llm_provider_swap.sql` | `agents.model` default and every existing row swapped from an Anthropic model id to Groq's `openai/gpt-oss-120b`. |
| `0011_seed_founder.sql` | The single `auth.users` founder-identity row (direct SQL insert, see [`DEPLOYMENT.md`](./DEPLOYMENT.md)) + `company_members` grants across all 4 companies. |
| `0012_group_ceo.sql` | A new Group CEO agent at the top of OD Holdings (`has_agent` edge, real delegation tools), revises Chief of Staff's persona to report into it. |
| `0013_role_boundaries.sql` | Real founder profile + each subsidiary's purpose/competitors in `companies.config`; rewrites `match_memories` to actually scope results to the caller's companies and, for `scope: 'agent'` rows, the exact agent — see below. |

## Core tables

### `companies`

Every business unit, including the group level. `parent_id` (nullable,
self-referencing) forms the hierarchy — currently two levels: OD Holdings
(`parent_id = null`) → {ODAX, Tablo, NOVA}. `config` is a free-form `jsonb`
(ownership splits, market, feature flags like `has_managing_director`; as
of `0013_role_boundaries.sql` also the founder's real name/title on OD
Holdings and each subsidiary's real `purpose`/`competitors` — the source
every agent's system prompt reads its "who we are" section from, see
[`AGENTS_AND_TOOLS.md`](./AGENTS_AND_TOOLS.md)). Never hardcoded elsewhere
in application code — `lib/agent/scoped-companies.ts`
walks this table at request time.

### `company_members`

Links `auth.users` to `companies` with a `role` (`owner` /
`managing_director` / `member` / `viewer`) and a `controls_approvals`
boolean. In this no-login app there is exactly one real row set (the
founder, seeded by `npm run seed:founder`, `controls_approvals = true` on
every company). `lib/agent/approvals-authz.ts` reads this table directly
(not via RLS + `auth.uid()`, which the service-role client has no session
for).

### `departments`

Just `company_id` + `name` + `kind` (`sales` / `marketing`). One row per
department per company, referenced by `agents.department_id`.

### `agents`

One row per AI agent. Key columns:

- `company_id` — always set, never null (a `group`-scope agent points at OD
  Holdings rather than leaving this null, so RLS never needs a "visible to
  everyone" escape hatch).
- `scope` — `company` / `group` / `project`. Only `company` and `group` are
  exercised; `project` is reserved.
- `persona` — the system-prompt text, written per-agent (not a template).
- `model` — defaults to `openai/gpt-oss-120b` (Groq); some seeded agents
  could use `openai/gpt-oss-20b` for cheaper high-frequency work, though
  none currently do.
- `tools` — a `jsonb` array of tool names (e.g.
  `["query_company_data", "search_documents", "enrich_lead"]`). This is the
  **entire** mechanism for what an agent can do — `lib/agent/tools/registry.ts`'s
  `resolveTools()` maps these names to real implementations, dropping any
  that don't exist. A new department agent is a new row here, never new
  code.
- `status` — `active` / `paused` / `retired`.

### `projects`, `tasks`, `decisions`, `goals`

Company-scoped structured data. `tasks.status` (`open`/`in_progress`/
`blocked`/`done`/`cancelled`) and `priority` (`low`/`normal`/`high`/`urgent`)
drive the context-assembly "open tasks" section and the dashboard counts.
`goals` (added in `0005_phase3.sql`) is OKR-style: `objective` + `key_results`
(jsonb) + `status` (`on_track`/`at_risk`/`off_track`/`done`) — powers
`generate_board_report` and `query_company_data`'s `goals` resource.
`0008_knowledge_flow.sql` added `parent_goal_id` (self-referencing, nullable)
and `department_id`, so a goal can trace back to the broader goal it
cascades from — a founder goal's children are group goals, a group goal's
children are company goals, and so on — written by the `create_goal` tool.
`assign_task` (also `0008`-era) is the first tool to actually use
`tasks.assigned_agent_id`, which existed from `0001_init.sql` but was
unused until then. No dedicated CRUD pages exist yet for
tasks/projects/goals directly — `query_company_data` and the new
`assign_task`/`record_decision`/`create_goal` tools are the only write
paths.

### `documents` / `document_chunks`

`documents` is the file record (`storage_path`, `title`, `mime_type`,
`tags text[]`). `document_chunks` holds the actual searchable text:
`content` + a `vector(1024)` `embedding` (Voyage `voyage-3.5`) + `chunk_index`,
with an HNSW index (`vector_cosine_ops`) for fast similarity search. Both
gain a denormalized `company_id` — kept authoritative by a `BEFORE INSERT`
trigger (`private.set_document_chunk_company_id()`) that derives it from the
parent document, never trusted from client input.

### `memories`

The system's long-term knowledge store. `scope` is one of `founder` /
`group` / `company` / `department` / `project` / `agent` — `scope_id`
points at the relevant row (null only for `founder`). `embedding vector(1024)`
+ an HNSW index power `match_memories` and `match_cross_company_memories`.
`importance` and `confidence` are both `0..1` floats. `source` tracks
provenance: `manual` / `briefing` (written by the daily-briefing Edge
Function) / `document` / `promoted` (moved to a broader scope via
`promote_memory`) / `agent` (written directly by `record_memory`).
`promoted_from_id` links a promoted memory back to its origin. `expires_at`
is optional and respected by `match_memories` (time-based decay).
`archived_at` (added in `0008_knowledge_flow.sql`) is a deliberate,
non-time-based "no longer useful" mark set by `update_memory`'s archive
operation — also excluded from `match_memories`, but a distinct concept
from expiry.

### `edges`

A generic `(source_type, source_id) --relation--> (target_type, target_id)`
graph, `metadata jsonb`. Powers `/graph` (via `/api/graph`) and `/office`'s
`/api/map` (a narrower `company`→`company`/`agent` slice). Populated only
with facts already true elsewhere in the schema (`owns`, `has_agent`) —
`0004_phase2.sql`/`0005_phase3.sql` seed the structural edges for every
company/agent they create, and `POST /api/companies` / `POST /api/agents`
insert the matching edge at creation time. Never fabricated business
activity.

### `agent_runs`

One row per chat turn (not per tool call) — see
[`AGENTS_AND_TOOLS.md`](./AGENTS_AND_TOOLS.md#the-agent-runtime). `company_id`
is denormalized via a trigger from `agents.company_id`, same pattern as
`document_chunks`. `tool_calls jsonb` holds the full `[{name, input, result}]`
log for the turn. `status` is `success` / `error` / `pending`. `cost_usd`
(Phase 7) is computed by `lib/agent/model-pricing.ts`'s `estimateCostUsd()`
from the turn's real `tokens_in`/`tokens_out` against a published
per-model pricing table — previously always `null`, now populated on every
insert and summed by `GET /api/command`'s `companyHealth.spendUsd`.

### `action_policies`

`action_type` (primary key, e.g. `send_email`) → `classification`
(`automatic` / `approval_required` / `founder_only`). Read by
`gateAction()`. **Anything not listed here defaults to `founder_only` in
application code** — fail safe, never fail open. Currently seeded:
`send_email`, `enrich_lead`, `generate_creative_asset`, all
`approval_required`. Nothing is `automatic` yet.

### `approvals`

One row per proposed external action. `payload jsonb` is the tool's raw
input (e.g. `{to, subject, body}` for `send_email`). `risk_level`
(`low`/`medium`/`high`) defaults to `high` for `founder_only` classification,
`medium` otherwise, unless the tool overrides it. `status` progresses
`pending` → `approved`/`rejected`, then (on approval) → `executed`/`failed`
depending on whether the real integration call succeeded. `company_id` is
denormalized via trigger from the proposing agent.

### `audit_log`

The system-wide activity trail. `actor_type` (`user`/`agent`/`system`) +
`actor_id` + `action` (a short string like `create_company`,
`propose:send_email`, `approval:approved`, `upload_document`) + optional
`target_type`/`target_id` + `metadata jsonb`. `company_id` is nullable —
null means a founder/system-level entry not tied to one company. Indexed on
`(company_id, created_at desc)`. This table plus `agent_runs` are the entire
source of truth for every "activity" surface in the app (`/office`'s feed +
terminal strip, the old `/activity` route's logic now folded into `/office`).

## RLS (defense-in-depth only — not the app's real boundary)

Every company-scoped table has `row level security` enabled and a policy
keyed on `company_id in (select private.allowed_company_ids())`.
`private.allowed_company_ids()` is a recursive CTE: every company the
current user is a direct member of, plus every descendant of those
companies (so a group member sees every child company; a single-company
member sees neither siblings nor the parent). `private.controls_approvals_for(company_id)`
walks **up** from a company to its ancestors, so a group-level controller
can approve a subsidiary's action without a separate membership row there.

**These policies are read by `auth.uid()`, which only exists inside a
Postgres session carrying a JWT — the service-role client the app actually
uses has no session and bypasses RLS entirely.** They exist purely so
`npm run test:rls` (`scripts/test-rls-isolation.ts`) has something real to
verify against the anon key, which the app itself never uses. The app's own
authorization logic is reimplemented in TypeScript:
`lib/agent/approvals-authz.ts`'s `controlsApprovalsFor()` is a functional
port of `private.controls_approvals_for()` that takes an explicit `userId`
instead of reading `auth.uid()`.

## Retrieval RPCs

Three Postgres functions power semantic retrieval, all deliberately **not**
`security definer` — they run as the calling session so the table's own RLS
policies apply exactly as a direct `select` would (no separate
access-control logic to keep in sync):

- **`match_memories(p_query_embedding, p_company_ids, p_agent_id, p_limit)`**
  — blended ranking: `0.5 × embedding similarity + 0.3 × importance + 0.2 ×
  recency decay`, over the rows the caller is actually allowed to see:
  `scope: 'founder'` always (no company boundary), `scope: 'company'`/
  `'group'`/`'department'`/`'project'` only when their resolved owning
  company is in `p_company_ids`, and `scope: 'agent'` only when
  `scope_id = p_agent_id` — a collaboration memory an agent records about
  itself (see `request_from_agent` below) is private to that one agent,
  never visible to any other. Migration `0013_role_boundaries.sql`
  rewrote this from an unscoped 2-arg signature that searched the entire
  table regardless of caller — a real cross-company/cross-agent leak, not
  just a missing filter. Used by `assembleSystemPrompt()` for every chat
  turn, called with the caller's own `getScopedCompanyIds()` result and
  agent id.
- **`match_document_chunks(p_query_embedding, p_company_ids, p_limit)`** —
  pure cosine similarity, scoped to the caller's company set. Used by the
  `search_documents` tool.
- **`match_cross_company_memories(p_limit, p_min_similarity)`** — pairs of
  `scope='company'` memories from two *different* companies whose
  embeddings are cosine-similar above a threshold (default 0.75). Used by
  the `detect_synergies` tool. This is plain cosine similarity, presented
  as candidates worth a look, not a claim of deeper pattern-mining.

## Storage

One bucket, `documents` (private), path convention
`documents/{company_id}/{uuid}-{filename}`. RLS on `storage.objects` mirrors
`allowed_company_ids()` for select/insert/delete — a file uploaded for one
company is unreachable by another regardless of signed-URL or direct-path
guessing, at least for the (currently unused) anon-key path.

## Denormalization triggers

Three `BEFORE INSERT` triggers keep a `company_id` column authoritative on
tables that don't naturally have one, always derived server-side from the
row's real parent — never trusted from client input:

- `agent_runs.company_id` ← `agents.company_id` (via `agent_id`)
- `approvals.company_id` ← `agents.company_id` (via `proposed_by_agent_id`)
- `document_chunks.company_id` ← `documents.company_id` (via `document_id`)

This is what lets "every company-scoped table has an RLS policy keyed on
`company_id`" hold literally, including for log/derived tables that don't
obviously need one.
