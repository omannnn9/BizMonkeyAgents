import Anthropic from "@anthropic-ai/sdk";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import { assembleSystemPrompt } from "@/lib/agent/context-assembly";
import { queryCompanyDataTool } from "@/lib/agent/tools/query-company-data";
import { searchDocumentsTool } from "@/lib/agent/tools/search-documents";
import { sendEmailTool } from "@/lib/agent/tools/send-email";
import type { AgentTool, ToolContext } from "@/lib/agent/types";

const MODEL = "claude-sonnet-5";
const MAX_TOOL_ITERATIONS = 6;

const TOOLS: AgentTool[] = [queryCompanyDataTool, searchDocumentsTool, sendEmailTool];
const toolsByName = new Map(TOOLS.map((t) => [t.name, t]));

function toAnthropicTools(): Anthropic.Tool[] {
  return TOOLS.map((t) => ({
    name: t.name,
    description: t.description,
    input_schema: t.inputSchema as Anthropic.Tool["input_schema"],
  }));
}

export interface ChatTurnResult {
  message: string;
  toolCalls: Array<{ name: string; input: unknown; result: string }>;
}

/**
 * Runs one user turn against the CEO agent for the given company, executing
 * any tool calls in a loop, and logs exactly one agent_runs row for the
 * whole turn (inputs, every tool call, model, tokens, latency, outcome) —
 * per the brief's observability requirement.
 */
export async function runChatTurn(
  supabase: SupabaseClient<Database>,
  params: {
    agentId: string;
    activeCompanyId: string;
    userId: string;
    userMessage: string;
    history: Array<{ role: "user" | "assistant"; content: string }>;
  },
): Promise<ChatTurnResult> {
  const startedAt = Date.now();
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });
  const toolContext: ToolContext = {
    supabase,
    agentId: params.agentId,
    activeCompanyId: params.activeCompanyId,
    userId: params.userId,
  };

  const systemPrompt = await assembleSystemPrompt(supabase, {
    agentId: params.agentId,
    activeCompanyId: params.activeCompanyId,
    userMessage: params.userMessage,
  });

  const messages: Anthropic.MessageParam[] = [
    ...params.history.map((h) => ({ role: h.role, content: h.content }) as Anthropic.MessageParam),
    { role: "user", content: params.userMessage },
  ];

  const toolCallLog: Array<{ name: string; input: unknown; result: string }> = [];
  let tokensIn = 0;
  let tokensOut = 0;
  let status: "success" | "error" = "success";
  let finalText = "";

  try {
    for (let iteration = 0; iteration < MAX_TOOL_ITERATIONS; iteration++) {
      const response = await anthropic.messages.create({
        model: MODEL,
        max_tokens: 2048,
        system: systemPrompt,
        messages,
        tools: toAnthropicTools(),
      });

      tokensIn += response.usage.input_tokens;
      tokensOut += response.usage.output_tokens;

      const textBlocks = response.content.filter((b) => b.type === "text");
      finalText = textBlocks.map((b) => (b as Anthropic.TextBlock).text).join("\n");

      if (response.stop_reason !== "tool_use") {
        break;
      }

      const toolUseBlocks = response.content.filter(
        (b): b is Anthropic.ToolUseBlock => b.type === "tool_use",
      );

      messages.push({ role: "assistant", content: response.content });

      const toolResults: Anthropic.ToolResultBlockParam[] = [];
      for (const block of toolUseBlocks) {
        const tool = toolsByName.get(block.name);
        const result = tool
          ? await tool.handler(block.input as Record<string, unknown>, toolContext)
          : { content: `Unknown tool: ${block.name}`, isError: true };

        toolCallLog.push({ name: block.name, input: block.input, result: result.content });
        toolResults.push({
          type: "tool_result",
          tool_use_id: block.id,
          content: result.content,
          is_error: result.isError,
        });
      }
      messages.push({ role: "user", content: toolResults });
    }
  } catch (err) {
    status = "error";
    finalText = `Something went wrong handling that request: ${
      err instanceof Error ? err.message : String(err)
    }`;
  }

  await supabase.from("agent_runs").insert({
    agent_id: params.agentId,
    input: params.userMessage,
    output: finalText,
    tool_calls: toolCallLog as unknown as Database["public"]["Tables"]["agent_runs"]["Row"]["tool_calls"],
    model: MODEL,
    tokens_in: tokensIn,
    tokens_out: tokensOut,
    latency_ms: Date.now() - startedAt,
    status,
  });

  return { message: finalText, toolCalls: toolCallLog };
}
