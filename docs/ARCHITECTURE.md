# Architecture

## What this is

OD Cortex is an internal AI command center for OD Group — OD Holdings
(the group level) and its three companies, ODAX, Tablo, and NOVA. Each
company gets one or more AI agents (built on Groq's OpenAI-compatible chat
completions API — genuinely free self-serve tier, no card required) that
can read the company's structured data, search its uploaded documents, and
propose external actions (send an email, enrich a lead, generate a creative
asset). Every external action is gated behind a human approval queue before
it runs. Two group-scope agents (Group CFO, Group Strategy) see across all
four companies at once.

The whole thing is a single Next.js 16 app (App Router, Turbopack) talking to
one Supabase project (Postgres + pgvector + Storage + Edge Functions).

## Stack

| Layer | Choice |
|---|---|
| Framework | Next.js 16 (App Router, Turbopack), React 19 |
| Database | Supabase (Postgres + `pgvector` + `pg_cron`) |
| LLM | Groq (`groq-sdk`, OpenAI-compatible chat completions) — `openai/gpt-oss-120b` by default, `openai/gpt-oss-20b` for cheap classification (auto-tagging, daily briefings). Genuinely free self-serve tier, not a trial. |
| Embeddings | Voyage AI (`voyage-3.5`, 1024 dimensions) |
| 3D | `@react-three/fiber` + `@react-three/drei` (the `/office` viewport only) |
| Styling | Tailwind CSS v4 |
| Error tracking | Sentry (`@sentry/nextjs`) |
| Testing | Playwright (e2e, demo-mode), custom `tsx` scripts (RLS, prompt-injection, agent-scenario checks) |
| Validation | Zod (tool input schemas) |
| Document parsing | `pdfjs-dist` (PDF), `mammoth` (DOCX) |

## No login, by design

This is a single-user internal tool. There is no login screen, no session,
no `auth.getUser()` anywhere in application code. The app always talks to
Supabase **server-side as the service role key**, which bypasses Row-Level
Security by design (see `lib/supabase/server.ts`).

That's a real, deliberate trade-off: anyone who has the deployed URL gets
full read/write access. There is no per-request identity check. **Keep the
deployed URL private** — that's the actual security boundary, not RLS.

Two consequences fall out of this:

- **RLS policies still exist** in the schema (`supabase/migrations/0001_init.sql`)
  as defense-in-depth for the anon key (never exposed to the browser, but
  still worth not leaving wide open) — verified by `npm run test:rls`. They
  are not what protects the app in production.
- **"Who can approve what" is enforced in application code**, not by a
  Postgres session's `auth.uid()`. `lib/agent/approvals-authz.ts` re-implements
  the migration's `private.controls_approvals_for()` SQL function, but takes
  an explicit `userId` argument instead of reading a JWT claim, since the
  service-role client has no session to read one from.
- There's still exactly one `auth.users` row, created once by
  `npm run seed:founder` (`scripts/seed-founder-membership.ts`), purely to
  satisfy foreign keys (`documents.uploaded_by`, `approvals.decided_by`,
  `audit_log.actor_id`, `company_members.user_id`). `lib/agent/founder.ts`
  resolves that user's id from the `company_members` table at request time —
  never a hardcoded literal.

## Demo mode

If `NEXT_PUBLIC_SUPABASE_URL` or `SUPABASE_SERVICE_ROLE_KEY` are unset,
`lib/demo-mode.ts`'s `isDemoMode()` returns `true` and **every** API route
returns realistic fixture data instead of erroring or touching Supabase. A
persistent banner (`CockpitShell`) makes this unambiguous to anyone looking
at the app. Nothing in demo mode persists — approve/reject and document
upload round-trip successfully but don't change any list.

This exists so the UI can be built, reviewed, and e2e-tested before a live
Supabase project exists. It is the reason `npm run test:e2e` passes with no
backend at all — see [`TESTING.md`](./TESTING.md).

## Request flow: a chat message

1. Browser → `POST /api/chat` with `{ activeCompanyId, agentId?, message, history }`.
2. If demo mode: return a canned reply from `demoChatReply()` and stop.
3. Otherwise, resolve which `agents` row to run (the caller's `agentId`, or
   the company's default `scope='company'` agent if omitted) and call
   `runAgentTurn()` (`lib/agent/agent-runtime.ts`).
4. `runAgentTurn` builds a system prompt via `assembleSystemPrompt()`
   (`lib/agent/context-assembly.ts`): persona + active company config + a
   handful of open tasks/recent decisions + the top ~6 retrieved memories
   (blended recency/importance/embedding-similarity via the `match_memories`
   RPC) — never a full-table dump.
5. It resolves the agent's declared `tools` (a JSON array of tool names on
   the `agents` row) to real `AgentTool` implementations via
   `lib/agent/tools/registry.ts`, and loops against the Anthropic API (up to
   6 tool-use iterations), executing each tool call server-side and feeding
   the result back as a `tool_result` block.
