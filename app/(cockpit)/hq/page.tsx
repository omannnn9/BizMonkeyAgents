"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useState } from "react";
import type { HQNode } from "@/components/HQScene";
import type { GraphEdge } from "@/lib/graph-layout";

// Three.js/WebGL needs a real browser — never server-rendered.
const HQScene = dynamic(() => import("@/components/HQScene").then((m) => m.HQScene), {
  ssr: false,
  loading: () => (
    <div className="flex h-[520px] items-center justify-center text-sm text-muted">
      Loading 3D scene…
    </div>
  ),
});

export default function HQPage() {
  const [nodes, setNodes] = useState<HQNode[]>([]);
  const [edges, setEdges] = useState<GraphEdge[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/map")
      .then((res) => res.json())
      .then((body) => {
        if (body.error) {
          setErrorMsg(body.error);
          return;
        }
        setNodes(body.nodes ?? []);
        setEdges(body.edges ?? []);
      })
      .catch(() => setErrorMsg("Could not load the scene."))
      .finally(() => setLoading(false));
  }, []);

  const selected = useMemo(() => nodes.find((n) => n.id === selectedId), [nodes, selectedId]);
  const connectedEdges = useMemo(
    () => (selectedId ? edges.filter((e) => e.source === selectedId || e.target === selectedId) : []),
    [edges, selectedId],
  );
  const byId = useMemo(() => new Map(nodes.map((n) => [n.id, n])), [nodes]);

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-lg font-semibold text-foreground">3D headquarters (preview)</h1>
      <p className="text-sm text-muted">
        A scoped-down preview, built ahead of the architecture doc&apos;s own advice to wait until
        Phases 1-3 are in daily use — by explicit choice, not because that condition was met. No
        character animation or pathing (the doc&apos;s own flagged risk, normally a dedicated-artist
        job): companies are simple platforms, agents are markers that glow on real recent activity,
        and the founder is a single marker, not a figure. Drag to orbit, scroll to zoom.
      </p>

      {loading && <p className="text-sm text-muted">Loading…</p>}
      {errorMsg && <p className="text-sm text-danger">{errorMsg}</p>}

      {!loading && !errorMsg && (
        <div className="flex flex-col gap-4 lg:flex-row">
          <div className="h-[520px] w-full flex-1 overflow-hidden rounded-lg border border-border">
            <HQScene nodes={nodes} edges={edges} selectedId={selectedId} onSelect={setSelectedId} />
          </div>

          <div className="w-full shrink-0 rounded-lg border border-border bg-surface p-4 text-sm lg:w-64">
            {selected ? (
              <>
                <p className="text-[10px] uppercase tracking-wide text-muted">{selected.type}</p>
                <p className="mb-3 font-medium text-foreground">{selected.label}</p>
                <p className="mb-1 text-[10px] uppercase tracking-wide text-muted">Connections</p>
                <ul className="flex flex-col gap-1">
                  {connectedEdges.map((e, i) => {
                    const otherId = e.source === selectedId ? e.target : e.source;
                    const other = byId.get(otherId);
                    const arrow = e.source === selectedId ? `— ${e.relation} →` : `← ${e.relation} —`;
                    return (
                      <li key={i} className="text-xs text-muted">
                        {arrow} <span className="text-foreground">{other?.label ?? otherId}</span>
                      </li>
                    );
                  })}
                  {connectedEdges.length === 0 && <li className="text-xs text-muted">No connections.</li>}
                </ul>
              </>
            ) : (
              <p className="text-muted">Click a pedestal or marker to see its details.</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
