import { z } from "zod";
import type { AgentTool } from "@/lib/agent/types";
import { getScopedCompanyIds } from "@/lib/agent/scoped-companies";

const inputSchema = z.object({
  operation: z.enum(["list", "create", "update"]),
  resource: z.enum(["tasks", "decisions", "projects"]),
  filters: z.record(z.string(), z.unknown()).optional(),
  id: z.string().uuid().optional().describe("Required for update"),
  data: z.record(z.string(), z.unknown()).optional().describe("Required for create/update"),
});

export const queryCompanyDataTool: AgentTool = {
  name: "query_company_data",
  description:
    "Read or write the active company's own structured data: tasks, decisions, and projects. " +
    "Scoped automatically to whichever company is currently active in the cockpit (and its " +
    "sub-companies, if the group level is active) — you cannot use this to see or change another " +
    "company's data. Writes are direct (not approval-gated): tasks/decisions are internal " +
    "record-keeping, not external actions.",
  inputSchema: {
    type: "object",
    properties: {
      operation: { type: "string", enum: ["list", "create", "update"] },
      resource: { type: "string", enum: ["tasks", "decisions", "projects"] },
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
    },
    required: ["operation", "resource"],
  },
  async handler(rawInput, ctx) {
    const parsed = inputSchema.safeParse(rawInput);
    if (!parsed.success) {
      return { content: `Invalid input: ${parsed.error.message}`, isError: true };
    }
    const { operation, resource, filters, id } = parsed.data;
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
      let query = ctx.supabase.from(resource).select("*").in("company_id", scopedCompanyIds);
      for (const [key, value] of Object.entries(filters ?? {})) {
        query = query.eq(key, value as string | number | boolean);
      }
      const { data: rows, error } = await query.limit(25);
      if (error) return { content: `Query failed: ${error.message}`, isError: true };
      return { content: JSON.stringify(rows ?? []) };
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
