"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useCompany } from "@/lib/company-context";
import { officeLayout } from "@/lib/office-layout";
import { deriveAgentRank } from "@/lib/agent-title";
import { LeftNav } from "@/components/office3d/LeftNav";
import { ActivityFeed } from "@/components/office3d/ActivityFeed";
import { TerminalStrip } from "@/components/office3d/TerminalStrip";
import { CommandHUD } from "@/components/office3d/CommandHUD";
import { WorldLayerSwitcher, LAYER_META, type WorldLayer } from "@/components/office3d/WorldLayerSwitcher";
import { GraphLayer } from "@/components/office3d/GraphLayer";
import { HierarchyLayer } from "@/components/office3d/HierarchyLayer";
import { BrainLayer } from "@/components/office3d/BrainLayer";
import { OfficeAgentPanel } from "@/components/OfficeAgentPanel";
import type { MapEdge, MapNode } from "@/app/api/map/route";
import type { GraphNode, GraphEdge } from "@/lib/graph-layout";

// WebGL needs a real browser — never server-rendered.
const OfficeScene3D = dynamic(
  () => import("@/components/office3d/OfficeScene3D").then((m) => m.OfficeScene3D),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-full items-center justify-center text-sm text-muted">Loading scene…</div>
    ),
  },
);

const POLL_MS = 20_000;

interface DashboardData {
  openTasksCount: number;
  pendingApprovalsCount: number;
  recentDecisions: Array<{ id: string; title: string; created_at: string }>;
}

interface RunRow {
  id: string;
  agent_id: string;
  created_at: string;
  status: string;
  model: string;
  input: string | null;
  output: string | null;
}

interface LogRow {
  id: string;
  created_at: string;
  actor_type: string;
  action: string;
  target_type: string | null;
}

const CATEGORY_LINKS = [
  { href: "/documents", label: "Documents" },
  { href: "/memories", label: "Memories" },
  { href: "/approvals", label: "Approvals" },
  { href: "/companies/new", label: "+ New company" },
  { href: "/agents/new", label: "+ New agent" },
];

/**
 * The World: the home view, and now the single home for every spatial/
 * relational visualization the app has — Organization (the colony),
 * Relationships (the former /graph), Hierarchy (the former /hierarchy),
 * and Knowledge (the former /brain) are layers switched via client state,
 * not separate routes. A left nav, a layer-switchable viewport, a
 * right-side feed of what Operators actually said, and a bottom strip of
 * raw activity lines — all fed by the same real routes each former page
 * already used (/api/map, /api/graph, /api/brain, /api/activity,
 * /api/dashboard), reused unchanged. Documents/Memories/Approvals/Chat
 * stay their own routed pages — real forms and lists, not spatial views,
 * so forcing them into "layers" would be a gimmick, not a clarity win.
 */
