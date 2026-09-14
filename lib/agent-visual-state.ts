import type { OfficeAgentPosition } from "@/lib/office-layout";

export type AgentVisualState = "working" | "error" | "needs-approval" | "delivering" | "idle";

const RECENT_DELIVERY_MS = 2 * 60 * 1000;

/**
 * The single source of truth for "what is this agent's sprite/character
 * showing right now" — every renderer (the retired 2D canvas, this 3D
 * viewport) calls this instead of re-deriving it, so the render layer can
 * change freely without ever risking a second, drifting copy of the logic
 * that decides what's real.
 */
export function deriveAgentState(
  agent: Pick<OfficeAgentPosition, "lastRunAt" | "lastRunStatus" | "hasPendingApproval">,
  isWorking: boolean,
  now: number,
): AgentVisualState {
  if (isWorking) return "working";
  if (agent.lastRunStatus === "error") return "error";
  if (agent.hasPendingApproval) return "needs-approval";
  if (agent.lastRunAt && now - new Date(agent.lastRunAt).getTime() < RECENT_DELIVERY_MS) return "delivering";
  return "idle";
}

/** Kept stable across every visual pass this project has done so the color
 *  a founder learns once ("amber = needs approval") stays true. */
export const STATE_COLOR: Record<AgentVisualState, string | null> = {
  working: "#7ec8ff",
  error: "#ff5a6e",
  "needs-approval": "#ffc24d",
  delivering: "#5dff9b",
  idle: null,
};
