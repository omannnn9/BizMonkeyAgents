import { VoyageAIClient } from "voyageai";

const EMBEDDING_MODEL = "voyage-3.5";
export const EMBEDDING_DIMENSIONS = 1024;

let client: VoyageAIClient | null = null;
function getClient(): VoyageAIClient {
  if (!client) {
    client = new VoyageAIClient({ apiKey: process.env.VOYAGE_API_KEY! });
  }
  return client;
}

/** Embeds a single query string (search/retrieval-time use). */
export async function embedQuery(text: string): Promise<number[]> {
  const res = await getClient().embed({
    input: text,
    model: EMBEDDING_MODEL,
    inputType: "query",
    outputDimension: EMBEDDING_DIMENSIONS,
  });
  const embedding = res.data?.[0]?.embedding;
  if (!embedding) throw new Error("Voyage embed returned no vector");
  return embedding;
}

/** Embeds one or more documents/chunks (index-time use). */
export async function embedDocuments(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return [];
  const res = await getClient().embed({
    input: texts,
    model: EMBEDDING_MODEL,
    inputType: "document",
    outputDimension: EMBEDDING_DIMENSIONS,
  });
  const vectors = res.data?.map((d) => d.embedding).filter((e): e is number[] => !!e);
  if (!vectors || vectors.length !== texts.length) {
    throw new Error("Voyage embed returned fewer vectors than inputs");
  }
  return vectors;
}
