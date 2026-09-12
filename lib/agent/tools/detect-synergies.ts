import { z } from "zod";
import type { AgentTool } from "@/lib/agent/types";

const inputSchema = z.object({
  limit: z.number().int().min(1).max(20).optional(),
});

export const detectSynergiesTool: AgentTool = {
  name: "detect_synergies",
  description:
    "Find company-scope memories that read similarly across two different companies, via embedding " +
    "similarity — e.g. a lead-qualification lesson from one company that would apply to another's " +
    "targeting. This is plain cosine similarity over existing memory embeddings, not a claim of " +
    "deeper pattern-mining — present findings as candidates worth a look, not conclusions. Read-only, " +
    "not approval-gated.",
  inputSchema: {
    type: "object",
    properties: {
      limit: { type: "number", description: "Max candidate pairs to return (default 5, max 20)." },
    },
  },
  async handler(rawInput, ctx) {
    const parsed = inputSchema.safeParse(rawInput);
    if (!parsed.success) {
      return { content: `Invalid input: ${parsed.error.message}`, isError: true };
    }

    const { data: pairs, error } = await ctx.supabase.rpc("match_cross_company_memories", {
      p_limit: parsed.data.limit ?? 5,
    });
    if (error) return { content: `Synergy search failed: ${error.message}`, isError: true };
    if (!pairs || pairs.length === 0) {
      return {
        content:
          "No cross-company similarities found above the threshold right now — that's a real result, " +
          "not a failure; there just isn't enough overlapping memory content yet.",
      };
    }

    const candidates = pairs.map((p) => ({
      similarity: Math.round(p.similarity * 1000) / 1000,
      companyA: p.company_a_name,
      memoryA: p.memory_a_content,
      companyB: p.company_b_name,
      memoryB: p.memory_b_content,
    }));

    return { content: JSON.stringify(candidates) };
  },
};
