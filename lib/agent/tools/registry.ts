import type { AgentTool } from "@/lib/agent/types";
import { queryCompanyDataTool } from "@/lib/agent/tools/query-company-data";
import { searchDocumentsTool } from "@/lib/agent/tools/search-documents";
import { sendEmailTool } from "@/lib/agent/tools/send-email";
import { enrichLeadTool } from "@/lib/agent/tools/enrich-lead";
import { generateCreativeAssetTool } from "@/lib/agent/tools/generate-creative-asset";

/**
 * Every tool an agent could be assigned, keyed by name. An agent's own
 * `tools` column (a list of these names) decides which of these it actually
 * gets — never a hardcoded list per agent type, so a new department agent
 * is a new `agents` row, not new code.
 */
const ALL_TOOLS: AgentTool[] = [
  queryCompanyDataTool,
  searchDocumentsTool,
  sendEmailTool,
  enrichLeadTool,
  generateCreativeAssetTool,
];

const toolsByName = new Map(ALL_TOOLS.map((t) => [t.name, t]));

/** Resolves an agent's declared tool names to real tools, dropping any that don't exist. */
export function resolveTools(toolNames: unknown): AgentTool[] {
  if (!Array.isArray(toolNames)) return [];
  return toolNames
    .filter((name): name is string => typeof name === "string")
    .map((name) => toolsByName.get(name))
    .filter((t): t is AgentTool => t !== undefined);
}

export function getToolByName(name: string): AgentTool | undefined {
  return toolsByName.get(name);
}
