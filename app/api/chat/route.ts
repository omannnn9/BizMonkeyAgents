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

  // No agentId supplied: fall back to this company's default (CEO-style,
  // scope='company') agent, same as before the agent switcher existed.
  let resolvedAgentId = agentId;
  if (!resolvedAgentId) {
    // A company can have more than one company-scope agent since Phase 2
    // (Sales, Marketing alongside the CEO agent) — prefer the CEO-style
    // agent by name as the default, falling back to whatever exists.
    const { data: agent, error: agentErr } = await supabase
      .from("agents")
      .select("id")
      .eq("company_id", activeCompanyId)
      .eq("scope", "company")
      .eq("status", "active")
      .order("name", { ascending: true }) // "CEO Agent" sorts before "Marketing"/"Sales" alphabetically
      .limit(1)
      .maybeSingle();

    if (agentErr || !agent) {
      return NextResponse.json(
        { error: "No active agent found for this company — it isn't seeded yet." },
        { status: 404 },
      );
    }
    resolvedAgentId = agent.id;
  }

  try {
    const userId = await getFounderUserId(supabase);
    const result = await runAgentTurn(supabase, {
      agentId: resolvedAgentId,
      activeCompanyId,
      userId,
      userMessage: message,
      history: history ?? [],
    });
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 },
    );
  }
});
