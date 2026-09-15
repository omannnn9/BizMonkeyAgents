import type { OfficeAgentPosition } from "@/lib/office-layout";

export type AgentVisualState = "executing" | "blocked" | "approval" | "delivered" | "sleeping" | "idle";

const RECENT_DELIVERY_MS = 2 * 60 * 1000;
const SLEEP_THRESHOLD_MS = 24 * 60 * 60 * 1000;

/**
 * The single source of truth for "what is this Operator's figure showing
 * right now" — every renderer calls this instead of re-deriving it, so the
 * render layer can change freely without ever risking a second, drifting
 * copy of the logic that decides what's real. `sleeping` is the one state
 * that isn't a live in-flight signal: it reads `status` (paused/retired,
 * or simply active but quiet for 24h+) rather than fabricating "boredom" —
 * still a real column, just a slower-moving one than the others below it.
 */
export function deriveAgentState(
  agent: Pick<OfficeAgentPosition, "lastRunAt" | "lastRunStatus" | "hasPendingApproval" | "status">,
  isWorking: boolean,
  now: number,
): AgentVisualState {
  if (isWorking) return "executing";
  if (agent.lastRunStatus === "error") return "blocked";
  if (agent.hasPendingApproval) return "approval";
  if (agent.lastRunAt && now - new Date(agent.lastRunAt).getTime() < RECENT_DELIVERY_MS) return "delivered";
  const lastRunAge = agent.lastRunAt ? now - new Date(agent.lastRunAt).getTime() : Infinity;
  if (agent.status !== "active" || lastRunAge > SLEEP_THRESHOLD_MS) return "sleeping";
  return "idle";
}

/** Kept stable across every visual pass this project has done so the color
 *  a founder learns once ("amber = waiting on approval") stays true. Mirrors
 *  the --state-* custom properties in app/globals.css — update both together. */
export const STATE_COLOR: Record<AgentVisualState, string | null> = {
  executing: "#7ec8ff",
  approval: "#ffc24d",
  blocked: "#ff5a6e",
  delivered: "#5dff9b",
  sleeping: "#6b7a99",
  idle: null,
};

/** The same state names, in the founder-facing phrasing the colony's own
 *  header copy already uses ("amber waiting on approval", "red when
 *  blocked", ...) — reused by Command Mode's HUD so a state means the same
 *  thing everywhere it's shown. */
export const STATE_LABEL: Record<AgentVisualState, string> = {
  executing: "executing",
  approval: "awaiting approval",
  blocked: "blocked",
  delivered: "delivered",
  sleeping: "sleeping",
  idle: "idle",
};

/** Sums `deriveAgentState()` across every Operator in the org — not a new
 *  signal, the exact same per-character function every glow in the colony
 *  already calls, just aggregated. Used by Command Mode's HUD to show a
 *  real org-wide breakdown instead of one character at a time. */
export function summarizeAgentStates(
  agents: Array<
    Pick<OfficeAgentPosition, "agentId" | "lastRunAt" | "lastRunStatus" | "hasPendingApproval" | "status">
  >,
  workingAgentIds: Set<string>,
  now: number,
): Record<AgentVisualState, number> {
  const counts: Record<AgentVisualState, number> = {
    executing: 0,
    blocked: 0,
    approval: 0,
    delivered: 0,
    sleeping: 0,
    idle: 0,
  };
  for (const agent of agents) {
    counts[deriveAgentState(agent, workingAgentIds.has(agent.agentId), now)]++;
  }
  return counts;
}
