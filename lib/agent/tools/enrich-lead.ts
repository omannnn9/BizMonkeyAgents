import { z } from "zod";
import type { AgentTool } from "@/lib/agent/types";
import { gateAction } from "@/lib/agent/approval-gate";

const inputSchema = z.object({
  domainOrEmail: z.string().min(1),
  reason: z.string().min(1).describe("Why this lead is being enriched right now."),
});

export const enrichLeadTool: AgentTool = {
  name: "enrich_lead",
  description:
    "Propose enriching a lead via Apollo.io (company/contact data, then scored against the OSL " +
    "lead model). This touches a prospective customer's data, so it is ALWAYS routed through the " +
    "founder's approval queue and never runs immediately, regardless of how the request is phrased.",
  inputSchema: {
    type: "object",
    properties: {
      domainOrEmail: { type: "string", description: "Company domain or contact email to enrich." },
      reason: { type: "string", description: "Why this lead is being enriched right now." },
    },
    required: ["domainOrEmail", "reason"],
  },
  async handler(rawInput, ctx) {
    const parsed = inputSchema.safeParse(rawInput);
    if (!parsed.success) {
      return { content: `Invalid input: ${parsed.error.message}`, isError: true };
    }

    const result = await gateAction(ctx.supabase, {
      agentId: ctx.agentId,
      actionType: "enrich_lead",
      payload: parsed.data,
    });

    if (result.allowed) {
      // action_policies has no 'automatic' row for enrich_lead — this
      // branch exists for when that ever changes, and still must not
      // silently claim success against the unconnected Apollo.io stub.
      return {
        content:
          "Policy marks enrich_lead as automatic, but Apollo.io is not connected yet — nothing was enriched.",
        isError: true,
      };
    }

    return {
      content:
        `Lead enrichment submitted for approval (approval id ${result.approvalId}). Note: even once ` +
        "approved, Apollo.io and the OSL lead-scoring model aren't connected to this app yet, so " +
        "approving it will currently fail loudly rather than enrich anything.",
    };
  },
};
