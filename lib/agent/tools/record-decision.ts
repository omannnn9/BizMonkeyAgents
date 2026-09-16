import { z } from "zod";
import type { AgentTool } from "@/lib/agent/types";

const inputSchema = z.object({
  title: z.string().min(1),
  description: z.string().optional(),
  rationale: z.string().optional(),
  relatedTaskId: z.string().uuid().optional(),
});

export const recordDecisionTool: AgentTool = {
  name: "record_decision",
  description:
    "Log an irreversible or resource-committing choice as a structured decision record — a pricing " +
    "change, a hire, accepting or declining a project, anything that shouldn't just live in chat. " +
    "A decision is a fact of record, distinct from a memory (a retrievable insight): use " +
    "record_memory for what you learned, record_decision for what was decided. Read by " +
    "generate_board_report. Not approval-gated: recording a decision that was already made isn't an " +
    "external action.",
  inputSchema: {
    type: "object",
    properties: {
      title: { type: "string" },
      description: { type: "string" },
      rationale: { type: "string", description: "why this was decided." },
      relatedTaskId: { type: "string", description: "optional: the task this decision resolved." },
    },
    required: ["title"],
  },
  async handler(rawInput, ctx) {
    const parsed = inputSchema.safeParse(rawInput);
    if (!parsed.success) {
      return { content: `Invalid input: ${parsed.error.message}`, isError: true };
    }
    const { title, description, rationale, relatedTaskId } = parsed.data;

    const { data: decision, error } = await ctx.supabase
      .from("decisions")
      .insert({
        title,
        description: description ?? null,
        rationale: rationale ?? null,
        related_task_id: relatedTaskId ?? null,
        company_id: ctx.activeCompanyId,
        made_by: ctx.userId,
      })
      .select("id")
      .single();
    if (error || !decision) {
      return { content: `Failed to record decision: ${error?.message}`, isError: true };
    }

    await ctx.supabase.from("audit_log").insert({
      actor_type: "agent",
      actor_id: ctx.agentId,
      action: "record_decision",
      target_type: "decision",
      target_id: decision.id,
      company_id: ctx.activeCompanyId,
      metadata: JSON.parse(JSON.stringify({ relatedTaskId })),
    });

    return { content: `Recorded (decision id ${decision.id}).` };
  },
};