export default function OfficePage() {
  const { activeCompanyId, activeCompany, setActiveCompanyId } = useCompany();
  const [nodes, setNodes] = useState<MapNode[]>([]);
  const [edges, setEdges] = useState<MapEdge[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);
  const [workingAgentIds, setWorkingAgentIds] = useState<Set<string>>(new Set());
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  const [runs, setRuns] = useState<RunRow[]>([]);
  const [logs, setLogs] = useState<LogRow[]>([]);
  const [commandMode, setCommandMode] = useState(false);

  // Always starts on "organization" — reading the real URL synchronously
  // during the initial render would risk a server/client hydration
  // mismatch for a "use client" page with no searchParams prop threaded
  // through. Synced from ?layer= (set by the retired /graph, /hierarchy,
  // /brain routes' redirects) in the mount effect below instead: a
  // one-frame flash to Organization on a direct deep link, never a
  // hydration error.
  const [activeLayer, setActiveLayer] = useState<WorldLayer>("organization");
  useEffect(() => {
    const p = new URLSearchParams(window.location.search).get("layer");
    if (p === "relationships" || p === "hierarchy" || p === "knowledge") {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional: reads the real URL once, client-only, after the hydration-safe default render
      setActiveLayer(p);
    }
  }, []);

  function selectLayer(layer: WorldLayer) {
    setActiveLayer(layer);
    const params = new URLSearchParams(window.location.search);
    if (layer === "organization") params.delete("layer");
    else params.set("layer", layer);
    const qs = params.toString();
    window.history.replaceState(null, "", qs ? `?${qs}` : window.location.pathname);
  }

  // Relationships is the one layer whose data (/api/graph) nothing else on
  // this page already fetches — lazy on first activation, then cached for
  // the rest of the session so switching back to it later doesn't refetch.
  const [graphNodes, setGraphNodes] = useState<GraphNode[]>([]);
  const [graphEdges, setGraphEdges] = useState<GraphEdge[]>([]);
  const [graphLoading, setGraphLoading] = useState(false);
  const graphFetchedRef = useRef(false);
  useEffect(() => {
    if (activeLayer !== "relationships" || graphFetchedRef.current) return;
    graphFetchedRef.current = true;
    setGraphLoading(true);
    fetch("/api/graph")
      .then((res) => res.json())
      .then((body) => {
        setGraphNodes(body.nodes ?? []);
        setGraphEdges(body.edges ?? []);
      })
      .catch(() => {
        // The Relationships layer just stays empty rather than blocking the shell.
      })
      .finally(() => setGraphLoading(false));
  }, [activeLayer]);

  // Command Mode's HUD lives outside the Canvas (a plain DOM overlay), so
  // it needs its own ticking clock to flip the same "delivered"/"sleeping"
  // windows OfficeScene3D's internal clock already drives for the 3D glows.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const tick = setInterval(() => setNow(Date.now()), 5_000);
    return () => clearInterval(tick);
  }, []);

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
        .catch(() => setErrorMsg("Could not load the office."))
        .finally(() => setLoading(false));
    }
    load();
    const interval = setInterval(load, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    if (!activeCompanyId) return;
    let cancelled = false;
    function load() {
      fetch(`/api/dashboard?companyId=${activeCompanyId}`)
        .then((res) => res.json())
        .then((body) => {
          if (!cancelled) setDashboard(body);
        })
        .catch(() => {
          // The scene itself doesn't depend on this.
        });
      fetch(`/api/activity?companyId=${activeCompanyId}`)
        .then((res) => res.json())
        .then((body) => {
          if (cancelled) return;
          setRuns(body.runs ?? []);
          setLogs(body.logs ?? []);
        })
        .catch(() => {
          // Feed/terminal just stay empty rather than blocking the page.
        });
    }
    load();
    const interval = setInterval(load, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [activeCompanyId]);

  const layout = useMemo(() => officeLayout(nodes, edges), [nodes, edges]);
  const selectedAgent = useMemo(
    () => layout.agents.find((a) => a.agentId === selectedAgentId) ?? null,
    [layout.agents, selectedAgentId],
  );
  const agentInfoById = useMemo(() => {
    const map = new Map<string, { name: string; rank: string }>();
    for (const a of layout.agents) {
      map.set(a.agentId.replace(/^agent:/, ""), {
        name: a.label,
        rank: deriveAgentRank({ scope: a.scope ?? "company", departmentId: a.departmentId, roleTitle: a.roleTitle }),
      });
    }
    return map;
  }, [layout.agents]);

  return (
    <div className="flex h-[calc(100vh-6rem)] flex-col gap-3 p-3 sm:h-[calc(100vh-4rem)]">
      <div className="flex items-baseline justify-between gap-3">
        <div className="flex items-center gap-3">
          <h1 className="text-sm font-semibold text-foreground">Colony</h1>
          {activeLayer === "organization" && (
            <button
              type="button"
              aria-pressed={commandMode}
              onClick={() => setCommandMode((v) => !v)}
              className={`transition-cortex rounded-md border px-2.5 py-1 text-xs ${
                commandMode
                  ? "border-accent bg-accent/15 text-foreground glow-accent"
                  : "border-border bg-surface text-muted hover:bg-surface-raised hover:text-foreground"
              }`}
            >
              Command Mode
            </button>
          )}
        </div>
        <p className="hidden text-xs text-muted sm:block">{LAYER_META[activeLayer].description}</p>
      </div>

      <WorldLayerSwitcher activeLayer={activeLayer} onChange={selectLayer} />

      {loading && <p className="text-sm text-muted">Loading…</p>}
      {errorMsg && <p className="text-sm text-danger">{errorMsg}</p>}

      {!loading && !errorMsg && (
        <>
          <div className="grid flex-1 grid-cols-1 gap-0 overflow-hidden rounded-lg border border-border md:grid-cols-[200px_1fr_260px]">
            <div className="hidden md:block">
              <LeftNav
                companyName={activeCompany?.name ?? "Office"}
                recentItems={(dashboard?.recentDecisions ?? []).map((d) => ({
                  id: d.id,
                  title: d.title,
                  createdAt: d.created_at,
                }))}
              />
            </div>

            <div className="relative min-h-[320px]">
              {activeLayer === "organization" && (
                <>
                  <OfficeScene3D
                    layout={layout}
                    workingAgentIds={workingAgentIds}
                    selectedAgentId={selectedAgentId}
                    activeCompanyId={activeCompanyId || null}
                    commandMode={commandMode}
                    onSelectAgent={setSelectedAgentId}
                    onSelectCompany={setActiveCompanyId}
                  />
                  {commandMode && (
                    <CommandHUD
                      layout={layout}
                      workingAgentIds={workingAgentIds}
                      now={now}
                      recentDecisions={dashboard?.recentDecisions ?? []}
                    />
                  )}
                </>
              )}
              {activeLayer === "relationships" &&
                (graphLoading ? (
                  <p className="p-3 text-sm text-muted">Loading…</p>
                ) : (
                  <GraphLayer nodes={graphNodes} edges={graphEdges} />
                ))}
              {activeLayer === "hierarchy" && <HierarchyLayer nodes={nodes} edges={edges} />}
              {activeLayer === "knowledge" && <BrainLayer />}
            </div>

            <div className="hidden md:block">
              <ActivityFeed runs={runs} agentInfoById={agentInfoById} />
            </div>
          </div>

          <nav aria-label="Categories" className="flex flex-wrap gap-2">
            {CATEGORY_LINKS.map((c) => (
              <Link
                key={c.href}
                href={c.href}
                className="transition-cortex rounded-md border border-border bg-surface px-3 py-1.5 text-xs text-foreground hover:bg-surface-raised hover:glow-accent"
              >
                {c.label}
              </Link>
            ))}
          </nav>

          <div className="h-28 shrink-0 overflow-hidden rounded-lg border border-border">
            <TerminalStrip runs={runs} logs={logs} />
          </div>
        </>
      )}

      {selectedAgent && activeCompanyId && (
        <OfficeAgentPanel
          companyId={selectedAgent.companyId.replace(/^company:/, "")}
          agentId={selectedAgent.agentId.replace(/^agent:/, "")}
          agentLabel={selectedAgent.label}
          agentRank={deriveAgentRank({
            scope: selectedAgent.scope ?? "company",
            departmentId: selectedAgent.departmentId,
            roleTitle: selectedAgent.roleTitle,
          })}
          onClose={() => setSelectedAgentId(null)}
          onSendStart={() => setWorkingAgentIds((prev) => new Set(prev).add(selectedAgent.agentId))}
          onSendEnd={() =>
            setWorkingAgentIds((prev) => {
              const next = new Set(prev);
              next.delete(selectedAgent.agentId);
              return next;
            })
          }
        />
      )}
    </div>
  );
}
