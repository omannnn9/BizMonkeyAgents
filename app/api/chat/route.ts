import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { runChatTurn } from "@/lib/agent/ceo-agent";
import { getFounderUserId } from "@/lib/agent/founder";
import { withApiErrorHandling } from "@/lib/api-error";

export const POST = withApiErrorHandling(async (request: Request) => {
  const { activeCompanyId, message, history } = (await request.json()) as {
    activeCompanyId: string;
    message: string;
    history: Array<{ role: "user" | "assistant"; content: string }>;
  };

  if (!activeCompanyId || !message) {
    return NextResponse.json({ error: "activeCompanyId and message are required" }, { status: 400 });
  }

  const supabase = await createClient();

  const { data: agent, error: agentErr } = await supabase
    .from("agents")
    .select("id")
    .eq("company_id", activeCompanyId)
    .eq("scope", "company")
    .eq("status", "active")
    .limit(1)
    .maybeSingle();

  if (agentErr || !agent) {
    return NextResponse.json(
      { error: "No active CEO agent found for this company — it isn't seeded yet." },
      { status: 404 },
    );
  }

  try {
    const userId = await getFounderUserId(supabase);
    const result = await runChatTurn(supabase, {
      agentId: agent.id,
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
