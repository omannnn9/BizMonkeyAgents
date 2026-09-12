import { z } from "zod";
import type { AgentTool } from "@/lib/agent/types";
import { getScopedCompanyIds } from "@/lib/agent/scoped-companies";
import { embedQuery } from "@/lib/embeddings/voyage";

const inputSchema = z.object({
  query: z.string().min(1),
  limit: z.number().int().min(1).max(20).optional(),
});

export const searchDocumentsTool: AgentTool = {
  name: "search_documents",
  description:
    "Semantic search over documents uploaded for the active company (and its sub-companies, if " +
    "the group level is active). Returns matching passages with a citation (document title and " +
    "chunk position) for each — always cite the source when you use a result in your answer.",
  inputSchema: {
    type: "object",
    properties: {
      query: { type: "string", description: "What to search for, in natural language." },
      limit: { type: "number", description: "Max passages to return (default 6, max 20)." },
    },
    required: ["query"],
  },
  async handler(rawInput, ctx) {
    const parsed = inputSchema.safeParse(rawInput);
    if (!parsed.success) {
      return { content: `Invalid input: ${parsed.error.message}`, isError: true };
    }

    const scopedCompanyIds = await getScopedCompanyIds(ctx.supabase, ctx.activeCompanyId);
    const embedding = await embedQuery(parsed.data.query);

    const { data: matches, error } = await ctx.supabase.rpc("match_document_chunks", {
      p_query_embedding: embedding as unknown as string,
      p_company_ids: scopedCompanyIds,
      p_limit: parsed.data.limit ?? 6,
    });
    if (error) return { content: `Search failed: ${error.message}`, isError: true };
    if (!matches || matches.length === 0) {
      return { content: "No matching passages found in the documents uploaded for this company." };
    }

    const documentIds = [...new Set(matches.map((m) => m.document_id))];
    const { data: docs } = await ctx.supabase
      .from("documents")
      .select("id, title")
      .in("id", documentIds);
    const titleById = new Map((docs ?? []).map((d) => [d.id, d.title]));

    const citedPassages = matches.map((m) => ({
      document_title: titleById.get(m.document_id) ?? "Unknown document",
      document_id: m.document_id,
      chunk_index: m.chunk_index,
      similarity: Math.round(m.similarity * 1000) / 1000,
      excerpt: m.content,
    }));

    return { content: JSON.stringify(citedPassages) };
  },
};
