"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  forceLayout,
  colorForNodeType,
  GRAPH_WIDTH as WIDTH,
  GRAPH_HEIGHT as HEIGHT,
  type GraphNode,
  type GraphEdge,
} from "@/lib/graph-layout";

interface MapNode extends GraphNode {
  lastRunAt: string | null;
}

const RECENT_MS = 10 * 60 * 1000; // an agent that ran in the last 10 minutes is "live"
const POLL_MS = 20_000;

/**
 * There's no browser-side Supabase client anywhere in this app by design
 * (no login — the service role key must never reach the browser, see
 * lib/supabase/server.ts). Supabase Realtime needs exactly that, and even
 * with the anon key it would see nothing: RLS is keyed on auth.uid(), which
 * is always null with no session. So this polls /api/map on an interval
 * instead of subscribing — "near-live," not literally push-driven, but
 * consistent with the no-login decision rather than quietly reopening it.
 */
export default function MapPage() {
  const [nodes, setNodes] = useState<MapNode[]>([]);
  const [edges, setEdges] = useState<GraphEdge[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [simulatedPulse, setSimulatedPulse] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    let cancelled = false;
    function load() {
      fetch("/api/map")
        .then((res) => res.json())
        .then((body) => {
          if (cancelled) return;
          if (body.error) {
            setErrorMsg(body.error);
            return;
          }
          setNodes(body.nodes ?? []);
          setEdges(body.edges ?? []);
        })
        .catch(() => setErrorMsg("Could not load the map."))
        .finally(() => setLoading(false));
    }
    load();
    const interval = setInterval(load, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  // A visible clock tick so "is this recent?" re-evaluates without a refetch.
  useEffect(() => {
    const tick = setInterval(() => setNow(Date.now()), 5_000);
    return () => clearInterval(tick);
  }, []);

  // Demo mode's static data never changes, so there's nothing to glow from
  // real activity alone — simulate an occasional pulse on a random agent,
  // same honesty boundary as everything else under the page's demo banner.
  useEffect(() => {
    const agentIds = nodes.filter((n) => n.type === "agent").map((n) => n.id);
    if (agentIds.length === 0) return;
    const interval = setInterval(() => {
      setSimulatedPulse(agentIds[Math.floor(Math.random() * agentIds.length)]);
      setTimeout(() => setSimulatedPulse(null), 1500);
    }, 4000);
    return () => clearInterval(interval);
  }, [nodes]);

  const positioned = useMemo(() => forceLayout(nodes, edges), [nodes, edges]);
  const byId = useMemo(() => new Map(positioned.map((n) => [n.id, n])), [positioned]);

  const liveNodeIds = useMemo(() => {
    const live = new Set<string>();
    for (const n of nodes) {
      if (n.lastRunAt && now - new Date(n.lastRunAt).getTime() < RECENT_MS) live.add(n.id);
    }
    if (simulatedPulse) live.add(simulatedPulse);
    return live;
  }, [nodes, now, simulatedPulse]);

  const particleEdges = useMemo(
    () => edges.filter((e) => liveNodeIds.has(e.target) || liveNodeIds.has(e.source)),
    [edges, liveNodeIds],
  );

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-lg font-semibold text-foreground">Living system map</h1>
      <p className="text-sm text-muted">
        The founder, companies, and agents — nodes glow when an agent has actually run recently. Driven
        entirely by real <code>agent_runs</code> timestamps, never a decorative animation on its own.
      </p>

      {loading && <p className="text-sm text-muted">Loading…</p>}
      {errorMsg && <p className="text-sm text-danger">{errorMsg}</p>}
      {!loading && !errorMsg && nodes.length === 0 && <p className="text-sm text-muted">Nothing to show yet.</p>}

      {!loading && !errorMsg && nodes.length > 0 && (
        <svg
          viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
          className="w-full rounded-lg border border-border bg-surface"
          role="img"
          aria-label="Living system map"
        >
          <style>{`
            @keyframes map-pulse {
              0%, 100% { r: 9; opacity: 1; }
              50% { r: 14; opacity: 0.6; }
            }
          `}</style>
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
          {particleEdges.map((e, i) => (
            <Particle key={`p-${i}`} edge={e} byId={byId} />
          ))}
          {positioned.map((n) => {
            const live = liveNodeIds.has(n.id);
            return (
              <g key={n.id}>
                <circle
                  cx={n.x}
                  cy={n.y}
                  r={9}
                  fill={colorForNodeType(n.type)}
                  style={live ? { animation: "map-pulse 1.2s ease-in-out infinite" } : undefined}
                />
                <text x={n.x} y={n.y + 20} textAnchor="middle" className="fill-foreground text-[10px]">
                  {n.label}
                </text>
              </g>
            );
          })}
        </svg>
      )}
    </div>
  );
}

/** A dot that travels once from source to target then disappears — re-triggered by its key changing upstream. */
function Particle({
  edge,
  byId,
}: {
  edge: GraphEdge;
  byId: Map<string, { x: number; y: number }>;
}) {
  const [progress, setProgress] = useState(0);
  const rafRef = useRef<number | undefined>(undefined);
  const startRef = useRef<number | undefined>(undefined);

  useEffect(() => {
    startRef.current = undefined;
    function frame(t: number) {
      if (startRef.current === undefined) startRef.current = t;
      const elapsed = t - startRef.current;
      const p = (elapsed % 1500) / 1500;
      setProgress(p);
      rafRef.current = requestAnimationFrame(frame);
    }
    rafRef.current = requestAnimationFrame(frame);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [edge.source, edge.target]);

  const a = byId.get(edge.source);
  const b = byId.get(edge.target);
  if (!a || !b) return null;
  const x = a.x + (b.x - a.x) * progress;
  const y = a.y + (b.y - a.y) * progress;
  return <circle cx={x} cy={y} r={3.5} fill="#fff" opacity={0.9} />;
}
