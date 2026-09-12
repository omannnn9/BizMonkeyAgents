import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getFounderUserId } from "@/lib/agent/founder";
import { withApiErrorHandling } from "@/lib/api-error";
import { isDemoMode } from "@/lib/demo-mode";

/**
 * The founder's own manual promotion, from the /memories page — same
 * group-scope-only promotion as the promote_memory tool
 * (lib/agent/tools/promote-memory.ts), but actor_type is 'user' here
 * instead of 'agent' in the audit log.
 */
export const POST = withApiErrorHandling(async (
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) => {
  const { id } = await params;

  if (isDemoMode()) {
    // Nothing to persist against — proves the interaction round-trips.
    return NextResponse.json({ promoted: true, demo: true });
  }

  const supabase = await createClient();
  const founderUserId = await getFounderUserId(supabase);

  const { data: original, error: fetchErr } = await supabase
    .from("memories")
    .select("content, embedding, source_document_id, importance, confidence")
    .eq("id", id)
    .single();
  if (fetchErr || !original) {
    return NextResponse.json({ error: "Memory not found" }, { status: 404 });
  }

  const { data: groupCompany } = await supabase
    .from("companies")
    .select("id")
    .is("parent_id", null)
    .limit(1)
    .single();
  if (!groupCompany) {
    return NextResponse.json({ error: "No group-level company found to promote into" }, { status: 500 });
  }

  const { data: promoted, error: insertErr } = await supabase
    .from("memories")
    .insert({
      scope: "group",
      scope_id: groupCompany.id,
      content: original.content,
      embedding: original.embedding,
      source_document_id: original.source_document_id,
      importance: Math.min(1, Number(original.importance) + 0.1),
      confidence: original.confidence,
      created_by: founderUserId,
      promoted_from_id: id,
      source: "promoted",
    })
    .select("id")
    .single();
  if (insertErr || !promoted) {
    return NextResponse.json({ error: insertErr?.message ?? "Failed to promote" }, { status: 500 });
  }

  await supabase.from("audit_log").insert({
    actor_type: "user",
    actor_id: founderUserId,
    action: "promote_memory",
    target_type: "memory",
    target_id: promoted.id,
    metadata: { promoted_from_id: id },
  });

  return NextResponse.json({ promoted: true, newMemoryId: promoted.id });
});
