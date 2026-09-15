"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useCompany } from "@/lib/company-context";
import { officeLayout } from "@/lib/office-layout";
import { deriveAgentRank } from "@/lib/agent-title";
import { LeftNav } from "@/components/office3d/LeftNav";
import { ActivityFeed } from "@/components/office3d/ActivityFeed";
import { TerminalStrip } from "@/components/office3d/TerminalStrip";
import { OfficeAgentPanel } from "@/components/OfficeAgentPanel";
import type { MapEdge, MapNode } from "@/app/api/map/route";

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
  { href: "/graph", label: "Graph" },
  { href: "/hierarchy", label: "Hierarchy" },
  { href: "/brain", label: "Brain" },
  { href: "/approvals", label: "Approvals" },
  { href: "/companies/new", label: "+ New company" },
  { href: "/agents/new", label: "+ New agent" },
];

/**
 * The Colony: the home view. A left nav, a 3D viewport where every company
 * is a district and every agent an Operator whose state is a pure function
 * of real `agent_runs`/`approvals` rows, a right-side feed of what
 * Operators actually said, and a bottom strip of raw activity lines — all
 * fed by the same /api/map, /api/activity, and /api/dashboard routes the
 * rest of this app already uses, reused unchanged.
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
        <h1 className="text-sm font-semibold text-foreground">Colony</h1>
        <p className="hidden text-xs text-muted sm:block">
          Districts are companies, Operators are your AI teammates. A glow above an Operator&apos;s head
          is always real: blue while executing, amber waiting on approval, red when blocked, green just
          delivered, muted grey when sleeping.
        </p>
      </div>

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

            <div className="min-h-[320px]">
              <OfficeScene3D
                layout={layout}
                workingAgentIds={workingAgentIds}
                selectedAgentId={selectedAgentId}
                activeCompanyId={activeCompanyId || null}
                onSelectAgent={setSelectedAgentId}
                onSelectCompany={setActiveCompanyId}
              />
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
