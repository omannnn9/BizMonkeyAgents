import Groq from "groq-sdk";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import { assembleSystemPrompt } from "@/lib/agent/context-assembly";
import { resolveTools } from "@/lib/agent/tools/registry";
import { estimateCostUsd } from "@/lib/agent/model-pricing";
import type { AgentTool, ToolContext } from "@/lib/agent/types";

const DEFAULT_MODEL = "openai/gpt-oss-120b";
const MAX_TOOL_ITERATIONS = 6;

function toGroqTools(tools: AgentTool[]): Groq.Chat.Completions.ChatCompletionTool[] {
  return tools.map((t) => ({
    type: "function",
    function: {
      name: t.name,
      description: t.description,
      parameters: t.inputSchema as Record<string, unknown>,
    },
  }));
}

export interface ChatTurnResult {
  message: string;
  toolCalls: Array<{ name: string; input: unknown; result: string }>;
}

/**
 * Runs one user turn against whichever agent row `agentId` points to —
 * the Managing Director, the Sales Lead, the Marketing Lead, or any future
 * department agent — executing any tool calls in a loop, and logs exactly
 * one agent_runs row for the whole turn (inputs, every tool call, model,
 * tokens, latency, outcome) per the brief's observability requirement.
 *
 * Which tools are available and which model answers come from the agent's
 * own `tools`/`model` columns, never a hardcoded list — a new department
 * agent is a new `agents` row, not new code here.
 *
 * Runs on Groq's OpenAI-compatible chat completions API (genuinely free
 * self-serve tier — see lib/agent/model-pricing.ts) rather than the
 * Anthropic Messages API this project used through Phase 8.
 */
export async function runAgentTurn(
  supabase: SupabaseClient<Database>,
  params: {
    agentId: string;
    activeCompanyId: string;
    userId: string;
    userMessage: string;
    history: Array<{ role: "user" | "assistant"; content: string }>;
    /** Set by `request_from_agent` when this turn is itself the result of
     *  one agent asking another — threaded through so a chain of requests
     *  can't recurse unbounded. Omitted (0) for an ordinary user turn. */
    depth?: number;
    /** Set by `request_from_agent` — the chain of agent ids already
     *  visited in this collaboration lineage, for cycle detection. */
    collabChain?: string[];
  },
): Promise<ChatTurnResult> {
  const startedAt = Date.now();
  const groq = new Groq({ apiKey: process.env.GROQ_API_KEY! });
  const toolContext: ToolContext = {
    supabase,
    agentId: params.agentId,
    activeCompanyId: params.activeCompanyId,
    userId: params.userId,
    depth: params.depth ?? 0,
    collabChain: params.collabChain ?? [params.agentId],
  };

  const { data: agentRow } = await supabase
    .from("agents")
    .select("model, tools")
    .eq("id", params.agentId)
    .single();
  const model = agentRow?.model ?? DEFAULT_MODEL;
  const tools = resolveTools(agentRow?.tools);
  const toolsByName = new Map(tools.map((t) => [t.name, t]));
  const groqTools = toGroqTools(tools);

  const systemPrompt = await assembleSystemPrompt(supabase, {
    agentId: params.agentId,
    activeCompanyId: params.activeCompanyId,
    userMessage: params.userMessage,
  });

  const messages: Groq.Chat.Completions.ChatCompletionMessageParam[] = [
    { role: "system", content: systemPrompt },
    ...params.history.map(
      (h) => ({ role: h.role, content: h.content }) as Groq.Chat.Completions.ChatCompletionMessageParam,
    ),
    { role: "user", content: params.userMessage },
  ];

  const toolCallLog: Array<{ name: string; input: unknown; result: string }> = [];
  let tokensIn = 0;
  let tokensOut = 0;
  let status: "success" | "error" = "success";
  let finalText = "";

  try {
    for (let iteration = 0; iteration < MAX_TOOL_ITERATIONS; iteration++) {
      const response = await groq.chat.completions.create({
        model,
        max_tokens: 2048,
        messages,
        ...(groqTools.length > 0 ? { tools: groqTools, tool_choice: "auto" as const } : {}),
      });

      tokensIn += response.usage?.prompt_tokens ?? 0;
      tokensOut += response.usage?.completion_tokens ?? 0;

      const choice = response.choices[0];
      const message = choice?.message;
      finalText = message?.content ?? "";

      if (choice?.finish_reason !== "tool_calls" || !message?.tool_calls?.length) {
        break;
      }

      messages.push({ role: "assistant", content: message.content, tool_calls: message.tool_calls });

      for (const call of message.tool_calls) {
        const tool = toolsByName.get(call.function.name);
        let input: Record<string, unknown> = {};
        try {
          input = JSON.parse(call.function.arguments) as Record<string, unknown>;
        } catch {
          // Malformed tool-call arguments — handled below as an unknown/invalid call.
        }

        const result = tool
          ? await tool.handler(input, toolContext)
          : { content: `Unknown tool: ${call.function.name}`, isError: true };

        toolCallLog.push({ name: call.function.name, input, result: result.content });
        messages.push({
          role: "tool",
          tool_call_id: call.id,
          content: result.isError ? `Error: ${result.content}` : result.content,
        });
      }
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
    cost_usd: estimateCostUsd(model, tokensIn, tokensOut),
    latency_ms: Date.now() - startedAt,
    status,
  });

  return { message: finalText, toolCalls: toolCallLog };
}
