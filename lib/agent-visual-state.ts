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
