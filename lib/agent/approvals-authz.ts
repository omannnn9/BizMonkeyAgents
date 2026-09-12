import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";

/**
 * Re-implementation of the migration's private.controls_approvals_for()
 * SQL function, but taking an explicit user id instead of reading
 * auth.uid() — that function relies on a Postgres session carrying a JWT
 * claim, which the service-role client (no login, no session) never has.
 * Same semantics: a controls_approvals row at the company itself OR at any
 * ancestor (so a group-level controller can approve a subsidiary's action).
 */
export async function controlsApprovalsFor(
  supabase: SupabaseClient<Database>,
  userId: string,
  companyId: string,
): Promise<boolean> {
  async function getParentId(id: string): Promise<string | null> {
    const { data } = await supabase.from("companies").select("parent_id").eq("id", id).single();
    return data?.parent_id ?? null;
  }

  const ancestorIds = [companyId];
  let currentId: string | null = companyId;
  while (currentId) {
    const parentId: string | null = await getParentId(currentId);
    currentId = parentId;
    if (currentId) ancestorIds.push(currentId);
  }

  const { data } = await supabase
    .from("company_members")
    .select("id")
    .eq("user_id", userId)
    .eq("controls_approvals", true)
    .in("company_id", ancestorIds)
    .limit(1)
    .maybeSingle();

  return !!data;
}
