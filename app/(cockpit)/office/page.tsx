"use client";

import { useEffect, useMemo, useState } from "react";
import { useCompany } from "@/lib/company-context";
import { officeLayout } from "@/lib/office-layout";
import { OfficeScene } from "@/components/OfficeScene";
import { OfficeAgentPanel } from "@/components/OfficeAgentPanel";
import { Spinner } from "@/components/Spinner";
import type { MapEdge, MapNode } from "@/app/api/map/route";

const POLL_MS = 20_000;

interface DashboardData {
  openTasksCount: number;
  pendingApprovalsCount: number;
  lastAgentRun: { created_at: string; status: string; model: string } | null;
  recentDecisions: Array<{ id: string; title: string; created_at: string }>;
  latestBriefing: { content: string; created_at: string } | null;
}

/**
 * The new home view: one pixel-art office scene with every company's area
 * and every agent's real state visible at once, replacing the separate
 * Dashboard/Map/3D HQ pages. Data comes from the same /api/map this app
 * already polled for /map (no realtime subscriptions exist anywhere in
 * this app by design — see lib/supabase/server.ts) plus /api/dashboard for
 * the focused-company KPI strip, both reused unchanged.
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
    fetch(`/api/dashboard?companyId=${activeCompanyId}`)
      .then((res) => res.json())
      .then((body) => {
        if (!cancelled) setDashboard(body);
      })
      .catch(() => {
        // The office scene itself doesn't depend on this — leave the KPI
        // strip blank rather than blocking the whole page on it.
      });
    return () => {
      cancelled = true;
    };
  }, [activeCompanyId]);

  const layout = useMemo(() => officeLayout(nodes, edges), [nodes, edges]);
  const selectedAgent = useMemo(
    () => layout.agents.find((a) => a.agentId === selectedAgentId) ?? null,
    [layout.agents, selectedAgentId],
  );

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-lg font-semibold text-foreground">Office</h1>
        <p className="text-sm text-muted">
          Each room is a company; each sprite is an agent. Color rings mean something real: blue while
          this browser has a message in flight to that agent, red on its last run erroring, amber with a
          pending approval, green just after a successful run. Click a room to focus a company, or an
          agent to open its chat, runs, and approvals.
        </p>
      </div>

      {loading && <p className="text-sm text-muted">Loading…</p>}
      {errorMsg && <p className="text-sm text-danger">{errorMsg}</p>}

      {!loading && !errorMsg && (
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
          <div className="overflow-x-auto">
            <OfficeScene
              layout={layout}
              workingAgentIds={workingAgentIds}
              selectedAgentId={selectedAgentId}
              activeCompanyId={activeCompanyId || null}
              onSelectAgent={setSelectedAgentId}
              onSelectCompany={setActiveCompanyId}
            />
          </div>

          <div className="flex w-full flex-col gap-3 lg:w-64 lg:shrink-0">
            <h2 className="text-sm font-medium text-foreground">
              {activeCompany ? activeCompany.name : "Focus"}
            </h2>
            {!dashboard ? (
              <Spinner />
            ) : (
              <>
                <KpiCard label="Open tasks" value={String(dashboard.openTasksCount)} />
                <KpiCard label="Pending approvals" value={String(dashboard.pendingApprovalsCount)} />
                {dashboard.latestBriefing && (
                  <div className="rounded-lg border border-border bg-surface p-3 text-xs">
                    <p className="mb-1 text-muted">Latest briefing</p>
                    <p className="whitespace-pre-wrap text-foreground">{dashboard.latestBriefing.content}</p>
                  </div>
                )}
                {dashboard.recentDecisions.length > 0 && (
                  <div className="rounded-lg border border-border bg-surface p-3 text-xs">
                    <p className="mb-2 text-muted">Recent decisions</p>
                    <ul className="flex flex-col gap-1">
                      {dashboard.recentDecisions.map((d) => (
                        <li key={d.id} className="flex justify-between gap-2 text-foreground">
                          <span>{d.title}</span>
                          <span className="shrink-0 text-muted">
                            {new Date(d.created_at).toLocaleDateString()}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}

      {selectedAgent && activeCompanyId && (
        <OfficeAgentPanel
          companyId={selectedAgent.companyId.replace(/^company:/, "")}
          agentId={selectedAgent.agentId.replace(/^agent:/, "")}
          agentLabel={selectedAgent.label}
          onClose={() => setSelectedAgentId(null)}
          onSendStart={() =>
            setWorkingAgentIds((prev) => new Set(prev).add(selectedAgent.agentId))
          }
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

function KpiCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-surface p-3">
      <p className="text-[10px] uppercase tracking-wide text-muted">{label}</p>
      <p className="mt-0.5 text-lg font-semibold text-foreground">{value}</p>
    </div>
  );
}
