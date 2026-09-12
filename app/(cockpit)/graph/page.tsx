"use client";

import { useEffect, useMemo, useState } from "react";

interface GraphNode {
  id: string;
  type: string;
  label: string;
}
interface GraphEdge {
  source: string;
  target: string;
  relation: string;
}
interface PositionedNode extends GraphNode {
  x: number;
  y: number;
}

const WIDTH = 800;
const HEIGHT = 480;

/**
 * A small hand-rolled force-directed layout (repulsion + spring + center
 * pull, run for a fixed number of iterations) — deliberately not a new
 * dependency (d3-force, React Flow): the graphs here are a few dozen nodes
 * at most, and this is a few dozen lines.
 */
function layout(nodes: GraphNode[], edges: GraphEdge[]): PositionedNode[] {
  const positioned: PositionedNode[] = nodes.map((n, i) => {
    const angle = (i / Math.max(nodes.length, 1)) * Math.PI * 2;
    return { ...n, x: WIDTH / 2 + Math.cos(angle) * 150, y: HEIGHT / 2 + Math.sin(angle) * 150 };
  });
  const byId = new Map(positioned.map((n) => [n.id, n]));

  const REPULSION = 6000;
  const SPRING = 0.02;
  const SPRING_LENGTH = 140;
  const CENTER_PULL = 0.01;

  for (let iter = 0; iter < 300; iter++) {
    const forces = new Map<string, { fx: number; fy: number }>();
    for (const n of positioned) forces.set(n.id, { fx: 0, fy: 0 });

    for (let i = 0; i < positioned.length; i++) {
      for (let j = i + 1; j < positioned.length; j++) {
        const a = positioned[i];
        const b = positioned[j];
        const dx = a.x - b.x;
        const dy = a.y - b.y;
        const distSq = Math.max(dx * dx + dy * dy, 1);
        const dist = Math.sqrt(distSq);
        const force = REPULSION / distSq;
        const fx = (dx / dist) * force;
        const fy = (dy / dist) * force;
        forces.get(a.id)!.fx += fx;
        forces.get(a.id)!.fy += fy;
        forces.get(b.id)!.fx -= fx;
        forces.get(b.id)!.fy -= fy;
      }
    }

    for (const e of edges) {
      const a = byId.get(e.source);
      const b = byId.get(e.target);
      if (!a || !b) continue;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const dist = Math.max(Math.sqrt(dx * dx + dy * dy), 1);
      const displacement = dist - SPRING_LENGTH;
      const fx = (dx / dist) * displacement * SPRING;
      const fy = (dy / dist) * displacement * SPRING;
      forces.get(a.id)!.fx += fx;
      forces.get(a.id)!.fy += fy;
      forces.get(b.id)!.fx -= fx;
      forces.get(b.id)!.fy -= fy;
    }

    for (const n of positioned) {
      const f = forces.get(n.id)!;
      f.fx += (WIDTH / 2 - n.x) * CENTER_PULL;
      f.fy += (HEIGHT / 2 - n.y) * CENTER_PULL;
      n.x = Math.min(Math.max(n.x + f.fx, 30), WIDTH - 30);
      n.y = Math.min(Math.max(n.y + f.fy, 30), HEIGHT - 30);
    }
  }

  return positioned;
}

function colorForType(type: string): string {
  switch (type) {
    case "company":
      return "#7c9cff";
    case "agent":
      return "#8fd3a0";
    case "document":
      return "#e0b35c";
    case "decision":
      return "#d98cd8";
    default:
      return "#9aa4b2";
  }
}

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

  const positioned = useMemo(() => layout(nodes, edges), [nodes, edges]);
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
                  fill={colorForType(n.type)}
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
