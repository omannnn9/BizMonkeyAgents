"use client";

import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";
import { Panel } from "@/components/ui/Panel";
import type { BrainDocumentCount, BrainMemory, BrainSynergy } from "@/app/api/brain/route";

// WebGL needs a real browser — never server-rendered, same pattern the
// colony world's viewport already uses.
const BrainScene = dynamic(() => import("@/components/brain/BrainScene").then((m) => m.BrainScene), {
  ssr: false,
  loading: () => <div className="flex h-full items-center justify-center text-sm text-muted">Loading…</div>,
});

const POLL_MS = 20_000;

export default function BrainPage() {
  const [totalMemoryCount, setTotalMemoryCount] = useState(0);
  const [memories, setMemories] = useState<BrainMemory[]>([]);
  const [synergies, setSynergies] = useState<BrainSynergy[]>([]);
  const [documentCounts, setDocumentCounts] = useState<BrainDocumentCount[]>([]);
  const [newlyArrivedIds, setNewlyArrivedIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [promoting, setPromoting] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  // Only a memory id genuinely absent from the *previous* poll counts as
  // "new" — never the very first load, which would otherwise animate every
  // real row in at once and read as decoration rather than a real event.
  const previousIdsRef = useRef<Set<string> | null>(null);

  function load() {
    fetch("/api/brain")
      .then((res) => res.json())
      .then((body) => {
        if (body.error) {
          setErrorMsg(body.error);
          return;
        }
        const nextMemories: BrainMemory[] = body.memories ?? [];
        const nextIds = new Set(nextMemories.map((m) => m.id));
        if (previousIdsRef.current) {
          const arrived = new Set<string>();
          for (const id of nextIds) if (!previousIdsRef.current.has(id)) arrived.add(id);
          setNewlyArrivedIds(arrived);
        }
        previousIdsRef.current = nextIds;
        setTotalMemoryCount(body.totalMemoryCount ?? 0);
        setMemories(nextMemories);
        setSynergies(body.synergies ?? []);
        setDocumentCounts(body.documentCounts ?? []);
      })
      .catch(() => setErrorMsg("Could not load the AI Brain."))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    load();
    const interval = setInterval(load, POLL_MS);
    return () => clearInterval(interval);
  }, []);

  const selected = memories.find((m) => m.id === selectedId) ?? null;

  async function promote(id: string) {
    setPromoting(true);
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
    setPromoting(false);
    load();
  }

  const totalDocuments = documentCounts.reduce((sum, d) => sum + d.count, 0);

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-lg font-semibold text-foreground">AI Brain</h1>
      <p className="text-sm text-muted">
        Every real memory the system has retained, across every company — the core&apos;s size and the
        connections between memories are both real: it grows as your real memory count grows, and a
        glowing line only appears where two memories from different companies actually read as
        similar. Click a memory for details.
      </p>

      {loading && <p className="text-sm text-muted">Loading…</p>}
      {errorMsg && <p className="text-sm text-danger">{errorMsg}</p>}

      {!loading && !errorMsg && (
        <>
          <div className="flex flex-wrap gap-3 text-xs text-muted">
            <span className="rounded-md border border-border bg-surface px-2.5 py-1">
              {totalMemoryCount} {totalMemoryCount === 1 ? "memory" : "memories"} retained
            </span>
            <span className="rounded-md border border-border bg-surface px-2.5 py-1">
              {totalDocuments} {totalDocuments === 1 ? "document" : "documents"} indexed
            </span>
            <span className="rounded-md border border-border bg-surface px-2.5 py-1">
              {synergies.length > 0
                ? `${synergies.length} cross-company ${synergies.length === 1 ? "connection" : "connections"}`
                : "No cross-company connections yet — a real result, not a failure"}
            </span>
          </div>

          <div className="h-[520px] overflow-hidden rounded-lg border border-border">
            <BrainScene
              totalMemoryCount={totalMemoryCount}
              memories={memories}
              synergies={synergies}
              newlyArrivedIds={newlyArrivedIds}
              selectedId={selectedId}
              onSelect={setSelectedId}
            />
          </div>
        </>
      )}

      {selected && (
        <Panel glow data-testid="brain-detail-panel">
          <div className="mb-2 flex items-center justify-between gap-2">
            <span className="rounded px-1.5 py-0.5 text-[10px] uppercase tracking-wide bg-surface-raised text-muted">
              {selected.scopeLabel} · {selected.scope}
            </span>
            <button
              onClick={() => setSelectedId(null)}
              className="text-xs text-muted hover:text-foreground"
              aria-label="Close"
            >
              Close
            </button>
          </div>
          <p className="mb-3 text-sm text-foreground">{selected.content}</p>
          <p className="mb-3 text-xs text-muted">
            Importance {selected.importance.toFixed(2)} · Confidence {selected.confidence.toFixed(2)} · Source{" "}
            {selected.source}
          </p>
          {selected.scope === "company" && (
            <button
              disabled={promoting}
              onClick={() => promote(selected.id)}
              className="transition-cortex rounded-md border border-border px-3 py-1.5 text-xs text-muted hover:text-foreground hover:glow-accent disabled:opacity-50"
            >
              Promote to group
            </button>
          )}
          {feedback && <p className="mt-2 text-xs text-muted">{feedback}</p>}
        </Panel>
      )}
    </div>
  );
}
