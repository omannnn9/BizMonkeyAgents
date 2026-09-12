/** Simple fixed-size character chunking with overlap — no external deps, good enough for Phase 1 text/markdown docs. */
export function chunkText(text: string, chunkSize = 1000, overlap = 150): string[] {
  const cleaned = text.replace(/\r\n/g, "\n").trim();
  if (cleaned.length === 0) return [];

  const chunks: string[] = [];
  let start = 0;
  while (start < cleaned.length) {
    const end = Math.min(start + chunkSize, cleaned.length);
    chunks.push(cleaned.slice(start, end));
    if (end === cleaned.length) break;
    start = end - overlap;
  }
  return chunks;
}
