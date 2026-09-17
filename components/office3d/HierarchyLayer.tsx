"use client";

import { useEffect, useMemo, useState } from "react";
import { useCompany } from "@/lib/company-context";
import { colorForNodeType } from "@/lib/graph-layout";
import { hierarchyLayout, NODE_W, NODE_H, type PositionedHierarchyNode } from "@/lib/hierarchy-layout";
import { OfficeAgentPanel } from "@/components/OfficeAgentPanel";
import type { MapEdge, MapNode } from "@/app/api/map/route";

const FOUNDER_COLOR = "#ffd166";

/**
 * The Hierarchy layer's body — the former standalone `/hierarchy` page,
 * extracted so the World shell can mount it without a route change.
 * Takes the same `nodes`/`edges` the Organization layer's colony already
 * fetches from `/api/map` — no separate fetch, since it's the exact same
 * org-wide data read a second way (a tree instead of a radial layout).
 */
export function HierarchyLayer({ nodes, edges }: { nodes: MapNode[]; edges: MapEdge[] }) {
  const { setActiveCompanyId } = useCompany();
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);

  const { nodes: positioned, edges: treeEdges } = useMemo(() => hierarchyLayout(nodes, edges), [nodes, edges]);
  const byId = useMemo(() => new Map(positioned.map((n) => [n.id, n])), [positioned]);
  const selectedAgent = positioned.find((n) => n.type === "agent" && n.agentId === selectedAgentId);

  useEffect(() => {
    if (positioned.length === 0) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional: resets the stagger so re-activating this layer replays the fade-in instead of staying stuck mid-animation
    setMounted(false);
    const t = setTimeout(() => setMounted(true), 30);
    return () => clearTimeout(t);
  }, [positioned.length]);

  const minX = positioned.length ? Math.min(...positioned.map((n) => n.x)) - NODE_W / 2 - 20 : 0;
  const maxX = positioned.length ? Math.max(...positioned.map((n) => n.x)) + NODE_W / 2 + 20 : 400;
  const minY = -(NODE_H / 2) - 20;
  const maxY = positioned.length ? Math.max(...positioned.map((n) => n.y)) + NODE_H : 300;
  const width = maxX - minX;
  const height = maxY - minY;

  if (positioned.length === 0) return null;

  return (
    <>
      <svg
        viewBox={`${minX} ${minY} ${width} ${height}`}
        className="h-full w-full rounded-lg border border-border"
        style={{ background: "radial-gradient(120% 90% at 50% -10%, #0d1530 0%, #05070f 60%)" }}
        role="img"
        aria-label="Hierarchy map"
      >
        <defs>
          <filter id="hierarchy-glow" x="-60%" y="-60%" width="220%" height="220%">
            <feGaussianBlur stdDeviation="3.2" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          <pattern id="hierarchy-grid" width="28" height="28" patternUnits="userSpaceOnUse">
            <path d="M28 0H0V28" fill="none" stroke="#1c2b55" strokeWidth="0.5" opacity="0.35" />
          </pattern>
        </defs>

        <rect x={minX} y={minY} width={width} height={height} fill="url(#hierarchy-grid)" />

        {treeEdges.map((e, i) => {
          const parent = byId.get(e.parent);
          const child = byId.get(e.child);
          if (!parent || !child) return null;
          const py = parent.y + NODE_H / 2;
          const cy = child.y - NODE_H / 2;
          const my = (py + cy) / 2;
          return (
            <path
              key={i}
              d={`M ${parent.x} ${py} C ${parent.x} ${my}, ${child.x} ${my}, ${child.x} ${cy}`}
              fill="none"
              stroke="#5ad4ff"
              strokeOpacity={0.5}
              strokeWidth={1.3}
              filter="url(#hierarchy-glow)"
              style={{
                opacity: mounted ? 1 : 0,
                transition: `opacity 400ms ease-out ${child.depth * 90}ms`,
              }}
            />
          );
        })}

        {positioned.map((n) => (
          <HierarchyNodeShape
            key={n.id}
            node={n}
            mounted={mounted}
            onSelect={() => {
              if (n.type === "company" && n.id !== "founder") {
                setActiveCompanyId(n.id.replace(/^company:/, ""));
              } else if (n.type === "agent" && n.agentId) {
                setSelectedAgentId(n.agentId);
              }
            }}
          />
        ))}
      </svg>

      {selectedAgent && selectedAgent.companyId && selectedAgent.agentId && (
        <OfficeAgentPanel
          companyId={selectedAgent.companyId}
          agentId={selectedAgent.agentId}
          agentLabel={selectedAgent.label}
          agentRank={selectedAgent.rank}
          openTaskCount={selectedAgent.openTaskCount}
          blockedTaskCount={selectedAgent.blockedTaskCount}
          onClose={() => setSelectedAgentId(null)}
        />
      )}
    </>
  );
}

function HierarchyNodeShape({
  node,
  mounted,
  onSelect,
}: {
  node: PositionedHierarchyNode;
  mounted: boolean;
  onSelect: () => void;
}) {
  const color = node.type === "founder" ? FOUNDER_COLOR : colorForNodeType(node.type);
  const x = node.x - NODE_W / 2;
  const y = node.y - NODE_H / 2;
  const clickable = node.type !== "founder";

  return (
    <g
      onClick={clickable ? onSelect : undefined}
      className={clickable ? "cursor-pointer" : undefined}
      role={clickable ? "button" : undefined}
      aria-label={node.type === "agent" ? `${node.label} — ${node.rank}` : node.label}
      style={{
        opacity: mounted ? 1 : 0,
        transition: `opacity 400ms ease-out ${node.depth * 90}ms`,
      }}
    >
      <rect
        x={x}
        y={y}
        width={NODE_W}
        height={NODE_H}
        rx={8}
        fill="#0a1226"
        fillOpacity={0.88}
        stroke={color}
        strokeWidth={node.type === "founder" ? 2 : 1.2}
        filter="url(#hierarchy-glow)"
      />
      <circle cx={x + 12} cy={node.y} r={3} fill={color} filter="url(#hierarchy-glow)" />
      {/* Real workload badge — from tasks.assigned_agent_id via assign_task,
          the same count OfficeAgentPanel's "Workload" section shows.
          Blocked work gets its own red badge since it's the actionable
          signal; a plain open-task count alone isn't. */}
      {!!node.openTaskCount && (
        <g>
          <circle cx={x + NODE_W - 14} cy={y + 10} r={8} fill="#0a1226" stroke={color} strokeWidth={1} />
          <text x={x + NODE_W - 14} y={y + 13} fontSize={9} fill="#dbe6ff" textAnchor="middle">
            {node.openTaskCount}
          </text>
        </g>
      )}
      {!!node.blockedTaskCount && (
        <circle cx={x + NODE_W - 4} cy={y + 2} r={4} fill="#ff5a6e" />
      )}
      {node.rank ? (
        <>
          <text x={x + 22} y={node.y - 4} fontSize={10.5} fill="#dbe6ff">
            {node.label}
          </text>
          <text x={x + 22} y={node.y + 11} fontSize={8.5} fill="#8a9bc2">
            {node.rank}
          </text>
        </>
      ) : (
        <text x={x + 22} y={node.y + 4} fontSize={11} fontWeight={node.type === "founder" ? 600 : 400} fill="#dbe6ff">
          {node.label}
        </text>
      )}
    </g>
  );
}
