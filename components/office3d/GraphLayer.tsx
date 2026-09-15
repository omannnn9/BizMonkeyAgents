"use client";

import { useMemo, useState } from "react";
import {
  forceLayout,
  colorForNodeType,
  GRAPH_WIDTH as WIDTH,
  GRAPH_HEIGHT as HEIGHT,
  type GraphNode,
  type GraphEdge,
} from "@/lib/graph-layout";

/**
 * The Relationships layer's body — the former standalone `/graph` page,
 * extracted so the World shell (`office/page.tsx`) can mount it in place
 * without a route change. Purely presentational: `nodes`/`edges` come
 * from the shell's own lazily-fetched `/api/graph` state, cached across
 * layer switches there rather than re-fetched here on every activation.
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
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        className="w-full flex-1 rounded-lg border border-border"
        style={{ background: "radial-gradient(120% 90% at 50% -10%, #0d1530 0%, #05070f 60%)" }}
        role="img"
        aria-label="Knowledge graph"
      >
        <defs>
          <filter id="hologram-glow" x="-60%" y="-60%" width="220%" height="220%">
            <feGaussianBlur stdDeviation="3.2" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          <pattern id="hologram-grid" width="28" height="28" patternUnits="userSpaceOnUse">
            <path d="M28 0H0V28" fill="none" stroke="#1c2b55" strokeWidth="0.5" opacity="0.35" />
          </pattern>
        </defs>

        <rect x={0} y={0} width={WIDTH} height={HEIGHT} fill="url(#hologram-grid)" />

        {edges.map((e, i) => {
          const a = byId.get(e.source);
          const b = byId.get(e.target);
          if (!a || !b) return null;
          const mx = (a.x + b.x) / 2;
          const my = (a.y + b.y) / 2;
          const dx = b.x - a.x;
          const dy = b.y - a.y;
          const len = Math.max(Math.hypot(dx, dy), 1);
          const bow = Math.min(len * 0.12, 24);
          const cx = mx + (-dy / len) * bow;
          const cy = my + (dx / len) * bow;
          return (
            <path
              key={i}
              d={`M ${a.x} ${a.y} Q ${cx} ${cy} ${b.x} ${b.y}`}
              fill="none"
              stroke="#5ad4ff"
              strokeOpacity={0.55}
              strokeWidth={1.3}
              filter="url(#hologram-glow)"
            />
          );
        })}

        {positioned.map((n) => {
          const color = colorForNodeType(n.type);
          const isSelected = selectedId === n.id;
          const w = Math.max(64, n.label.length * 6.5 + 16);
          const h = 26;
          return (
            <g
              key={n.id}
              onClick={() => setSelectedId(n.id)}
              className="cursor-pointer"
              role="button"
              aria-label={n.label}
            >
              <rect
                x={n.x - w / 2}
                y={n.y - h / 2}
                width={w}
                height={h}
                rx={7}
                fill="#0a1226"
                fillOpacity={0.85}
                stroke={color}
                strokeWidth={isSelected ? 2 : 1.2}
                filter="url(#hologram-glow)"
              />
              <circle cx={n.x - w / 2 + 9} cy={n.y} r={2.5} fill={color} filter="url(#hologram-glow)" />
              <text x={n.x + 4} y={n.y + 3.5} textAnchor="middle" fontSize={9} fill="#dbe6ff">
                {n.label}
              </text>
            </g>
          );
        })}
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
  );
}
