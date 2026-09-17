import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { runAgentTurn } from "@/lib/agent/agent-runtime";
import { getFounderUserId } from "@/lib/agent/founder";
import { withApiErrorHandling } from "@/lib/api-error";
import { isDemoMode, demoChatReply } from "@/lib/demo-mode";

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

  if (isDemoMode()) return NextResponse.json(demoChatReply(message, agentId));

  const supabase = await createClient();

  // No agentId supplied: fall back to this company's default agent, same as
  // before the agent switcher existed. A company can have more than one
  // company-scope agent since Phase 2 (Sales Lead, Marketing Lead, etc.
  // alongside the Managing Director/Studio Director) — the department-less
  // company-scope agent is the company-wide synthesis role (migration 0009),
  // so prefer that, falling back to whatever exists.
  let resolvedAgentId = agentId;
  if (!resolvedAgentId) {
    const baseQuery = () =>
      supabase.from("agents").select("id").eq("company_id", activeCompanyId).eq("scope", "company").eq("status", "active");

    const { data: executiveAgent } = await baseQuery().is("department_id", null).order("name", { ascending: true }).limit(1).maybeSingle();
    const { data: anyAgent } = executiveAgent
      ? { data: executiveAgent }
      : await baseQuery().order("name", { ascending: true }).limit(1).maybeSingle();

    if (!anyAgent) {
      return NextResponse.json(
        { error: "No active agent found for this company — it isn't seeded yet." },
        { status: 404 },
      );
    }
    resolvedAgentId = anyAgent.id;
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
