import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { runAgentTurn } from "@/lib/agent/agent-runtime";
import { getFounderUserId } from "@/lib/agent/founder";
import { withApiErrorHandling } from "@/lib/api-error";

export const POST = withApiErrorHandling(async (request: Request) => {
  const { activeCompanyId, agentId, message, history } = (await request.json()) as {
    activeCompanyId: string;
    agentId?: string;
    message: string;
    history: Array<{ role: "user" | "assistant"; content: string }>;
  };

  if (!activeCompanyId || !message) {
    return NextResponse.json({ error: "activeCompanyId and message are required" }, { status: 400 });
  }

  const supabase = await createClient();

  // No agentId supplied: fall back to this company's default agent, same as
  // before the agent switcher existed. Priority: "Group CEO" (the top of
  // the org at OD Holdings — see AGENTS_AND_TOOLS.md), then "Chief of
  // Staff" (its synthesis layer), then the department-less company-scope
  // agent (Managing Director / Studio Director — the company-wide
  // synthesis role migration 0009 gives every real company), then whatever
  // active agent exists for that company. A company can have more than one
  // company-scope agent since Phase 2 (Sales Lead, Marketing Lead, etc.),
  // and OD Holdings has none at all (every OD Holdings agent is
  // scope='group') — this list has to cover both shapes.
  let resolvedAgentId = agentId;
  if (!resolvedAgentId) {
    const baseQuery = () =>
      supabase.from("agents").select("id, name, scope, department_id").eq("company_id", activeCompanyId).eq("status", "active");

    const { data: candidates } = await baseQuery().order("name", { ascending: true });
    const defaultAgent =
      candidates?.find((a) => a.name === "Group CEO") ??
      candidates?.find((a) => a.name === "Chief of Staff") ??
      candidates?.find((a) => a.scope === "company" && !a.department_id) ??
      candidates?.[0];

    if (!defaultAgent) {
      return NextResponse.json(
        { error: "No active agent found for this company — it isn't seeded yet." },
        { status: 404 },
      );
    }
    resolvedAgentId = defaultAgent.id;
  }

  const userId = await getFounderUserId(supabase);
  const result = await runAgentTurn(supabase, {
    agentId: resolvedAgentId,
    activeCompanyId,
    userId,
    userMessage: message,
    history: history ?? [],
  });
  return NextResponse.json(result);
});
