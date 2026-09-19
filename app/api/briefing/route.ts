import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { runAgentTurn } from "@/lib/agent/agent-runtime";
import { getFounderUserId } from "@/lib/agent/founder";
import { withApiErrorHandling } from "@/lib/api-error";

const OD_HOLDINGS_ID = "00000000-0000-0000-0000-000000000001";

const BRIEFING_PROMPT =
  "Compile this week's executive briefing for the whole group: what's outstanding across every " +
  "company (open tasks, blocked work), what's been decided recently, how each company's goals are " +
  "tracking, and anything that needs my attention. Pull this from real data, not a template.";

/**
 * The Founder Command Center's "Weekly Executive Briefing" action — a live
 * synthesis, not a stored artifact. This deliberately doesn't add a new
 * table: it runs the real Group CEO agent (the top of the org at OD
 * Holdings, the founder's primary point of contact — see
 * AGENTS_AND_TOOLS.md) through the same runAgentTurn() every other agent
 * call uses, with a fixed prompt, and returns its real reply — reasoning
 * over real tasks/decisions/goals via its existing tools, the same way
 * asking it directly in chat would. Getting its own independent
 * agent_runs row is what makes it real and auditable, not a one-off text
 * generation nobody can trace back to anything.
 */
export const POST = withApiErrorHandling(async () => {
  const supabase = await createClient();
  const { data: groupCeo, error } = await supabase
    .from("agents")
    .select("id")
    .eq("name", "Group CEO")
    .eq("company_id", OD_HOLDINGS_ID)
    .eq("status", "active")
    .maybeSingle();
  if (error || !groupCeo) {
    return NextResponse.json(
      { error: "No active Group CEO agent found — it isn't seeded yet." },
      { status: 404 },
    );
  }

  const userId = await getFounderUserId(supabase);
  const result = await runAgentTurn(supabase, {
    agentId: groupCeo.id,
    activeCompanyId: OD_HOLDINGS_ID,
    userId,
    userMessage: BRIEFING_PROMPT,
    history: [],
  });

  return NextResponse.json(result);
});
