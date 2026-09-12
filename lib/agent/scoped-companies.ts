import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";

/**
 * The active company plus its direct children (the OD Group hierarchy is
 * two levels deep for Phase 1: OD Holdings -> {ODAX, Tablo, NOVA}). When
 * OD Holdings is active this returns all four, giving the agent a genuine
 * group-wide view; when a single company is active it returns just that
 * one id, so the agent's context switches for real when the founder
 * switches companies in the header.
 *
 * RLS still applies on top of this — a user can only ever see what their
 * own company_members rows allow, regardless of what this returns.
 */
export async function getScopedCompanyIds(
  supabase: SupabaseClient<Database>,
  activeCompanyId: string,
): Promise<string[]> {
  const { data: children } = await supabase
    .from("companies")
    .select("id")
    .eq("parent_id", activeCompanyId);

  return [activeCompanyId, ...(children ?? []).map((c) => c.id)];
}
