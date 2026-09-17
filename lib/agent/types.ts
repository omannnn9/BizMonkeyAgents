import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";

export interface ToolContext {
  supabase: SupabaseClient<Database>;
  agentId: string;
  activeCompanyId: string;
  userId: string;
  /** How many agent-to-agent hops produced this turn (0 = a direct user
   *  turn). Only `request_from_agent` reads this, to cap recursion. */
  depth?: number;
  /** The chain of agent ids that have already participated in this
   *  collaboration lineage (the current agent included) — lets
   *  `request_from_agent` refuse a request back to an agent already up
   *  the chain (a real A->B->A cycle) immediately, rather than only being
   *  caught once `depth` happens to exhaust the budget. */
  collabChain?: string[];
}

export interface ToolResult {
  /** Text returned to the model as the tool_result content. */
  content: string;
  /** Set true if this result should be reported to the model as an error. */
  isError?: boolean;
}

export interface AgentTool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  handler: (input: Record<string, unknown>, ctx: ToolContext) => Promise<ToolResult>;
}
