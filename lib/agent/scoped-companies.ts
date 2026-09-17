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

/** An agent's own company + scope, for collaboration-routing checks. */
export async function getAgentScopeInfo(
  supabase: SupabaseClient<Database>,
  agentId: string,
): Promise<{ companyId: string; scope: string } | null> {
  const { data } = await supabase.from("agents").select("company_id, scope").eq("id", agentId).maybeSingle();
  if (!data) return null;
  return { companyId: data.company_id, scope: data.scope };
}

/**
 * The real-org collaboration-routing rule from the Future-State
 * Specification: same-company collaboration is always free; a group-scope
 * agent on either side (the caller or the target) is also always free,
 * since the group level genuinely sits above every company; but two
 * different companies' agents talking directly to each other is not —
 * that has to route through a group-scope agent (Group Operations or
 * Group Strategy), the same way it would in a real holding company.
 */
export function canCollaborateAcrossCompanies(
  caller: { companyId: string; scope: string },
  target: { companyId: string; scope: string },
): boolean {
  if (caller.scope === "group" || target.scope === "group") return true;
  return caller.companyId === target.companyId;
}
