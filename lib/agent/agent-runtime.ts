import Anthropic from "@anthropic-ai/sdk";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import { assembleSystemPrompt } from "@/lib/agent/context-assembly";
import { resolveTools } from "@/lib/agent/tools/registry";
import type { AgentTool, ToolContext } from "@/lib/agent/types";

const DEFAULT_MODEL = "claude-sonnet-5";
const MAX_TOOL_ITERATIONS = 6;

function toAnthropicTools(tools: AgentTool[]): Anthropic.Tool[] {
  return tools.map((t) => ({
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
 * Runs one user turn against whichever agent row `agentId` points to —
 * the CEO agent, the Sales Agent, the Marketing Agent, or any future
 * department agent — executing any tool calls in a loop, and logs exactly
 * one agent_runs row for the whole turn (inputs, every tool call, model,
 * tokens, latency, outcome) per the brief's observability requirement.
 *
 * Which tools are available and which model answers come from the agent's
 * own `tools`/`model` columns, never a hardcoded list — a new department
 * agent is a new `agents` row, not new code here.
 */
export async function runAgentTurn(
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

  const { data: agentRow } = await supabase
    .from("agents")
    .select("model, tools")
    .eq("id", params.agentId)
    .single();
  const model = agentRow?.model ?? DEFAULT_MODEL;
  const tools = resolveTools(agentRow?.tools);
  const toolsByName = new Map(tools.map((t) => [t.name, t]));

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
        model,
        max_tokens: 2048,
        system: systemPrompt,
        messages,
        tools: toAnthropicTools(tools),
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
    model,
    tokens_in: tokensIn,
    tokens_out: tokensOut,
    latency_ms: Date.now() - startedAt,
    status,
  });

  return { message: finalText, toolCalls: toolCallLog };
}
