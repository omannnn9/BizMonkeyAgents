import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { runAgentTurn } from "@/lib/agent/agent-runtime";
import { getFounderUserId } from "@/lib/agent/founder";
import { withApiErrorHandling } from "@/lib/api-error";
import { isDemoMode, demoBriefing } from "@/lib/demo-mode";

const OD_HOLDINGS_ID = "00000000-0000-0000-0000-000000000001";

const BRIEFING_PROMPT =
  "Compile this week's executive briefing for the whole group: what's outstanding across every " +
  "company (open tasks, blocked work), what's been decided recently, how each company's goals are " +
  "tracking, and anything that needs my attention. Pull this from real data, not a template.";

/**
 * The Founder Command Center's "Weekly Executive Briefing" action — a live
 * synthesis, not a stored artifact. This deliberately doesn't add a new
 * table: it runs the real Chief of Staff agent (OD Holdings' synthesis-
 * across-the-group role, migration 0009) through the same runAgentTurn()
 * every other agent call uses, with a fixed prompt, and returns its real
 * reply — reasoning over real tasks/decisions/goals via its existing
 * tools, the same way asking it directly in chat would. Getting its own
 * independent agent_runs row is what makes it real and auditable, not a
 * one-off text generation nobody can trace back to anything.
 */
export const POST = withApiErrorHandling(async () => {
  if (isDemoMode()) return NextResponse.json(demoBriefing());

  const supabase = await createClient();
  const { data: chiefOfStaff, error } = await supabase
    .from("agents")
    .select("id")
    .eq("name", "Chief of Staff")
    .eq("company_id", OD_HOLDINGS_ID)
    .eq("status", "active")
    .maybeSingle();
  if (error || !chiefOfStaff) {
    return NextResponse.json(
      { error: "No active Chief of Staff agent found — it isn't seeded yet." },
      { status: 404 },
    );
  }

  const userId = await getFounderUserId(supabase);
  const result = await runAgentTurn(supabase, {
    agentId: chiefOfStaff.id,
    activeCompanyId: OD_HOLDINGS_ID,
    userId,
    userMessage: BRIEFING_PROMPT,
    history: [],
  });

  return NextResponse.json(result);
});
