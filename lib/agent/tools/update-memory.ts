import { z } from "zod";
import type { AgentTool } from "@/lib/agent/types";
import { embedDocuments } from "@/lib/embeddings/voyage";
import { getScopedCompanyIds, resolveMemoryOwnerCompanyId } from "@/lib/agent/scoped-companies";

const inputSchema = z
  .object({
    memoryId: z.string().uuid(),
    confidenceDelta: z
      .number()
      .min(-1)
      .max(1)
      .optional()
      .describe("Added to the memory's current confidence, then clamped to 0-1. Negative to decrease."),
    archive: z.boolean().optional().describe("true archives it (removed from retrieval); false un-archives."),
    content: z.string().min(1).optional().describe("Replaces the memory's content and re-embeds it."),
  })
  .refine((v) => v.confidenceDelta !== undefined || v.archive !== undefined || v.content !== undefined, {
    message: "at least one of confidenceDelta, archive, or content is required",
  });

export const updateMemoryTool: AgentTool = {
  name: "update_memory",
  description:
    "Revise a memory you or another agent already recorded: adjust its confidence up or down as " +
    "evidence accumulates, archive it once it's no longer useful (removed from retrieval, distinct " +
    "from time-based expiry), or edit its content. Not approval-gated.",
  inputSchema: {
    type: "object",
    properties: {
      memoryId: { type: "string", description: "id of the memory to update." },
      confidenceDelta: {
        type: "number",
        description: "added to the current confidence (0-1 after clamping); negative to decrease.",
      },
      archive: { type: "boolean", description: "true archives it, false un-archives it." },
      content: { type: "string", description: "replaces the memory's content and re-embeds it." },
    },
    required: ["memoryId"],
  },
  async handler(rawInput, ctx) {
    const parsed = inputSchema.safeParse(rawInput);
    if (!parsed.success) {
      return { content: `Invalid input: ${parsed.error.message}`, isError: true };
    }
    const { memoryId, confidenceDelta, archive, content } = parsed.data;

    const { data: existing, error: fetchErr } = await ctx.supabase
      .from("memories")
      .select("confidence, scope, scope_id")
      .eq("id", memoryId)
      .single();
    if (fetchErr || !existing) {
      return { content: `Memory not found: ${fetchErr?.message ?? "no such id"}`, isError: true };
    }

    // Same scoping boundary record_memory enforces on write: an agent can
    // only revise a memory whose owning company is one it can actually see.
    // ctx.supabase is the service-role client — this app-level check is the
    // only authorization boundary here, not a backstop on top of RLS.
    const ownerCompanyId = await resolveMemoryOwnerCompanyId(ctx.supabase, existing.scope, existing.scope_id);
    if (ownerCompanyId) {
      const scopedCompanyIds = await getScopedCompanyIds(ctx.supabase, ctx.activeCompanyId);
      if (!scopedCompanyIds.includes(ownerCompanyId)) {
        return { content: "That memory isn't in your current scope.", isError: true };
      }
    }

    const update: Record<string, unknown> = {};
    if (confidenceDelta !== undefined) {
      update.confidence = Math.min(1, Math.max(0, Number(existing.confidence) + confidenceDelta));
    }
    if (archive !== undefined) {
      update.archived_at = archive ? new Date().toISOString() : null;
    }
    if (content !== undefined) {
      const [embedding] = await embedDocuments([content]);
      update.content = content;
      update.embedding = JSON.stringify(embedding);
    }

    const { data: updated, error } = await ctx.supabase
      .from("memories")
      .update(update as never)
      .eq("id", memoryId)
      .select("id, confidence, archived_at")
      .single();
    if (error || !updated) {
      return { content: `Failed to update memory: ${error?.message}`, isError: true };
    }

    await ctx.supabase.from("audit_log").insert({
      actor_type: "agent",
      actor_id: ctx.agentId,
      action: "update_memory",
      target_type: "memory",
      target_id: memoryId,
      company_id: ctx.activeCompanyId,
      metadata: JSON.parse(JSON.stringify({ confidenceDelta, archive, editedContent: content !== undefined })),
    });

    return {
      content: `Updated (confidence ${updated.confidence}${updated.archived_at ? ", archived" : ""}).`,
    };
  },
};
