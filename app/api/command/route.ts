import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { withApiErrorHandling } from "@/lib/api-error";
import { isDemoMode, demoCommand } from "@/lib/demo-mode";

/**
 * The Founder Command Center's single data source — org-wide (unscoped by
 * the active-company switcher, unlike every other API route), since the
 * whole point is a cross-company view the founder can't get by clicking
 * through each company one at a time. Every field traces to a real table
 * already in the schema: pending approvals/blocked tasks/overdue tasks/
 * at-risk goals feed the Attention Center, `match_cross_company_memories`
 * (the same RPC `detect_synergies` calls) feeds Opportunities, and a fixed
 * set of `agent_runs` feed recent Activity. Nothing here is computed by an
 * LLM — that's reserved for the separate, explicit `/api/briefing` action.
 */
/** `companies.config` is deliberately free-form jsonb (see DATA_MODEL.md)
 *  — read defensively rather than assuming a fixed shape. `ownership` and
 *  `market` are the two fields every seeded company's config actually
 *  carries (see 0002_seed_companies.sql), the ones the Ecosystem Audit
 *  flagged as real, seeded, and invisible anywhere in the UI. */
function extractOwnership(config: unknown): Record<string, number> | null {
  if (config && typeof config === "object" && "ownership" in config) {
    const ownership = (config as { ownership?: unknown }).ownership;
    if (ownership && typeof ownership === "object") return ownership as Record<string, number>;
  }
  return null;
}
function extractMarket(config: unknown): string | null {
  if (config && typeof config === "object" && "market" in config) {
    const market = (config as { market?: unknown }).market;
    if (typeof market === "string") return market;
  }
  return null;
}

export const GET = withApiErrorHandling(async () => {
  if (isDemoMode()) return NextResponse.json(demoCommand());

  const supabase = await createClient();

  const { data: companies } = await supabase
    .from("companies")
    .select("id, name, parent_id, industry, config")
    .order("name");
  const companyNameById = new Map((companies ?? []).map((c) => [c.id, c.name]));

  const [
    { data: pendingApprovalsRaw },
    { data: blockedTasksRaw },
    { data: overdueTasksRaw },
    { data: atRiskGoalsRaw },
    { data: allOpenTasks },
    { data: allGoals },
    { data: recentRuns },
    { data: synergyPairs },
    { data: briefingMemories },
  ] = await Promise.all([
    supabase
      .from("approvals")
      .select("id, proposed_by_agent_id, company_id, action_type, risk_level, created_at")
      .eq("status", "pending")
      .order("created_at", { ascending: true })
      .limit(20),
    supabase
      .from("tasks")
      .select("id, title, company_id, created_at")
      .eq("status", "blocked")
      .order("created_at", { ascending: false })
      .limit(20),
    supabase
      .from("tasks")
      .select("id, title, company_id, due_at")
      .not("status", "in", "(done,cancelled)")
      .not("due_at", "is", null)
      .lt("due_at", new Date().toISOString())
      .order("due_at", { ascending: true })
      .limit(20),
    supabase
      .from("goals")
      .select("id, objective, company_id, status")
      .in("status", ["at_risk", "off_track"])
      .order("updated_at", { ascending: false })
      .limit(20),
    // Company-health counts computed in JS from a bounded row set — the org
    // is a handful of companies, not thousands, so this beats a second RPC.
    supabase.from("tasks").select("company_id, status").not("status", "in", "(done,cancelled)"),
    supabase.from("goals").select("company_id, status"),
    supabase
      .from("agent_runs")
      .select("id, agent_id, company_id, status, output, created_at")
      .order("created_at", { ascending: false })
      .limit(15),
    supabase.rpc("match_cross_company_memories", { p_limit: 5 }),
    supabase
      .from("memories")
      .select("scope_id, content, created_at")
      .eq("scope", "company")
      .eq("source", "briefing")
      .order("created_at", { ascending: false })
      .limit(50),
  ]);

  const withCompanyName = <T extends { company_id: string }>(rows: T[] | null) =>
    (rows ?? []).map((r) => ({ ...r, company_name: companyNameById.get(r.company_id) ?? r.company_id }));

  // Per-company health: open/blocked task counts and goal-status counts
  // computed from the bounded rows above, plus one more-recent-per-company
  // pass over the same `recentRuns` fetch already used for Activity — no
  // extra query.
  const lastRunByCompany = new Map<string, { created_at: string; status: string }>();
  for (const r of recentRuns ?? []) {
    if (!lastRunByCompany.has(r.company_id)) lastRunByCompany.set(r.company_id, r);
  }
  const pendingByCompany = new Map<string, number>();
  for (const a of pendingApprovalsRaw ?? []) pendingByCompany.set(a.company_id, (pendingByCompany.get(a.company_id) ?? 0) + 1);

  const companyHealth = (companies ?? []).map((c) => {
    const openTasks = (allOpenTasks ?? []).filter((t) => t.company_id === c.id);
    const goals = (allGoals ?? []).filter((g) => g.company_id === c.id);
    const lastRun = lastRunByCompany.get(c.id);
    return {
      companyId: c.id,
      companyName: c.name,
      industry: c.industry,
      ownership: extractOwnership(c.config),
      market: extractMarket(c.config),
      openTasks: openTasks.length,
      blockedTasks: openTasks.filter((t) => t.status === "blocked").length,
      pendingApprovals: pendingByCompany.get(c.id) ?? 0,
      lastRunAt: lastRun?.created_at ?? null,
      lastRunStatus: lastRun?.status ?? null,
      goalsOnTrack: goals.filter((g) => g.status === "on_track").length,
      goalsAtRisk: goals.filter((g) => g.status === "at_risk").length,
      goalsOffTrack: goals.filter((g) => g.status === "off_track").length,
    };
  });

  const opportunities = (synergyPairs ?? []).map((p) => ({
    similarity: Math.round(p.similarity * 1000) / 1000,
    companyA: p.company_a_name,
    memoryA: p.memory_a_content,
    companyB: p.company_b_name,
    memoryB: p.memory_b_content,
  }));

  // One briefing per company — the most recent, since `briefingMemories` is
  // already ordered newest-first.
  const briefingByCompany = new Map<string, { content: string; created_at: string }>();
  for (const m of briefingMemories ?? []) {
    if (m.scope_id && !briefingByCompany.has(m.scope_id)) briefingByCompany.set(m.scope_id, m);
  }
  const dailyBriefings = [...briefingByCompany.entries()].map(([companyId, m]) => ({
    companyId,
    companyName: companyNameById.get(companyId) ?? companyId,
    content: m.content,
    createdAt: m.created_at,
  }));

  return NextResponse.json({
    companies: companies ?? [],
    attention: {
      pendingApprovals: withCompanyName(pendingApprovalsRaw),
      blockedTasks: withCompanyName(blockedTasksRaw),
      overdueTasks: withCompanyName(overdueTasksRaw),
      atRiskGoals: withCompanyName(atRiskGoalsRaw),
    },
    companyHealth,
    opportunities,
    recentActivity: (recentRuns ?? []).map((r) => ({
      id: r.id,
      agentId: r.agent_id,
      status: r.status,
      output: r.output,
      createdAt: r.created_at,
    })),
    dailyBriefings,
  });
});
