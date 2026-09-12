import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { withApiErrorHandling } from "@/lib/api-error";
import { isDemoMode, demoMap } from "@/lib/demo-mode";

export interface MapNode {
  id: string;
  type: "company" | "agent";
  label: string;
  lastRunAt: string | null;
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

  const [{ data: companies }, { data: agents }, { data: runs }] = await Promise.all([
    companyIds.size
      ? supabase.from("companies").select("id, name").in("id", [...companyIds])
      : Promise.resolve({ data: [] }),
    agentIds.size
      ? supabase.from("agents").select("id, name").in("id", [...agentIds])
      : Promise.resolve({ data: [] }),
    agentIds.size
      ? supabase
          .from("agent_runs")
          .select("agent_id, created_at")
          .in("agent_id", [...agentIds])
          .order("created_at", { ascending: false })
          .limit(500)
      : Promise.resolve({ data: [] }),
  ]);

  const lastRunByAgent = new Map<string, string>();
  for (const r of runs ?? []) {
    if (!lastRunByAgent.has(r.agent_id)) lastRunByAgent.set(r.agent_id, r.created_at);
  }

  const nodes: MapNode[] = [
    ...(companies ?? []).map((c) => ({
      id: `company:${c.id}`,
      type: "company" as const,
      label: c.name,
      lastRunAt: null,
    })),
    ...(agents ?? []).map((a) => ({
      id: `agent:${a.id}`,
      type: "agent" as const,
      label: a.name,
      lastRunAt: lastRunByAgent.get(a.id) ?? null,
    })),
  ];

  const edges: MapEdge[] = (edgeRows ?? []).map((e) => ({
    source: `${e.source_type}:${e.source_id}`,
    target: `${e.target_type}:${e.target_id}`,
    relation: e.relation,
  }));

  return NextResponse.json({ nodes, edges });
});
