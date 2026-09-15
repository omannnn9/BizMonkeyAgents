"use client";

import dynamic from "next/dynamic";
import { useMemo, useState } from "react";
import { forceLayout, type GraphNode, type GraphEdge } from "@/lib/graph-layout";

// WebGL needs a real browser — never server-rendered, same pattern every
// other 3D layer in this app already uses.
const GraphScene = dynamic(() => import("@/components/office3d/GraphScene").then((m) => m.GraphScene), {
  ssr: false,
  loading: () => <div className="flex h-full items-center justify-center text-sm text-muted">Loading…</div>,
});

/**
 * The Relationships layer's body — the former standalone `/graph` page,
 * extracted so the World shell (`office/page.tsx`) can mount it in place
 * without a route change. Purely presentational: `nodes`/`edges` come
 * from the shell's own lazily-fetched `/api/graph` state, cached across
 * layer switches there rather than re-fetched here on every activation.
 * The detail panel keeps its own `forceLayout()` call for the connection
 * lookups below — a little duplication with `GraphScene`'s own layout
 * pass rather than threading positions back out of the 3D scene, the
 * same "small duplication over premature coupling" call this project
 * already made between the Relationships and Hierarchy layers' glow
 * systems.
 */
export function GraphLayer({ nodes, edges }: { nodes: GraphNode[]; edges: GraphEdge[] }) {
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const positioned = useMemo(() => forceLayout(nodes, edges), [nodes, edges]);
  const byId = useMemo(() => new Map(positioned.map((n) => [n.id, n])), [positioned]);
  const selected = selectedId ? byId.get(selectedId) : undefined;
  const connectedEdges = selectedId
    ? edges.filter((e) => e.source === selectedId || e.target === selectedId)
    : [];

  if (nodes.length === 0) return <p className="text-sm text-muted">No relationships recorded yet.</p>;

  return (
    <div className="flex h-full flex-col gap-4 lg:flex-row">
      <div data-testid="graph-scene" className="w-full flex-1 overflow-hidden rounded-lg border border-border">
        <GraphScene nodes={nodes} edges={edges} selectedId={selectedId} onSelect={setSelectedId} />
      </div>

      <div
        data-testid="graph-detail-panel"
        className="w-full shrink-0 rounded-lg border border-border bg-surface p-4 text-sm lg:w-64"
      >
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
          <p className="text-muted">Click a node to see its details.</p>
        )}
      </div>
    </div>
  );
}
