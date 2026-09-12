import { z } from "zod";
import type { AgentTool } from "@/lib/agent/types";
import { gateAction } from "@/lib/agent/approval-gate";

const inputSchema = z.object({
  to: z.string().email(),
  subject: z.string().min(1),
  body: z.string().min(1),
});

export const sendEmailTool: AgentTool = {
  name: "send_email",
  description:
    "Draft and propose sending an email via Gmail. This is an external action: it is ALWAYS " +
    "routed through the founder's approval queue and never sends immediately, regardless of how " +
    "the request is phrased — there is no automatic path for this tool.",
  inputSchema: {
    type: "object",
    properties: {
      to: { type: "string", description: "Recipient email address." },
      subject: { type: "string" },
      body: { type: "string" },
    },
    required: ["to", "subject", "body"],
  },
  async handler(rawInput, ctx) {
    const parsed = inputSchema.safeParse(rawInput);
    if (!parsed.success) {
      return { content: `Invalid input: ${parsed.error.message}`, isError: true };
    }

    const result = await gateAction(ctx.supabase, {
      agentId: ctx.agentId,
      actionType: "send_email",
      payload: parsed.data,
    });

    if (result.allowed) {
      // action_policies has no 'automatic' row for send_email in Phase 1 —
      // this branch exists for when that ever changes, and still must not
      // silently claim success against the unconnected Gmail stub.
      return {
        content:
          "Policy marks send_email as automatic, but Gmail is not connected yet — nothing was sent.",
        isError: true,
      };
    }

    return {
      content:
        `Email drafted and submitted for approval (approval id ${result.approvalId}). ` +
        "It will not be sent until the founder approves it from the Approvals queue.",
    };
  },
};
