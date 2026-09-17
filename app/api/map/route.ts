import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { withApiErrorHandling } from "@/lib/api-error";
import { isDemoMode, demoMap } from "@/lib/demo-mode";

export interface MapNode {
  id: string;
  type: "company" | "agent";
  label: string;
  lastRunAt: string | null;
  // Agent-only — the colony view's Operator state depends on these; always
  // null/false on company nodes.
  lastRunStatus: "success" | "error" | "pending" | null;
  hasPendingApproval: boolean;
  // Agent-only, additive — power the "sleeping" state and rank labels
  // (deriveAgentState / deriveAgentRank). All four columns already existed
  // on `agents`; this just returns them where they weren't selected before.
  status: string | null;
  scope: string | null;
  departmentId: string | null;
  roleTitle: string | null;
  // Agent-only, additive (Phase 5) — real workload, from tasks.assigned_agent_id.
  openTaskCount: number | null;
  blockedTaskCount: number | null;
  // Company-only, additive (Phase 5) — the real business each district
  // represents, already seeded on `companies.industry` but never surfaced
  // in the colony world until now.
  industry: string | null;
}

export interface MapEdge {
  source: string;
  target: string;
  relation: string;
}

export const GET = withApiErrorHandling(async () => {
  if (isDemoMode()) return NextResponse.json(demoMap());

  const supabase = await createClient();

  // The living map (Part 9) is deliberately narrower than /graph: just
  // companies and agents, which are belonged to each other, so it can
  // glow the ones that actually did something recently.
  const { data: edgeRows, error } = await supabase
    .from("edges")
    .select("source_type, source_id, target_type, target_id, relation")
    .in("source_type", ["company"])
    .in("target_type", ["company", "agent"])
    .limit(200);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const companyIds = new Set<string>();
  const agentIds = new Set<string>();
  for (const e of edgeRows ?? []) {
    if (e.source_type === "company") companyIds.add(e.source_id);
    if (e.target_type === "company") companyIds.add(e.target_id);
    if (e.target_type === "agent") agentIds.add(e.target_id);
  }

  const [{ data: companies }, { data: agents }, { data: runs }, { data: pendingApprovals }, { data: openTasks }] =
    await Promise.all([
      companyIds.size
        ? supabase.from("companies").select("id, name, industry").in("id", [...companyIds])
        : Promise.resolve({ data: [] }),
      agentIds.size
        ? supabase.from("agents").select("id, name, status, scope, department_id, role_title").in("id", [...agentIds])
        : Promise.resolve({ data: [] }),
      agentIds.size
        ? supabase
            .from("agent_runs")
            .select("agent_id, created_at, status")
            .in("agent_id", [...agentIds])
            .order("created_at", { ascending: false })
            .limit(500)
        : Promise.resolve({ data: [] }),
      agentIds.size
        ? supabase
            .from("approvals")
            .select("proposed_by_agent_id")
            .in("proposed_by_agent_id", [...agentIds])
            .eq("status", "pending")
        : Promise.resolve({ data: [] }),
      agentIds.size
        ? supabase
            .from("tasks")
            .select("assigned_agent_id, status")
            .in("assigned_agent_id", [...agentIds])
            .not("status", "in", "(done,cancelled)")
        : Promise.resolve({ data: [] }),
    ]);

  const lastRunByAgent = new Map<string, { created_at: string; status: string }>();
  for (const r of runs ?? []) {
    if (!lastRunByAgent.has(r.agent_id)) lastRunByAgent.set(r.agent_id, r);
  }
  const pendingApprovalAgentIds = new Set((pendingApprovals ?? []).map((a) => a.proposed_by_agent_id));

  const openTaskCountByAgent = new Map<string, number>();
  const blockedTaskCountByAgent = new Map<string, number>();
  for (const t of openTasks ?? []) {
    if (!t.assigned_agent_id) continue;
    openTaskCountByAgent.set(t.assigned_agent_id, (openTaskCountByAgent.get(t.assigned_agent_id) ?? 0) + 1);
    if (t.status === "blocked") {
      blockedTaskCountByAgent.set(t.assigned_agent_id, (blockedTaskCountByAgent.get(t.assigned_agent_id) ?? 0) + 1);
    }
  }

  const nodes: MapNode[] = [
    ...(companies ?? []).map((c) => ({
      id: `company:${c.id}`,
      type: "company" as const,
      label: c.name,
      lastRunAt: null,
      lastRunStatus: null,
      hasPendingApproval: false,
      status: null,
      scope: null,
      departmentId: null,
      roleTitle: null,
      openTaskCount: null,
      blockedTaskCount: null,
      industry: c.industry,
    })),
    ...(agents ?? []).map((a) => ({
      id: `agent:${a.id}`,
      type: "agent" as const,
      label: a.name,
      lastRunAt: lastRunByAgent.get(a.id)?.created_at ?? null,
      lastRunStatus: (lastRunByAgent.get(a.id)?.status as MapNode["lastRunStatus"]) ?? null,
      hasPendingApproval: pendingApprovalAgentIds.has(a.id),
      status: a.status,
      scope: a.scope,
      departmentId: a.department_id,
      roleTitle: a.role_title,
      openTaskCount: openTaskCountByAgent.get(a.id) ?? 0,
      blockedTaskCount: blockedTaskCountByAgent.get(a.id) ?? 0,
      industry: null,
    })),
  ];

  const edges: MapEdge[] = (edgeRows ?? []).map((e) => ({
    source: `${e.source_type}:${e.source_id}`,
    target: `${e.target_type}:${e.target_id}`,
    relation: e.relation,
  }));

  return NextResponse.json({ nodes, edges });
});
