import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import { createClient } from "@/lib/supabase/server";
import { withApiErrorHandling } from "@/lib/api-error";
import { isDemoMode, demoGraph } from "@/lib/demo-mode";

export interface GraphNode {
  id: string;
  type: string;
  label: string;
}

export interface GraphEdge {
  source: string;
  target: string;
  relation: string;
}

/**
 * Resolves a human-readable label for each distinct (type, id) pair seen in
 * `edges`. Written as one explicit query per known entity type rather than a
 * dynamic `.from(type)` — the typed Supabase client only accepts literal
 * table names, and this keeps every query obviously correct at a glance.
 */
async function resolveLabels(
  supabase: SupabaseClient<Database>,
  idsByType: Map<string, Set<string>>,
): Promise<Map<string, string>> {
  const labelByKey = new Map<string, string>();
  const set = (type: string, id: string, label: string) => labelByKey.set(`${type}:${id}`, label);

  const companyIds = [...(idsByType.get("company") ?? [])];
  const agentIds = [...(idsByType.get("agent") ?? [])];
  const documentIds = [...(idsByType.get("document") ?? [])];
  const decisionIds = [...(idsByType.get("decision") ?? [])];
  const taskIds = [...(idsByType.get("task") ?? [])];
  const projectIds = [...(idsByType.get("project") ?? [])];
  const departmentIds = [...(idsByType.get("department") ?? [])];

  const [companies, agents, documents, decisions, tasks, projects, departments] = await Promise.all([
    companyIds.length
      ? supabase.from("companies").select("id, name").in("id", companyIds)
      : Promise.resolve({ data: [] }),
    agentIds.length
      ? supabase.from("agents").select("id, name").in("id", agentIds)
      : Promise.resolve({ data: [] }),
    documentIds.length
      ? supabase.from("documents").select("id, title").in("id", documentIds)
      : Promise.resolve({ data: [] }),
    decisionIds.length
      ? supabase.from("decisions").select("id, title").in("id", decisionIds)
      : Promise.resolve({ data: [] }),
    taskIds.length
      ? supabase.from("tasks").select("id, title").in("id", taskIds)
      : Promise.resolve({ data: [] }),
    projectIds.length
      ? supabase.from("projects").select("id, name").in("id", projectIds)
      : Promise.resolve({ data: [] }),
    departmentIds.length
      ? supabase.from("departments").select("id, name").in("id", departmentIds)
      : Promise.resolve({ data: [] }),
  ]);

  for (const r of companies.data ?? []) set("company", r.id, r.name);
  for (const r of agents.data ?? []) set("agent", r.id, r.name);
  for (const r of documents.data ?? []) set("document", r.id, r.title);
  for (const r of decisions.data ?? []) set("decision", r.id, r.title);
  for (const r of tasks.data ?? []) set("task", r.id, r.title);
  for (const r of projects.data ?? []) set("project", r.id, r.name);
  for (const r of departments.data ?? []) set("department", r.id, r.name);

  return labelByKey;
}

export const GET = withApiErrorHandling(async () => {
  if (isDemoMode()) return NextResponse.json(demoGraph());

  const supabase = await createClient();
  const { data: edgeRows, error } = await supabase
    .from("edges")
    .select("source_type, source_id, target_type, target_id, relation")
    .limit(500);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const idsByType = new Map<string, Set<string>>();
  const addId = (type: string, id: string) => {
    if (!idsByType.has(type)) idsByType.set(type, new Set());
    idsByType.get(type)!.add(id);
  };
  for (const e of edgeRows ?? []) {
    addId(e.source_type, e.source_id);
    addId(e.target_type, e.target_id);
  }

  const labelByKey = await resolveLabels(supabase, idsByType);

  const nodeKeys = new Set<string>();
  const nodes: GraphNode[] = [];
  const addNode = (type: string, id: string) => {
    const key = `${type}:${id}`;
    if (nodeKeys.has(key)) return;
    nodeKeys.add(key);
    nodes.push({ id: key, type, label: labelByKey.get(key) ?? `${type} (${id.slice(0, 8)})` });
  };

  const edges: GraphEdge[] = [];
  for (const e of edgeRows ?? []) {
    addNode(e.source_type, e.source_id);
    addNode(e.target_type, e.target_id);
    edges.push({
      source: `${e.source_type}:${e.source_id}`,
      target: `${e.target_type}:${e.target_id}`,
      relation: e.relation,
    });
  }

  return NextResponse.json({ nodes, edges });
});
