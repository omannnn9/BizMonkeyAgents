"use client";

import { useEffect, useMemo, useState } from "react";
import {
  forceLayout,
  colorForNodeType,
  GRAPH_WIDTH as WIDTH,
  GRAPH_HEIGHT as HEIGHT,
  type GraphNode,
  type GraphEdge,
} from "@/lib/graph-layout";

export default function GraphPage() {
  const [nodes, setNodes] = useState<GraphNode[]>([]);
  const [edges, setEdges] = useState<GraphEdge[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/graph")
      .then((res) => res.json())
      .then((body) => {
        if (body.error) {
          setErrorMsg(body.error);
          return;
        }
        setNodes(body.nodes ?? []);
        setEdges(body.edges ?? []);
      })
      .catch(() => setErrorMsg("Could not load the graph."))
      .finally(() => setLoading(false));
  }, []);

  const positioned = useMemo(() => forceLayout(nodes, edges), [nodes, edges]);
  const byId = useMemo(() => new Map(positioned.map((n) => [n.id, n])), [positioned]);
  const selected = selectedId ? byId.get(selectedId) : undefined;
  const connectedEdges = selectedId
    ? edges.filter((e) => e.source === selectedId || e.target === selectedId)
    : [];

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-lg font-semibold text-foreground">Knowledge graph</h1>
      <p className="text-sm text-muted">
        Every real relationship the system knows about — company ownership, which agent belongs to
        which company, and (as they accumulate) documents, decisions, and tasks. Click a node for
        details.
      </p>

      {loading && <p className="text-sm text-muted">Loading…</p>}
      {errorMsg && <p className="text-sm text-danger">{errorMsg}</p>}
      {!loading && !errorMsg && nodes.length === 0 && (
        <p className="text-sm text-muted">No relationships recorded yet.</p>
      )}

      {!loading && !errorMsg && nodes.length > 0 && (
        <div className="flex flex-col gap-4 lg:flex-row">
          <svg
            viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
            className="w-full flex-1 rounded-lg border border-border bg-surface"
            role="img"
            aria-label="Knowledge graph"
          >
            {edges.map((e, i) => {
              const a = byId.get(e.source);
              const b = byId.get(e.target);
              if (!a || !b) return null;
              return (
                <line
                  key={i}
                  x1={a.x}
                  y1={a.y}
                  x2={b.x}
                  y2={b.y}
                  stroke="currentColor"
                  className="text-border"
                  strokeWidth={1.5}
                />
              );
            })}
            {positioned.map((n) => (
              <g
                key={n.id}
                onClick={() => setSelectedId(n.id)}
                className="cursor-pointer"
                role="button"
                aria-label={n.label}
              >
                <circle
                  cx={n.x}
                  cy={n.y}
                  r={selectedId === n.id ? 12 : 9}
                  fill={colorForNodeType(n.type)}
                  stroke={selectedId === n.id ? "#fff" : "none"}
                  strokeWidth={2}
                />
                <text x={n.x} y={n.y + 20} textAnchor="middle" className="fill-foreground text-[10px]">
                  {n.label}
                </text>
              </g>
            ))}
          </svg>

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
      )}
    </div>
  );
}
