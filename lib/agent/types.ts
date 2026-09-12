import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";

export interface ToolContext {
  supabase: SupabaseClient<Database>;
  agentId: string;
  activeCompanyId: string;
  userId: string;
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
