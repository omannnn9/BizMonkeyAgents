import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getScopedCompanyIds } from "@/lib/agent/scoped-companies";
import { withApiErrorHandling } from "@/lib/api-error";

export const GET = withApiErrorHandling(async (request: Request) => {
  const companyId = new URL(request.url).searchParams.get("companyId");
  if (!companyId) return NextResponse.json({ error: "companyId is required" }, { status: 400 });

  const supabase = await createClient();
  const scopedCompanyIds = await getScopedCompanyIds(supabase, companyId);

  // Group and founder-scope memories are visible regardless of which
  // company is active; company-scope memories only for the active
  // company (and its children, same expansion as everywhere else).
  // department/project/agent-scope memories aren't surfaced here yet —
  // nothing in the app creates one, so there's nothing real to show.
  const { data, error } = await supabase
    .from("memories")
    .select("id, scope, scope_id, content, importance, confidence, source, created_at, promoted_from_id")
    .or(
      `scope.eq.group,scope.eq.founder,and(scope.eq.company,scope_id.in.(${scopedCompanyIds.join(",")}))`,
    )
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ memories: data ?? [] });
});
