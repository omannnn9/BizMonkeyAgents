import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { withApiErrorHandling } from "@/lib/api-error";
import { isDemoMode, DEMO_COMPANIES } from "@/lib/demo-mode";

export const GET = withApiErrorHandling(async () => {
  if (isDemoMode()) return NextResponse.json({ companies: DEMO_COMPANIES });

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("companies")
    .select("id, name, slug, parent_id")
    .order("name");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ companies: data ?? [] });
});
