import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getScopedCompanyIds } from "@/lib/agent/scoped-companies";
import { withApiErrorHandling } from "@/lib/api-error";
import { isDemoMode, demoApprovals } from "@/lib/demo-mode";

export const GET = withApiErrorHandling(async (request: Request) => {
  const url = new URL(request.url);
  const companyId = url.searchParams.get("companyId");
  const agentId = url.searchParams.get("agentId");
  if (!companyId) return NextResponse.json({ error: "companyId is required" }, { status: 400 });

  if (isDemoMode()) return NextResponse.json(demoApprovals(agentId));

  const supabase = await createClient();
  const scopedCompanyIds = await getScopedCompanyIds(supabase, companyId);

  let query = supabase
    .from("approvals")
    .select("id, proposed_by_agent_id, action_type, payload, risk_level, status, created_at")
    .in("company_id", scopedCompanyIds)
    .order("created_at", { ascending: false })
    .limit(50);
  if (agentId) query = query.eq("proposed_by_agent_id", agentId);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ approvals: data ?? [] });
});
