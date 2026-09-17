import { z } from "zod";
import type { AgentTool } from "@/lib/agent/types";
import { getScopedCompanyIds, resolveMemoryOwnerCompanyId } from "@/lib/agent/scoped-companies";
import { embedDocuments } from "@/lib/embeddings/voyage";

const inputSchema = z.object({
  scope: z.enum(["founder", "group", "company", "department", "project", "agent"]),
  scopeId: z.string().uuid().optional(),
  content: z.string().min(1),
  importance: z.number().min(0).max(1).optional(),
  confidence: z.number().min(0).max(1).optional(),
  sourceDocumentId: z.string().uuid().optional(),
});

export const recordMemoryTool: AgentTool = {
  name: "record_memory",
  description:
    "Write a new memory — the default way real work becomes organizational knowledge, not an " +
    "exception. Use it whenever you learn something reusable: a finding, a lesson from how " +
    "something went, a fact worth another agent knowing later. Default to the narrowest scope " +
    "that's true (department/project/agent over company, company over group) — broader scopes " +
    "are for promoting an already-proven finding, not first drafts. Not approval-gated: this is " +
    "internal knowledge management, not an external action.",
  inputSchema: {
    type: "object",
    properties: {
      scope: { type: "string", enum: ["founder", "group", "company", "department", "project", "agent"] },
      scopeId: {
        type: "string",
        description:
          "id of the company/department/project/agent this memory belongs to. Required for every " +
          "scope except 'founder'; for 'group' this must be the top-level company's id.",
      },
      content: { type: "string", description: "the memory itself, written so it stands alone." },
      importance: { type: "number", description: "0-1, defaults to 0.5." },
      confidence: { type: "number", description: "0-1, defaults to 0.7." },
      sourceDocumentId: { type: "string", description: "optional: the document this memory came from." },
    },
    required: ["scope", "content"],
  },
  async handler(rawInput, ctx) {
    const parsed = inputSchema.safeParse(rawInput);
    if (!parsed.success) {
      return { content: `Invalid input: ${parsed.error.message}`, isError: true };
    }
    const { scope, content, sourceDocumentId } = parsed.data;
    const importance = parsed.data.importance ?? 0.5;
    const confidence = parsed.data.confidence ?? 0.7;

    if (scope !== "founder" && !parsed.data.scopeId) {
      return { content: `scopeId is required for scope '${scope}'.`, isError: true };
    }
    const scopeId = scope === "founder" ? null : (parsed.data.scopeId ?? null);

    // Resolve the memory's owning company and confirm it's one this agent
    // can actually see — never let a memory be recorded against a
    // department/project/agent/company outside the caller's own scope.
    if (scopeId) {
      const ownerCompanyId = await resolveMemoryOwnerCompanyId(ctx.supabase, scope, scopeId);
      if (!ownerCompanyId) {
        return { content: `Could not resolve a company for scope '${scope}' id ${scopeId}.`, isError: true };
      }
      if (scope === "group") {
        const { data: groupCompany } = await ctx.supabase
          .from("companies")
          .select("id")
          .is("parent_id", null)
          .eq("id", scopeId)
          .maybeSingle();
        if (!groupCompany) {
          return { content: "scopeId for scope 'group' must be the top-level company.", isError: true };
        }
      } else {
        const scopedCompanyIds = await getScopedCompanyIds(ctx.supabase, ctx.activeCompanyId);
        if (!scopedCompanyIds.includes(ownerCompanyId)) {
          return { content: `That ${scope} isn't in your current scope.`, isError: true };
        }
      }
    }

    const [embedding] = await embedDocuments([content]);

    const { data: memory, error } = await ctx.supabase
      .from("memories")
      .insert({
        scope,
        scope_id: scopeId,
        content,
        embedding: JSON.stringify(embedding),
        source_document_id: sourceDocumentId ?? null,
        importance,
        confidence,
        created_by: ctx.userId,
        source: "agent",
      })
      .select("id")
      .single();
    if (error || !memory) {
      return { content: `Failed to record memory: ${error?.message}`, isError: true };
    }

    await ctx.supabase.from("audit_log").insert({
      actor_type: "agent",
      actor_id: ctx.agentId,
      action: "record_memory",
      target_type: "memory",
      target_id: memory.id,
      company_id: ctx.activeCompanyId,
      metadata: { scope },
    });

    return { content: `Recorded (memory id ${memory.id}, scope ${scope}).` };
  },
};
