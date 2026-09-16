import { z } from "zod";
import type { AgentTool } from "@/lib/agent/types";
import { getScopedCompanyIds } from "@/lib/agent/scoped-companies";

const inputSchema = z.object({
  objective: z.string().min(1),
  keyResults: z.array(z.string()).optional(),
  period: z.string().optional(),
  companyId: z.string().uuid().optional().describe("Defaults to the active company."),
  parentGoalId: z.string().uuid().optional().describe("The goal this one cascades from."),
  departmentId: z.string().uuid().optional(),
});

export const createGoalTool: AgentTool = {
  name: "create_goal",
  description:
    "Create a goal — the top of the real work chain: goal → project or task → completion. Cascade a " +
    "broader goal into a narrower one by passing parentGoalId (a group goal's children are company " +
    "goals; a company goal's children can be department goals). Goals are deliberately not " +
    "self-service the way tasks are: only create one when the founder has actually asked for it or " +
    "confirmed a proposal — never invent a goal on your own initiative.",
  inputSchema: {
    type: "object",
    properties: {
      objective: { type: "string" },
      keyResults: { type: "array", items: { type: "string" }, description: "measurable results, if any." },
      period: { type: "string", description: "e.g. 'Q3 2025'." },
      companyId: { type: "string", description: "defaults to the active company." },
      parentGoalId: { type: "string", description: "the goal this one cascades from, if any." },
      departmentId: { type: "string", description: "the department this goal belongs to, if any." },
    },
    required: ["objective"],
  },
  async handler(rawInput, ctx) {
    const parsed = inputSchema.safeParse(rawInput);
    if (!parsed.success) {
      return { content: `Invalid input: ${parsed.error.message}`, isError: true };
    }
    const { objective, keyResults, period, parentGoalId, departmentId } = parsed.data;
    const companyId = parsed.data.companyId ?? ctx.activeCompanyId;

    const scopedCompanyIds = await getScopedCompanyIds(ctx.supabase, ctx.activeCompanyId);
    if (!scopedCompanyIds.includes(companyId)) {
      return { content: "That company isn't in your current scope.", isError: true };
    }

    if (parentGoalId) {
      const { data: parent } = await ctx.supabase.from("goals").select("id").eq("id", parentGoalId).maybeSingle();
      if (!parent) {
        return { content: "parentGoalId doesn't match a real goal.", isError: true };
      }
    }

    const { data: goal, error } = await ctx.supabase
      .from("goals")
      .insert({
        objective,
        key_results: keyResults ?? [],
        period: period ?? "",
        company_id: companyId,
        parent_goal_id: parentGoalId ?? null,
        department_id: departmentId ?? null,
      })
      .select("id")
      .single();
    if (error || !goal) {
      return { content: `Failed to create goal: ${error?.message}`, isError: true };
    }

    await ctx.supabase.from("audit_log").insert({
      actor_type: "agent",
      actor_id: ctx.agentId,
      action: "create_goal",
      target_type: "goal",
      target_id: goal.id,
      company_id: companyId,
      metadata: JSON.parse(JSON.stringify({ parentGoalId })),
    });

    return { content: `Created (goal id ${goal.id}).` };
  },
};
