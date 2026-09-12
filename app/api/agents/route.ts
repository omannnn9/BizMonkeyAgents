import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { withApiErrorHandling } from "@/lib/api-error";
import { isDemoMode, demoAgents } from "@/lib/demo-mode";

export const GET = withApiErrorHandling(async (request: Request) => {
  const { searchParams } = new URL(request.url);
  const companyId = searchParams.get("companyId");
  if (!companyId) {
    return NextResponse.json({ error: "companyId is required" }, { status: 400 });
  }

  if (isDemoMode()) return NextResponse.json(demoAgents(companyId));

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("agents")
    .select("id, name, role_title")
    .eq("company_id", companyId)
    .eq("status", "active")
    .order("name");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ agents: data ?? [] });
});
