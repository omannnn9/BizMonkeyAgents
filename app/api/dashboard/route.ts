import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getScopedCompanyIds } from "@/lib/agent/scoped-companies";
import { withApiErrorHandling } from "@/lib/api-error";
import { isDemoMode, demoDashboard } from "@/lib/demo-mode";

export const GET = withApiErrorHandling(async (request: Request) => {
  const companyId = new URL(request.url).searchParams.get("companyId");
  if (!companyId) return NextResponse.json({ error: "companyId is required" }, { status: 400 });

  if (isDemoMode()) return NextResponse.json(demoDashboard());

  const supabase = await createClient();
  const scopedCompanyIds = await getScopedCompanyIds(supabase, companyId);

  const [openTasks, pendingApprovals, lastRun, decisions, latestBriefing] = await Promise.all([
    supabase
      .from("tasks")
      .select("id", { count: "exact", head: true })
      .in("company_id", scopedCompanyIds)
      .not("status", "in", "(done,cancelled)"),
    supabase
      .from("approvals")
      .select("id", { count: "exact", head: true })
      .in("company_id", scopedCompanyIds)
      .eq("status", "pending"),
    supabase
      .from("agent_runs")
      .select("created_at, status, model")
      .in("company_id", scopedCompanyIds)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("decisions")
      .select("id, title, created_at")
      .in("company_id", scopedCompanyIds)
      .order("created_at", { ascending: false })
      .limit(5),
    // The daily briefing Edge Function (not yet deployed — see
    // supabase/functions/daily-briefing) writes one of these per company
    // per day, scoped directly to that company (not its descendants), so
    // this reads scope_id = companyId rather than the expanded scope list.
    supabase
      .from("memories")
      .select("content, created_at")
      .eq("scope", "company")
      .eq("scope_id", companyId)
      .eq("source", "briefing")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  return NextResponse.json({
    openTasksCount: openTasks.count ?? 0,
    pendingApprovalsCount: pendingApprovals.count ?? 0,
    lastAgentRun: lastRun.data ?? null,
    recentDecisions: decisions.data ?? [],
    latestBriefing: latestBriefing.data ?? null,
  });
});
