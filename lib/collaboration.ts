import { RECENT_DELIVERY_MS } from "@/lib/agent-visual-state";

/** A real, recent `request_from_agent`/`assign_task` tool call — ids are
 *  unprefixed (match `agent_runs.agent_id` directly, not the
 *  "agent:"-prefixed form `lib/office-layout.ts`'s `OfficeAgentPosition
 *  .agentId` uses). `kind` distinguishes a synchronous request/reply from
 *  an asynchronous delegation, so the Colony can render/label them
 *  differently without a second derivation pass over the same data. */
export interface CollaborationEdge {
  sourceAgentId: string;
  targetAgentId: string;
  kind: "request" | "delegation";
}

interface ActivityRun {
  agent_id: string;
  created_at: string;
  tool_calls?: Array<{ name: string; input: unknown; result: string }> | null;
}

/**
 * A real signal, not a fabricated one: `request_from_agent` and
 * `assign_task` calls are already logged inside their caller's own
 * `agent_runs.tool_calls` (see lib/agent/tools/request-from-agent.ts and
 * assign-task.ts) — this reads those same rows back out of the activity
 * feed the World shell already polls, so the Colony's delegation beam
 * always traces to a real DB row within the same recency window the
 * "delivered" agent state already uses.
 */
export function deriveCollaborationEdges(runs: ActivityRun[], now: number): CollaborationEdge[] {
  const edges: CollaborationEdge[] = [];
  for (const run of runs) {
    if (now - new Date(run.created_at).getTime() > RECENT_DELIVERY_MS) continue;
    for (const call of run.tool_calls ?? []) {
      if (call.name === "request_from_agent") {
        const input = call.input as { targetAgentId?: unknown } | undefined;
        const targetAgentId = typeof input?.targetAgentId === "string" ? input.targetAgentId : null;
        if (targetAgentId) edges.push({ sourceAgentId: run.agent_id, targetAgentId, kind: "request" });
      } else if (call.name === "assign_task") {
        const input = call.input as { assigneeAgentId?: unknown } | undefined;
        const targetAgentId = typeof input?.assigneeAgentId === "string" ? input.assigneeAgentId : null;
        if (targetAgentId) edges.push({ sourceAgentId: run.agent_id, targetAgentId, kind: "delegation" });
      }
    }
  }
  return edges;
}
