import { z } from "zod";
import type { AgentTool } from "@/lib/agent/types";
import { getScopedCompanyIds } from "@/lib/agent/scoped-companies";

const inputSchema = z.object({
  title: z.string().min(1),
  description: z.string().optional(),
  assigneeAgentId: z.string().uuid(),
  priority: z.enum(["low", "normal", "high", "urgent"]).optional(),
  dueAt: z.string().optional().describe("ISO date/time, if this has a deadline."),
  projectId: z.string().uuid().optional(),
});

export const assignTaskTool: AgentTool = {
  name: "assign_task",
  description:
    "Delegate real work: create a task and assign it to a specific agent, with a priority and " +
    "optional due date. Use this instead of a synchronous request_from_agent call whenever the work " +
    "will take the target agent more than one exchange — the assignment shows up in their own " +
    "context on their next turn, and its status is visible to everyone, not just the two of you. " +
    "Not approval-gated: this is internal delegation, not an external action.",
  inputSchema: {
    type: "object",
    properties: {
      title: { type: "string" },
      description: { type: "string" },
      assigneeAgentId: { type: "string", description: "id of the agent this task is assigned to." },
      priority: { type: "string", enum: ["low", "normal", "high", "urgent"] },
      dueAt: { type: "string", description: "ISO date/time, if this has a deadline." },
      projectId: { type: "string", description: "optional: the project this task belongs to." },
    },
    required: ["title", "assigneeAgentId"],
  },
  async handler(rawInput, ctx) {
    const parsed = inputSchema.safeParse(rawInput);
    if (!parsed.success) {
      return { content: `Invalid input: ${parsed.error.message}`, isError: true };
    }
    const { title, description, assigneeAgentId, priority, dueAt, projectId } = parsed.data;

    const { data: assignee } = await ctx.supabase
      .from("agents")
      .select("id, name, company_id, status")
      .eq("id", assigneeAgentId)
      .single();
    if (!assignee) {
      return { content: "Assignee agent not found.", isError: true };
    }
    if (assignee.status !== "active") {
      return { content: `${assignee.name} is ${assignee.status}, not active — can't assign work to them.`, isError: true };
    }
    const scopedCompanyIds = await getScopedCompanyIds(ctx.supabase, ctx.activeCompanyId);
    if (!scopedCompanyIds.includes(assignee.company_id)) {
      return { content: `${assignee.name} isn't in your current scope — route this through Group Operations instead.`, isError: true };
    }

    const { data: task, error } = await ctx.supabase
      .from("tasks")
      .insert({
        title,
        description: description ?? null,
        company_id: ctx.activeCompanyId,
        assigned_agent_id: assigneeAgentId,
        priority: priority ?? "normal",
        due_at: dueAt ?? null,
        project_id: projectId ?? null,
        status: "open",
      })
      .select("id")
      .single();
    if (error || !task) {
      return { content: `Failed to assign task: ${error?.message}`, isError: true };
    }

    await ctx.supabase.from("audit_log").insert({
      actor_type: "agent",
      actor_id: ctx.agentId,
      action: "assign_task",
      target_type: "task",
      target_id: task.id,
      company_id: ctx.activeCompanyId,
      metadata: { assigneeAgentId, priority: priority ?? "normal" },
    });

    return { content: `Assigned to ${assignee.name} (task id ${task.id}).` };
  },
};
