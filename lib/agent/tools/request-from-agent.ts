import { z } from "zod";
import type { AgentTool } from "@/lib/agent/types";
import { runAgentTurn } from "@/lib/agent/agent-runtime";
import { canCollaborateAcrossCompanies, getAgentScopeInfo } from "@/lib/agent/scoped-companies";
import { embedDocuments } from "@/lib/embeddings/voyage";

const inputSchema = z.object({
  targetAgentId: z.string().uuid(),
  request: z.string().min(1),
});

/** How many agent-to-agent hops a single user turn may produce. A depth
 *  of 2 lets A ask B, and B ask C, but stops C from asking anyone else —
 *  enough for real collaboration chains without an unbounded loop between
 *  two agents that both hold this tool. */
const MAX_COLLAB_DEPTH = 2;

export const requestFromAgentTool: AgentTool = {
  name: "request_from_agent",
  description:
    "Ask another agent to do something or answer something, and get their real reply back — for " +
    "work genuinely outside your own scope (e.g. Sales Lead asking Group CFO for cross-company " +
    "context, or a Managing Director delegating a task to Marketing Lead). Routing rule: same-company " +
    "and company<->group requests are free; two different companies' agents can't reach each other " +
    "directly — route that through Group Operations or Group Strategy instead, the same way it would " +
    "work in a real holding company. Not approval-gated: this is internal collaboration between " +
    "agents you already work with, not an external action. The target agent runs its own full turn " +
    "(its own tools, its own approval gates for anything external) and gets its own independent " +
    "activity log entry.",
  inputSchema: {
    type: "object",
    properties: {
      targetAgentId: { type: "string", description: "id of the agent to ask." },
      request: { type: "string", description: "what to ask or delegate to that agent." },
    },
    required: ["targetAgentId", "request"],
  },
  async handler(rawInput, ctx) {
    const parsed = inputSchema.safeParse(rawInput);
    if (!parsed.success) {
      return { content: `Invalid input: ${parsed.error.message}`, isError: true };
    }

    const depth = ctx.depth ?? 0;
    if (depth >= MAX_COLLAB_DEPTH) {
      return {
        content: "Collaboration chain is already too deep — this request would recurse further than allowed.",
        isError: true,
      };
    }

    const { data: target, error: fetchErr } = await ctx.supabase
      .from("agents")
      .select("id, name, company_id, scope, status")
      .eq("id", parsed.data.targetAgentId)
      .single();
    if (fetchErr || !target) {
      return { content: `Agent not found: ${fetchErr?.message ?? "no such id"}`, isError: true };
    }
    if (target.status !== "active") {
      return { content: `${target.name} is ${target.status}, not active — can't collaborate right now.`, isError: true };
    }

    const caller = await getAgentScopeInfo(ctx.supabase, ctx.agentId);
    if (
      caller &&
      !canCollaborateAcrossCompanies(caller, { companyId: target.company_id, scope: target.scope })
    ) {
      return {
        content:
          `${target.name} is in a different company — route this through Group Operations or Group ` +
          "Strategy instead of asking directly.",
        isError: true,
      };
    }

    const result = await runAgentTurn(ctx.supabase, {
      agentId: target.id,
      activeCompanyId: target.company_id,
      userId: ctx.userId,
      userMessage: parsed.data.request,
      history: [],
      depth: depth + 1,
    });

    await ctx.supabase.from("audit_log").insert({
      actor_type: "agent",
      actor_id: ctx.agentId,
      action: "collaborate:request_from_agent",
      target_type: "agent",
      target_id: target.id,
      company_id: ctx.activeCompanyId,
      metadata: { request: parsed.data.request },
    });

    // Collaboration memory: a real, retrievable record of this exchange for
    // the caller's own future turns — not just a log entry nobody queries
    // back into context the way audit_log's own rows never are.
    try {
      const memoryContent =
        `Asked ${target.name} about "${parsed.data.request}" and got: ${result.message}`.slice(0, 2000);
      const [embedding] = await embedDocuments([memoryContent]);
      await ctx.supabase.from("memories").insert({
        scope: "agent",
        scope_id: ctx.agentId,
        content: memoryContent,
        embedding: JSON.stringify(embedding),
        importance: 0.4,
        confidence: 0.6,
        created_by: ctx.userId,
        source: "agent",
      });
    } catch {
      // Collaboration memory is a nice-to-have on top of the real reply and
      // audit_log entry above — never fail the collaboration itself over it.
    }

    return { content: `${target.name} replied: ${result.message}` };
  },
};
