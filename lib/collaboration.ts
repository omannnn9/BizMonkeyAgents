import { RECENT_DELIVERY_MS } from "@/lib/agent-visual-state";

/** A real, recent `request_from_agent` tool call — ids are unprefixed
 *  (match `agent_runs.agent_id` directly, not the "agent:"-prefixed form
 *  `lib/office-layout.ts`'s `OfficeAgentPosition.agentId` uses). */
export interface CollaborationEdge {
  sourceAgentId: string;
  targetAgentId: string;
}

interface ActivityRun {
  agent_id: string;
  created_at: string;
  tool_calls?: Array<{ name: string; input: unknown; result: string }> | null;
}

/**
 * A real signal, not a fabricated one: a `request_from_agent` tool call is
 * already logged inside its caller's own `agent_runs.tool_calls` (see
 * lib/agent/tools/request-from-agent.ts) — this reads that same row back
 * out of the activity feed the World shell already polls, so the Colony's
 * collaboration beam always traces to a real DB row within the same
 * recency window the "delivered" agent state already uses.
 */
export function deriveCollaborationEdges(runs: ActivityRun[], now: number): CollaborationEdge[] {
  const edges: CollaborationEdge[] = [];
  for (const run of runs) {
    if (now - new Date(run.created_at).getTime() > RECENT_DELIVERY_MS) continue;
    for (const call of run.tool_calls ?? []) {
      if (call.name !== "request_from_agent") continue;
      const input = call.input as { targetAgentId?: unknown } | undefined;
      const targetAgentId = typeof input?.targetAgentId === "string" ? input.targetAgentId : null;
      if (!targetAgentId) continue;
      edges.push({ sourceAgentId: run.agent_id, targetAgentId });
    }
  }
  return edges;
}
