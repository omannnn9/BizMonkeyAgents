import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getScopedCompanyIds } from "@/lib/agent/scoped-companies";
import { withApiErrorHandling } from "@/lib/api-error";

export const GET = withApiErrorHandling(async (request: Request) => {
  const companyId = new URL(request.url).searchParams.get("companyId");
  if (!companyId) return NextResponse.json({ error: "companyId is required" }, { status: 400 });

  const supabase = await createClient();
  const scopedCompanyIds = await getScopedCompanyIds(supabase, companyId);

  const { data, error } = await supabase
    .from("approvals")
    .select("id, action_type, payload, risk_level, status, created_at")
    .in("company_id", scopedCompanyIds)
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ approvals: data ?? [] });
});
