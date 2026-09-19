import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getScopedCompanyIds } from "@/lib/agent/scoped-companies";
import { withApiErrorHandling } from "@/lib/api-error";

export const GET = withApiErrorHandling(async (request: Request) => {
  const url = new URL(request.url);
  const companyId = url.searchParams.get("companyId");
  const agentId = url.searchParams.get("agentId");
  if (!companyId) return NextResponse.json({ error: "companyId is required" }, { status: 400 });

  const supabase = await createClient();
  const scopedCompanyIds = await getScopedCompanyIds(supabase, companyId);

  let runsQuery = supabase
    .from("agent_runs")
    .select("id, agent_id, created_at, status, model, input, output, tool_calls")
    .in("company_id", scopedCompanyIds)
    .order("created_at", { ascending: false })
    .limit(30);
  if (agentId) runsQuery = runsQuery.eq("agent_id", agentId);

  const [runs, logs] = await Promise.all([
    runsQuery,
    supabase
      .from("audit_log")
      .select("id, created_at, actor_type, action, target_type")
      .in("company_id", scopedCompanyIds)
      .order("created_at", { ascending: false })
      .limit(30),
  ]);

  return NextResponse.json({ runs: runs.data ?? [], logs: logs.data ?? [] });
});
