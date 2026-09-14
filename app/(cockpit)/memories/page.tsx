"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useCompany } from "@/lib/company-context";
import { Spinner } from "@/components/Spinner";
import { Panel } from "@/components/ui/Panel";

interface Memory {
  id: string;
  scope: string;
  scope_id: string | null;
  content: string;
  importance: number;
  confidence: number;
  source: string;
  created_at: string;
  promoted_from_id: string | null;
}

export default function MemoriesPage() {
  const { activeCompanyId } = useCompany();
  const [memories, setMemories] = useState<Memory[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  // Guards against a slower, now-stale request (e.g. for the company
  // active before a fast switch) resolving after a newer one and
  // clobbering its result — only the most recently requested company's
  // response is ever applied.
  const latestRequestedCompanyId = useRef<string | null>(null);

  const load = useCallback(async () => {
    if (!activeCompanyId) return;
    latestRequestedCompanyId.current = activeCompanyId;
    setLoading(true);
    const res = await fetch(`/api/memories?companyId=${activeCompanyId}`);
    const body = await res.json();
    if (latestRequestedCompanyId.current !== activeCompanyId) return;
    setMemories(body.memories ?? []);
    setLoading(false);
  }, [activeCompanyId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional: load() sets loading state while fetching on mount/company switch
    load();
  }, [load]);

  async function promote(id: string) {
    setBusyId(id);
    setFeedback(null);
    const res = await fetch(`/api/memories/${id}/promote`, { method: "POST" });
    const body = await res.json();
    setFeedback(
      res.ok
        ? body.demo
          ? "Demo mode — promotion not persisted, but the round-trip works."
          : "Promoted to group scope."
        : `Error: ${body.error}`,
    );
    setBusyId(null);
    load();
  }

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-lg font-semibold text-foreground">Memories</h1>
      <p className="text-sm text-muted">
        What agents have retained across conversations — short-lived unless promoted. A company-scope
        memory is only visible to that company; a group-scope one is visible everywhere, including to
        every other company&apos;s agents.
      </p>
      {feedback && <p className="text-sm text-muted">{feedback}</p>}

      {loading ? (
        <Spinner />
      ) : memories.length === 0 ? (
        <p className="text-sm text-muted">Nothing recorded yet.</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {memories.map((m) => (
            <li key={m.id}>
              <Panel glow>
                <div className="mb-2 flex items-center justify-between gap-2">
                  <span
                    className={`rounded px-1.5 py-0.5 text-[10px] uppercase tracking-wide ${
                      m.scope === "group"
                        ? "bg-accent/20 text-accent"
                        : "bg-surface-raised text-muted"
                    }`}
                  >
                    {m.scope}
                    {m.source === "promoted" ? " · promoted" : ""}
                  </span>
                  <span className="text-xs text-muted">{new Date(m.created_at).toLocaleDateString()}</span>
                </div>
                <p className="text-sm text-foreground">{m.content}</p>
                {m.scope === "company" && (
                  <button
                    disabled={busyId === m.id}
                    onClick={() => promote(m.id)}
                    className="transition-cortex mt-3 rounded-md border border-border px-3 py-1.5 text-xs text-muted hover:text-foreground disabled:opacity-50"
                  >
                    Promote to group
                  </button>
                )}
              </Panel>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
