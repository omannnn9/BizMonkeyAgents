import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { withApiErrorHandling } from "@/lib/api-error";
import { isDemoMode, demoBrain } from "@/lib/demo-mode";

export interface BrainMemory {
  id: string;
  scope: string;
  scopeId: string | null;
  /** Resolved server-side: a company name for scope="company", "Group" / "Founder" for those scopes. */
  scopeLabel: string;
  content: string;
  importance: number;
  confidence: number;
  source: string;
  createdAt: string;
}

export interface BrainDocumentCount {
  companyId: string;
  companyName: string;
  count: number;
}

export interface BrainDocument {
  id: string;
  title: string;
  mimeType: string | null;
  companyId: string;
  companyName: string;
  createdAt: string;
}

export interface BrainSynergy {
  memoryAId: string;
  memoryBId: string;
  similarity: number;
}

/**
 * Purpose-built for the AI Brain view, same "narrower than the generic
 * routes, assembled for one consumer" precedent /api/map already set for
 * the colony world. Every other route in this app is scoped to one
 * companyId on purpose (the per-company pages); the Brain is explicitly
 * org-wide, so this is the one new route this pass adds rather than
 * bending an existing one to a job it wasn't shaped for.
 */
export const GET = withApiErrorHandling(async () => {
  if (isDemoMode()) return NextResponse.json(demoBrain());

  const supabase = await createClient();

  const [{ count: totalMemoryCount }, { data: memoryRows }, { data: companies }, { data: synergyRows }, { data: documentRows }] =
    await Promise.all([
      supabase.from("memories").select("id", { count: "exact", head: true }),
      supabase
        .from("memories")
        .select("id, scope, scope_id, content, importance, confidence, source, created_at")
        .order("created_at", { ascending: false })
        .limit(200),
      supabase.from("companies").select("id, name"),
      supabase.rpc("match_cross_company_memories", { p_limit: 20 }),
      // Same .limit() precedent memories above already sets — newest 100,
      // not every document ever uploaded.
      supabase
        .from("documents")
        .select("id, title, mime_type, company_id, created_at")
        .order("created_at", { ascending: false })
        .limit(100),
    ]);

  const companyNameById = new Map((companies ?? []).map((c) => [c.id, c.name]));

  function resolveScopeLabel(scope: string, scopeId: string | null): string {
    if (scope === "group") return "Group";
    if (scope === "founder") return "Founder";
    if (scope === "company") return (scopeId && companyNameById.get(scopeId)) || "Company";
    // department/project/agent-scope memories: reserved by the schema, but
    // nothing in this app creates one yet — resolved generically rather
    // than crashing if that ever changes.
    return scope.charAt(0).toUpperCase() + scope.slice(1);
  }

  const memories: BrainMemory[] = (memoryRows ?? []).map((m) => ({
    id: m.id,
    scope: m.scope,
    scopeId: m.scope_id,
    scopeLabel: resolveScopeLabel(m.scope, m.scope_id),
    content: m.content,
    importance: Number(m.importance),
    confidence: Number(m.confidence),
    source: m.source,
    createdAt: m.created_at,
  }));

  const documentCounts: BrainDocumentCount[] = await Promise.all(
    (companies ?? []).map(async (c) => {
      const { count } = await supabase
        .from("documents")
        .select("id", { count: "exact", head: true })
        .eq("company_id", c.id);
      return { companyId: c.id, companyName: c.name, count: count ?? 0 };
    }),
  ).then((rows) => rows.filter((r) => r.count > 0));

  const synergies: BrainSynergy[] = (synergyRows ?? []).map((s) => ({
    memoryAId: s.memory_a_id,
    memoryBId: s.memory_b_id,
    similarity: s.similarity,
  }));

  const documents: BrainDocument[] = (documentRows ?? []).map((d) => ({
    id: d.id,
    title: d.title,
    mimeType: d.mime_type,
    companyId: d.company_id,
    companyName: companyNameById.get(d.company_id) ?? "Company",
    createdAt: d.created_at,
  }));

  return NextResponse.json({
    totalMemoryCount: totalMemoryCount ?? 0,
    memories,
    documentCounts,
    documents,
    synergies,
  });
});
