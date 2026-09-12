"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useCompany } from "@/lib/company-context";
import { Spinner } from "@/components/Spinner";

interface DocRow {
  id: string;
  title: string;
  mime_type: string | null;
  tags: string[];
  created_at: string;
}

export default function DocumentsPage() {
  const { activeCompanyId, activeCompany } = useCompany();
  const [docs, setDocs] = useState<DocRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  // Guards against a slower, now-stale request (e.g. for the company
  // active before a fast switch) resolving after a newer one and
  // clobbering its result.
  const latestRequestedCompanyId = useRef<string | null>(null);

  const load = useCallback(async () => {
    if (!activeCompanyId) return;
    latestRequestedCompanyId.current = activeCompanyId;
    setLoading(true);
    const res = await fetch(`/api/documents?companyId=${activeCompanyId}`);
    const body = await res.json();
    if (latestRequestedCompanyId.current !== activeCompanyId) return;
    setDocs(body.documents ?? []);
    setLoading(false);
  }, [activeCompanyId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional: load() sets loading state while fetching on mount/company switch
    load();
  }, [load]);

  async function upload() {
    const file = fileInput.current?.files?.[0];
    if (!file || !activeCompanyId) return;
    setUploading(true);
    setMessage(null);

    const formData = new FormData();
    formData.append("file", file);
    formData.append("companyId", activeCompanyId);
    formData.append("title", file.name);

    const res = await fetch("/api/documents/upload", { method: "POST", body: formData });
    const body = await res.json();
    setUploading(false);
    if (!res.ok) {
      setMessage(`Error: ${body.error}`);
      return;
    }
    setMessage(`Uploaded — ${body.chunkCount} chunks indexed${body.tags?.length ? `, tagged: ${body.tags.join(", ")}` : ""}.`);
    if (fileInput.current) fileInput.current.value = "";
    load();
  }

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-lg font-semibold text-foreground">
        Documents {activeCompany ? `— ${activeCompany.name}` : ""}
      </h1>

      <div className="rounded-lg border border-border bg-surface p-4">
        <p className="mb-2 text-sm text-muted">
          Plain text, Markdown, CSV, PDF, and DOCX.
        </p>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <input
            ref={fileInput}
            type="file"
            accept=".txt,.md,.csv,.pdf,.docx"
            className="min-w-0 text-sm text-muted"
          />
          <button
            onClick={upload}
            disabled={uploading}
            className="shrink-0 rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
          >
            {uploading ? "Uploading…" : "Upload"}
          </button>
        </div>
        {message && <p className="mt-2 text-sm text-muted">{message}</p>}
      </div>

      <div className="flex flex-col gap-2">
        {loading ? (
          <Spinner />
        ) : docs.length === 0 ? (
          <p className="text-sm text-muted">No documents uploaded for this company yet.</p>
        ) : (
          docs.map((d) => (
            <div key={d.id} className="flex items-center justify-between rounded-md border border-border px-4 py-2">
              <div>
                <p className="text-sm text-foreground">{d.title}</p>
                {d.tags.length > 0 && (
                  <p className="text-xs text-muted">{d.tags.join(" · ")}</p>
                )}
              </div>
              <span className="text-xs text-muted">{new Date(d.created_at).toLocaleDateString()}</span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
