import { z } from "zod";
import type { AgentTool } from "@/lib/agent/types";
import { gateAction } from "@/lib/agent/approval-gate";

const inputSchema = z.object({
  prompt: z.string().min(1),
  assetType: z.enum(["image", "video"]),
});

export const generateCreativeAssetTool: AgentTool = {
  name: "generate_creative_asset",
  description:
    "Propose generating a marketing image or video via Higgsfield. This is an external, brand-facing " +
    "action: it is ALWAYS routed through the founder's approval queue and never runs immediately, " +
    "regardless of how the request is phrased — there is no automatic path for this tool.",
  inputSchema: {
    type: "object",
    properties: {
      prompt: { type: "string", description: "What to generate." },
      assetType: { type: "string", enum: ["image", "video"] },
    },
    required: ["prompt", "assetType"],
  },
  async handler(rawInput, ctx) {
    const parsed = inputSchema.safeParse(rawInput);
    if (!parsed.success) {
      return { content: `Invalid input: ${parsed.error.message}`, isError: true };
    }

    const result = await gateAction(ctx.supabase, {
      agentId: ctx.agentId,
      actionType: "generate_creative_asset",
      payload: parsed.data,
    });

    if (result.allowed) {
      // action_policies has no 'automatic' row for generate_creative_asset —
      // this branch exists for when that ever changes, and still must not
      // silently claim success against the unconnected Higgsfield stub.
      return {
        content:
          "Policy marks generate_creative_asset as automatic, but Higgsfield is not connected yet — " +
          "nothing was generated.",
        isError: true,
      };
    }

    return {
      content:
        `Creative asset request submitted for approval (approval id ${result.approvalId}). Note: ` +
        "even once approved, Higgsfield isn't connected to this app yet, so approving it will " +
        "currently fail loudly rather than generate anything.",
    };
  },
};