6. Exactly one `agent_runs` row is inserted for the whole turn — input,
   every tool call, model, token counts, latency, final status — regardless
   of how many tool iterations happened inside it.
7. The reply (plus any tool call results, e.g. a `search_documents` citation
   list) goes back to the browser.

See [`AGENTS_AND_TOOLS.md`](./AGENTS_AND_TOOLS.md) for the full breakdown of
the runtime, the approval gate, and every tool.

## Request flow: an external action

Tools that reach outside the system (`send_email`, `enrich_lead`,
`generate_creative_asset`) never act directly. They call
`gateAction()` (`lib/agent/approval-gate.ts`), which:

1. Looks up the action type's classification in `action_policies`
   (`automatic` / `approval_required` / `founder_only`). **Unknown action
   types fail safe to `founder_only`** — a policy row must explicitly say
   `automatic` before anything skips human review.
2. If `automatic`: logs an audit entry and returns immediately (allowed).
3. Otherwise: inserts a `pending` row into `approvals`, logs an audit entry,
   and returns `{ allowed: false, approvalId }`. The tool then tells the
   model the action was submitted for approval, not that it happened.

When the founder later calls `POST /api/approvals/:id` with a decision,
`controlsApprovalsFor()` checks the caller is a `controls_approvals` member
of that company or any ancestor (so a group-level controller can approve a
subsidiary's action). On approval, the route **attempts real execution**
against the relevant integration stub (`lib/integrations/*.ts`) — none of
Gmail, Apollo.io, or Higgsfield are connected yet, so every one of these
currently fails loudly (`status: "failed"`) rather than silently succeeding.
That's intentional: see [`AGENTS_AND_TOOLS.md`](./AGENTS_AND_TOOLS.md#integration-stubs).

## Company hierarchy and scoping

`companies` is a self-referencing tree via `parent_id` (currently two levels:
OD Holdings → {ODAX, Tablo, NOVA}). `lib/agent/scoped-companies.ts`'s
`getScopedCompanyIds()` returns the active company plus its direct children —
so when OD Holdings is active, every tool/query sees all four companies;
when a single company is active, it sees just that one. This is the single
mechanism group-scope agents (Group CFO, Group Strategy) use to see
cross-company data — no separate access model.

## App structure

- `app/(cockpit)/` — every real page (`office`, `chat`, `documents`,
  `approvals`, `graph`, `memories`, `companies/new`, `agents/new`), wrapped
  by `app/(cockpit)/layout.tsx` (fetches the company list server-side,
  wraps in `CompanyProvider`, renders `CockpitShell`).
- `app/api/` — every server route. All demo-mode-aware, all wrapped in
  `withApiErrorHandling` (`lib/api-error.ts`) so an unhandled throw becomes
  a clean JSON 500 + a Sentry capture instead of crashing.
- `components/` — shared UI: `CockpitShell` (header/nav/demo banner),
  `AgentChatPanel` (the one chat implementation, reused by both `/chat` and
  the office overlay), `OfficeAgentPanel`, switchers, `Spinner`.
- `components/office3d/` — the `/office` mission-control shell's own
  components (see [`FRONTEND.md`](./FRONTEND.md#office-mission-control)).
- `lib/agent/` — the agent runtime, approval gate, context assembly, and
  every tool. See [`AGENTS_AND_TOOLS.md`](./AGENTS_AND_TOOLS.md).
- `lib/` (top level) — `demo-mode.ts`, `office-layout.ts` (deterministic
  room/agent grid), `graph-layout.ts` (hand-rolled force layout), `api-error.ts`,
  `agent-visual-state.ts` (shared state → color mapping for the office view).
- `supabase/migrations/` — the whole schema, applied in order. See
  [`DATA_MODEL.md`](./DATA_MODEL.md).
- `supabase/functions/daily-briefing/` — a Deno Edge Function, not yet
  deployed (needs a live project).
- `tests/e2e/` — the full Playwright suite, runs entirely against demo
  mode. See [`TESTING.md`](./TESTING.md).

## Observability

Every agent turn is one `agent_runs` row (input, output, every tool call,
model, token counts, latency, status). Every mutating action (create
company, create agent, propose an action, decide an approval, upload a
document, promote a memory) writes an `audit_log` row with `actor_type`
(`user` / `agent` / `system`), the action name, and a target reference.
Nothing in the UI shows activity that isn't backed by one of these two
tables — the `/office` right-side feed and terminal strip, `/graph`, and
`/approvals`/`/memories` history all read real rows, never synthesize
activity. Sentry (`instrumentation.ts`, `instrumentation-client.ts`,
`sentry.*.config.ts`) captures unhandled errors from both server routes and
the client.

## What's genuinely not built yet

See the root [`README.md`](../README.md#whats-genuinely-not-built-yet) for
the current list — it's kept in one place to avoid drift between two
documents making the same claim.
