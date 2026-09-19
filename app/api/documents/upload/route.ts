import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { createClient } from "@/lib/supabase/server";
import { chunkText } from "@/lib/documents/chunk";
import { extractPdfText, extractDocxText } from "@/lib/documents/extract-text";
import { embedDocuments } from "@/lib/embeddings/voyage";
import { autoTagDocument } from "@/lib/documents/auto-tag";
import { getFounderUserId } from "@/lib/agent/founder";
import { withApiErrorHandling } from "@/lib/api-error";

const SUPPORTED_TEXT_TYPES = ["text/plain", "text/markdown", "text/csv"];
const PDF_TYPES = ["application/pdf"];
const DOCX_TYPES = ["application/vnd.openxmlformats-officedocument.wordprocessingml.document"];

/**
 * Everything downstream (chunking, embedding, auto-tagging) only ever sees
 * plain text — chunk.ts/auto-tag.ts needed no changes to support PDF/DOCX,
 * once extraction lands here.
 */
async function extractText(file: File, buffer: ArrayBuffer): Promise<string> {
  const isPdf = PDF_TYPES.includes(file.type) || /\.pdf$/i.test(file.name);
  const isDocx = DOCX_TYPES.includes(file.type) || /\.docx$/i.test(file.name);
  if (isPdf) return extractPdfText(buffer);
  if (isDocx) return extractDocxText(buffer);
  return new TextDecoder("utf-8").decode(buffer);
}

export const POST = withApiErrorHandling(async (request: Request) => {
  const formData = await request.formData();
  const file = formData.get("file") as File | null;
  const companyId = formData.get("companyId") as string | null;
  const title = (formData.get("title") as string | null) || file?.name;

  if (!file || !companyId || !title) {
    return NextResponse.json({ error: "file, companyId, and title are required" }, { status: 400 });
  }

  const supabase = await createClient();
  const uploadedBy = await getFounderUserId(supabase);

  const isSupported =
    SUPPORTED_TEXT_TYPES.includes(file.type) ||
    PDF_TYPES.includes(file.type) ||
    DOCX_TYPES.includes(file.type) ||
    /\.(txt|md|csv|pdf|docx)$/i.test(file.name);
  if (!isSupported) {
    return NextResponse.json(
      {
        error:
          `Unsupported file type "${file.type || "unknown"}". This app parses plain text, ` +
          "markdown, CSV, PDF, and DOCX.",
      },
      { status: 415 },
    );
  }

  const buffer = await file.arrayBuffer();
  let text: string;
  try {
    text = await extractText(file, buffer);
  } catch (err) {
    return NextResponse.json(
      { error: `Could not extract text from "${file.name}": ${err instanceof Error ? err.message : String(err)}` },
      { status: 422 },
    );
  }
  const storagePath = `${companyId}/${randomUUID()}-${file.name}`;

  const { error: uploadErr } = await supabase.storage.from("documents").upload(storagePath, buffer, {
    contentType: file.type || "text/plain",
  });
  if (uploadErr) return NextResponse.json({ error: `Upload failed: ${uploadErr.message}` }, { status: 500 });

  const { data: document, error: docErr } = await supabase
    .from("documents")
    .insert({
      company_id: companyId,
      storage_path: storagePath,
      title,
      mime_type: file.type || "text/plain",
      uploaded_by: uploadedBy,
    })
    .select("id")
    .single();
  if (docErr || !document) {
    return NextResponse.json({ error: `Failed to record document: ${docErr?.message}` }, { status: 500 });
  }

  const chunks = chunkText(text);
  let chunkCount = 0;
  if (chunks.length > 0) {
    const embeddings = await embedDocuments(chunks);
    const rows = chunks.map((content, i) => ({
      document_id: document.id,
      content,
      // pgvector's text input format "[v1,v2,...]" is also valid JSON array syntax.
      embedding: JSON.stringify(embeddings[i]),
      chunk_index: i,
    }));
    const { error: chunksErr } = await supabase.from("document_chunks").insert(rows);
    if (chunksErr) {
      return NextResponse.json(
        { error: `Document uploaded, but chunking/embedding failed: ${chunksErr.message}` },
        { status: 500 },
      );
    }
    chunkCount = rows.length;
  }

  let tags: string[] = [];
  try {
    tags = await autoTagDocument(text, title);
    if (tags.length > 0) {
      await supabase.from("documents").update({ tags }).eq("id", document.id);
    }
  } catch {
    // Auto-tagging is a nice-to-have, not load-bearing — don't fail the upload over it.
  }

  await supabase.from("audit_log").insert({
    actor_type: "user",
    actor_id: uploadedBy,
    action: "upload_document",
    target_type: "document",
    target_id: document.id,
    company_id: companyId,
    metadata: { chunkCount, tags },
  });

  return NextResponse.json({ documentId: document.id, chunkCount, tags });
});
