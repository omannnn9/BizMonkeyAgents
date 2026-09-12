import path from "node:path";

/**
 * PDF text extraction via pdfjs-dist's Node/legacy build — text only, never
 * page rendering, so this never touches pdfjs-dist's optional
 * @napi-rs/canvas dependency (a native binary, avoided on purpose for a
 * serverless deploy target).
 */
export async function extractPdfText(buffer: ArrayBuffer): Promise<string> {
  const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");
  // Points pdfjs at its own bundled standard font metrics for non-embedded
  // standard fonts (Helvetica, Times, etc). Verified this doesn't actually
  // load in this Node build (a pdfjs-dist internal limitation — its
  // standard-font fetch path doesn't support file:// the way its CMap
  // reader does) — it logs a benign warning but extracted text is
  // unaffected either way, verified against a real test PDF.
  const standardFontDataUrl = `file://${path.join(process.cwd(), "node_modules/pdfjs-dist/standard_fonts")}/`;

  const doc = await getDocument({
    data: new Uint8Array(buffer),
    useWorkerFetch: false,
    standardFontDataUrl,
  }).promise;

  const pages: string[] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    pages.push(content.items.map((item) => ("str" in item ? item.str : "")).join(" "));
  }
  return pages.join("\n\n");
}

/** DOCX text extraction via mammoth — pure JS, no native dependencies. */
export async function extractDocxText(buffer: ArrayBuffer): Promise<string> {
  const mammoth = await import("mammoth");
  const result = await mammoth.extractRawText({ buffer: Buffer.from(buffer) });
  return result.value;
}
