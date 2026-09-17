import { z } from "zod";
import type { AgentTool } from "@/lib/agent/types";
import { getScopedCompanyIds, resolveMemoryOwnerCompanyId } from "@/lib/agent/scoped-companies";

const inputSchema = z.object({
  memoryId: z.string().uuid(),
});

export const promoteMemoryTool: AgentTool = {
  name: "promote_memory",
  description:
    "Promote a memory to group scope, so it's visible across every company rather than just the " +
    "one it was created in — for a finding genuinely useful group-wide (e.g. a lead-qualification " +
    "lesson that applies beyond one company). Not approval-gated: this is internal knowledge " +
    "management, not an external action.",
  inputSchema: {
    type: "object",
    properties: {
      memoryId: { type: "string", description: "id of the memory to promote." },
    },
    required: ["memoryId"],
  },
  async handler(rawInput, ctx) {
    const parsed = inputSchema.safeParse(rawInput);
    if (!parsed.success) {
      return { content: `Invalid input: ${parsed.error.message}`, isError: true };
    }

    const { data: original, error: fetchErr } = await ctx.supabase
      .from("memories")
      .select("content, embedding, source_document_id, importance, confidence, scope, scope_id")
      .eq("id", parsed.data.memoryId)
      .single();
    if (fetchErr || !original) {
      return { content: `Memory not found: ${fetchErr?.message ?? "no such id"}`, isError: true };
    }

    // Same scoping boundary record_memory enforces on write: an agent can
    // only promote a memory whose owning company is one it can actually
    // see. ctx.supabase is the service-role client — this app-level check
    // is the only authorization boundary here, not a backstop on top of RLS.
    const ownerCompanyId = await resolveMemoryOwnerCompanyId(ctx.supabase, original.scope, original.scope_id);
    if (ownerCompanyId) {
      const scopedCompanyIds = await getScopedCompanyIds(ctx.supabase, ctx.activeCompanyId);
      if (!scopedCompanyIds.includes(ownerCompanyId)) {
        return { content: "That memory isn't in your current scope.", isError: true };
      }
    }

    const { data: groupCompany } = await ctx.supabase
      .from("companies")
      .select("id")
      .is("parent_id", null)
      .limit(1)
      .single();
    if (!groupCompany) {
      return { content: "No group-level company found to promote into.", isError: true };
    }

    const { data: promoted, error: insertErr } = await ctx.supabase
      .from("memories")
      .insert({
        scope: "group",
        scope_id: groupCompany.id,
        content: original.content,
        embedding: original.embedding,
        source_document_id: original.source_document_id,
        importance: Math.min(1, Number(original.importance) + 0.1),
        confidence: original.confidence,
        created_by: ctx.userId,
        promoted_from_id: parsed.data.memoryId,
        source: "promoted",
      })
      .select("id")
      .single();
    if (insertErr || !promoted) {
      return { content: `Failed to promote memory: ${insertErr?.message}`, isError: true };
    }

    await ctx.supabase.from("audit_log").insert({
      actor_type: "agent",
      actor_id: ctx.agentId,
      action: "promote_memory",
      target_type: "memory",
      target_id: promoted.id,
      company_id: ctx.activeCompanyId,
      metadata: { promoted_from_id: parsed.data.memoryId },
    });

    return { content: `Promoted to group scope (new memory id ${promoted.id}).` };
  },
};
