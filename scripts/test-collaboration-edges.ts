/**
 * Pure-function test for `deriveCollaborationEdges()` (lib/collaboration.ts)
 * — the Colony's collaboration-beam signal derivation. No Supabase/Anthropic
 * connection needed (unlike test-agent-scenarios.ts): this only exercises
 * data transformation over synthetic `agent_runs`-shaped rows.
 *
 * Usage: npx tsx scripts/test-collaboration-edges.ts
 */
import { deriveCollaborationEdges } from "../lib/collaboration";

type Check = { name: string; pass: boolean; detail?: string };
const results: Check[] = [];
function record(name: string, pass: boolean, detail?: string) {
  results.push({ name, pass, detail });
  console.log(`${pass ? "PASS" : "FAIL"} — ${name}${detail ? ` (${detail})` : ""}`);
}

const now = Date.now();
const minutesAgo = (m: number) => new Date(now - m * 60_000).toISOString();

// A recent request_from_agent call becomes a real edge.
const recentEdges = deriveCollaborationEdges(
  [
    {
      agent_id: "sales",
      created_at: minutesAgo(1),
      tool_calls: [
        { name: "request_from_agent", input: { targetAgentId: "marketing", request: "status?" }, result: "ok" },
      ],
    },
  ],
  now,
);
record(
  "A recent request_from_agent call becomes a 'request' edge",
  recentEdges.length === 1 &&
    recentEdges[0].sourceAgentId === "sales" &&
    recentEdges[0].targetAgentId === "marketing" &&
    recentEdges[0].kind === "request",
);

// A recent assign_task call becomes a real "delegation" edge.
const delegationEdges = deriveCollaborationEdges(
  [
    {
      agent_id: "group-ceo",
      created_at: minutesAgo(1),
      tool_calls: [
        {
          name: "assign_task",
          input: { assigneeAgentId: "group-strategy", task: "cascade the Q3 goal" },
          result: "ok",
        },
      ],
    },
  ],
  now,
);
record(
  "A recent assign_task call becomes a 'delegation' edge",
  delegationEdges.length === 1 &&
    delegationEdges[0].sourceAgentId === "group-ceo" &&
    delegationEdges[0].targetAgentId === "group-strategy" &&
    delegationEdges[0].kind === "delegation",
);

// An assign_task call with no assigneeAgentId is dropped, not thrown.
const malformedDelegationEdges = deriveCollaborationEdges(
  [
    {
      agent_id: "group-ceo",
      created_at: minutesAgo(1),
      tool_calls: [{ name: "assign_task", input: {}, result: "ok" }],
    },
  ],
  now,
);
record("An assign_task call with no assigneeAgentId produces no edge", malformedDelegationEdges.length === 0);

// A request_from_agent call outside the recency window is dropped.
const staleEdges = deriveCollaborationEdges(
  [
    {
      agent_id: "sales",
      created_at: minutesAgo(10),
      tool_calls: [
        { name: "request_from_agent", input: { targetAgentId: "marketing", request: "status?" }, result: "ok" },
      ],
    },
  ],
  now,
);
record("A stale (>2min) request_from_agent call is dropped", staleEdges.length === 0);

// Non-collaboration tool calls are ignored.
const unrelatedEdges = deriveCollaborationEdges(
  [{ agent_id: "sales", created_at: minutesAgo(1), tool_calls: [{ name: "enrich_lead", input: {}, result: "ok" }] }],
  now,
);
record("A non-request_from_agent tool call produces no edge", unrelatedEdges.length === 0);

// A malformed input (no targetAgentId) is dropped, not thrown.
const malformedEdges = deriveCollaborationEdges(
  [
    {
      agent_id: "sales",
      created_at: minutesAgo(1),
      tool_calls: [{ name: "request_from_agent", input: {}, result: "ok" }],
    },
  ],
  now,
);
record("A request_from_agent call with no targetAgentId produces no edge", malformedEdges.length === 0);

// Runs with no tool_calls at all (the common case) produce no edges.
const emptyEdges = deriveCollaborationEdges([{ agent_id: "sales", created_at: minutesAgo(1) }], now);
record("A run with no tool_calls produces no edge", emptyEdges.length === 0);

const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} checks passed.`);
if (failed.length > 0) process.exit(1);
