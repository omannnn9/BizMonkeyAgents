import { z } from "zod";
import type { AgentTool } from "@/lib/agent/types";
import { getScopedCompanyIds } from "@/lib/agent/scoped-companies";

const inputSchema = z.object({
  operation: z.enum(["list", "create", "update"]),
  resource: z.enum(["tasks", "decisions", "projects", "goals"]),
  filters: z.record(z.string(), z.unknown()).optional(),
  id: z.string().uuid().optional().describe("Required for update"),
  data: z.record(z.string(), z.unknown()).optional().describe("Required for create/update"),
  limit: z.number().int().min(1).max(100).optional().describe("For 'list': page size, default 25, max 100."),
  offset: z.number().int().min(0).optional().describe("For 'list': rows to skip, for paging past the first page."),
});

export const queryCompanyDataTool: AgentTool = {
  name: "query_company_data",
  description:
    "Read or write the active company's own structured data: tasks, decisions, projects, and goals. " +
    "Scoped automatically to whichever company is currently active in the cockpit (and its " +
    "sub-companies, if the group level is active) — you cannot use this to see or change another " +
    "company's data. Writes are direct (not approval-gated): tasks/decisions are internal " +
    "record-keeping, not external actions. 'list' is paginated (default 25 rows, newest first) — " +
    "its result includes hasMore/total; pass a larger offset to page past the first batch rather " +
    "than assuming 25 rows is everything.",
  inputSchema: {
    type: "object",
    properties: {
      operation: { type: "string", enum: ["list", "create", "update"] },
      resource: { type: "string", enum: ["tasks", "decisions", "projects", "goals"] },
      filters: {
        type: "object",
        description: "For 'list': e.g. { status: 'open' }. Simple equality filters only.",
      },
      id: { type: "string", description: "Required for 'update': the row's id." },
      data: {
        type: "object",
        description:
          "Required for 'create'/'update': column values, e.g. { title: '...', status: 'open' }.",
      },
      limit: { type: "number", description: "For 'list': page size, default 25, max 100." },
      offset: { type: "number", description: "For 'list': rows to skip, for paging past the first page." },
    },
    required: ["operation", "resource"],
  },
  async handler(rawInput, ctx) {
    const parsed = inputSchema.safeParse(rawInput);
    if (!parsed.success) {
      return { content: `Invalid input: ${parsed.error.message}`, isError: true };
    }
    const { operation, resource, filters, id } = parsed.data;
    const limit = parsed.data.limit ?? 25;
    const offset = parsed.data.offset ?? 0;
    const scopedCompanyIds = await getScopedCompanyIds(ctx.supabase, ctx.activeCompanyId);

    // Never let model-supplied data move a row between companies (or touch
    // its id) — company_id is always the active company, full stop,
    // regardless of what the model passes in 'data'.
    const data = parsed.data.data ? { ...parsed.data.data } : undefined;
    if (data) {
      delete data.company_id;
      delete data.id;
    }

    if (operation === "list") {
      let query = ctx.supabase
        .from(resource)
        .select("*", { count: "exact" })
        .in("company_id", scopedCompanyIds);
      for (const [key, value] of Object.entries(filters ?? {})) {
        query = query.eq(key, value as string | number | boolean);
      }
      // Deterministic order (newest first) is what makes offset-based
      // paging actually mean something — without it, which rows land on
      // page 2 is arbitrary and can shift between calls.
      const { data: rows, count, error } = await query
        .order("created_at", { ascending: false })
        .range(offset, offset + limit - 1);
      if (error) return { content: `Query failed: ${error.message}`, isError: true };
      const total = count ?? rows?.length ?? 0;
      const hasMore = offset + (rows?.length ?? 0) < total;
      return {
        content: JSON.stringify({ rows: rows ?? [], total, offset, limit, hasMore }),
      };
    }

    if (operation === "create") {
      if (!data) return { content: "create requires 'data'", isError: true };
      const { data: row, error } = await ctx.supabase
        .from(resource)
        // company_id is always forced to the active company, never taken
        // from model-supplied data, so a write can't be redirected elsewhere.
        .insert({ ...data, company_id: ctx.activeCompanyId } as never)
        .select()
        .single();
      if (error) return { content: `Create failed: ${error.message}`, isError: true };
      await ctx.supabase.from("audit_log").insert({
        actor_type: "agent",
        actor_id: ctx.agentId,
        action: `create:${resource}`,
        target_type: resource,
        target_id: (row as { id: string }).id,
        company_id: ctx.activeCompanyId,
        metadata: JSON.parse(JSON.stringify({ data })),
      });
      return { content: JSON.stringify(row) };
    }

    // update
    if (!id || !data) return { content: "update requires 'id' and 'data'", isError: true };
    const { data: row, error } = await ctx.supabase
      .from(resource)
      .update(data as never)
      .eq("id", id)
      .in("company_id", scopedCompanyIds)
      .select()
      .single();
    if (error) return { content: `Update failed: ${error.message}`, isError: true };
    await ctx.supabase.from("audit_log").insert({
      actor_type: "agent",
      actor_id: ctx.agentId,
      action: `update:${resource}`,
      target_type: resource,
      target_id: id,
      company_id: ctx.activeCompanyId,
      metadata: JSON.parse(JSON.stringify({ data })),
    });
    return { content: JSON.stringify(row) };
  },
};
