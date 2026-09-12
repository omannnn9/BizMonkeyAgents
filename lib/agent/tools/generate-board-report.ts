import { z } from "zod";
import type { AgentTool } from "@/lib/agent/types";
import { getScopedCompanyIds } from "@/lib/agent/scoped-companies";

const inputSchema = z.object({
  period: z.string().min(1).describe("Label for the reporting period, e.g. 'Q3 2025'."),
});

export const generateBoardReportTool: AgentTool = {
  name: "generate_board_report",
  description:
    "Compile a board report for the active company (or the whole group, if OD Holdings is active) " +
    "from real goals, decisions, and open tasks — never invents figures. Returns markdown for you to " +
    "present; this is a read/compile action, not approval-gated.",
  inputSchema: {
    type: "object",
    properties: {
      period: { type: "string", description: "Label for the reporting period, e.g. 'Q3 2025'." },
    },
    required: ["period"],
  },
  async handler(rawInput, ctx) {
    const parsed = inputSchema.safeParse(rawInput);
    if (!parsed.success) {
      return { content: `Invalid input: ${parsed.error.message}`, isError: true };
    }

    const scopedCompanyIds = await getScopedCompanyIds(ctx.supabase, ctx.activeCompanyId);

    const [{ data: goals }, { data: decisions }, { data: openTasks }] = await Promise.all([
      ctx.supabase
        .from("goals")
        .select("objective, key_results, status")
        .in("company_id", scopedCompanyIds),
      ctx.supabase
        .from("decisions")
        .select("title, rationale, created_at")
        .in("company_id", scopedCompanyIds)
        .order("created_at", { ascending: false })
        .limit(10),
      ctx.supabase
        .from("tasks")
        .select("title, priority")
        .in("company_id", scopedCompanyIds)
        .not("status", "in", "(done,cancelled)")
        .limit(20),
    ]);

    const sections = [`# Board report — ${parsed.data.period}`];

    sections.push("## Goals");
    sections.push(
      !goals || goals.length === 0
        ? "No goals recorded yet."
        : goals.map((g) => `- **${g.objective}** (${g.status}): ${JSON.stringify(g.key_results)}`).join("\n"),
    );

    sections.push("## Recent decisions");
    sections.push(
      !decisions || decisions.length === 0
        ? "No decisions recorded yet."
        : decisions.map((d) => `- ${d.title}${d.rationale ? ` — ${d.rationale}` : ""}`).join("\n"),
    );

    sections.push("## Open tasks");
    sections.push(
      !openTasks || openTasks.length === 0
        ? "No open tasks."
        : openTasks.map((t) => `- [${t.priority}] ${t.title}`).join("\n"),
    );

    return { content: sections.join("\n\n") };
  },
};
