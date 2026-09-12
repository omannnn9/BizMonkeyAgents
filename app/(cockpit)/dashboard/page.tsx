"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { getScopedCompanyIds } from "@/lib/agent/scoped-companies";
import { useCompany } from "@/lib/company-context";
import { Spinner } from "@/components/Spinner";

interface DashboardData {
  openTasksCount: number;
  pendingApprovalsCount: number;
  lastAgentRun: { created_at: string; status: string; model: string } | null;
  recentDecisions: Array<{ id: string; title: string; created_at: string }>;
}

export default function DashboardPage() {
  const { activeCompanyId, activeCompany } = useCompany();
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!activeCompanyId) return;
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional: show a loading state while refetching on company switch
    setLoading(true);

    (async () => {
      const supabase = createClient();
      const scopedCompanyIds = await getScopedCompanyIds(supabase, activeCompanyId);

      const [openTasks, pendingApprovals, lastRun, decisions] = await Promise.all([
        supabase
          .from("tasks")
          .select("id", { count: "exact", head: true })
          .in("company_id", scopedCompanyIds)
          .not("status", "in", "(done,cancelled)"),
        supabase
          .from("approvals")
          .select("id", { count: "exact", head: true })
          .in("company_id", scopedCompanyIds)
          .eq("status", "pending"),
        supabase
          .from("agent_runs")
          .select("created_at, status, model")
          .in("company_id", scopedCompanyIds)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
        supabase
          .from("decisions")
          .select("id, title, created_at")
          .in("company_id", scopedCompanyIds)
          .order("created_at", { ascending: false })
          .limit(5),
      ]);

      if (cancelled) return;
      setData({
        openTasksCount: openTasks.count ?? 0,
        pendingApprovalsCount: pendingApprovals.count ?? 0,
        lastAgentRun: lastRun.data ?? null,
        recentDecisions: decisions.data ?? [],
      });
      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [activeCompanyId]);

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-lg font-semibold text-foreground">
        {activeCompany ? `${activeCompany.name} overview` : "Overview"}
      </h1>

      {loading || !data ? (
        <Spinner />
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <StatCard label="Open tasks" value={String(data.openTasksCount)} />
            <StatCard label="Pending approvals" value={String(data.pendingApprovalsCount)} />
            <StatCard
              label="Last agent run"
              value={
                data.lastAgentRun
                  ? new Date(data.lastAgentRun.created_at).toLocaleString()
                  : "No runs yet"
              }
              sub={data.lastAgentRun ? `${data.lastAgentRun.model} · ${data.lastAgentRun.status}` : undefined}
            />
          </div>

          <div className="rounded-lg border border-border bg-surface p-4">
            <h2 className="mb-3 text-sm font-medium text-foreground">Recent decisions</h2>
            {data.recentDecisions.length === 0 ? (
              <p className="text-sm text-muted">No decisions recorded yet.</p>
            ) : (
              <ul className="flex flex-col gap-2">
                {data.recentDecisions.map((d) => (
                  <li key={d.id} className="flex justify-between text-sm">
                    <span className="text-foreground">{d.title}</span>
                    <span className="text-muted">{new Date(d.created_at).toLocaleDateString()}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function StatCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-lg border border-border bg-surface p-4">
      <p className="text-xs uppercase tracking-wide text-muted">{label}</p>
      <p className="mt-1 text-xl font-semibold text-foreground">{value}</p>
      {sub && <p className="mt-0.5 text-xs text-muted">{sub}</p>}
    </div>
  );
}
