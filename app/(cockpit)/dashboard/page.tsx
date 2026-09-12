"use client";

import { useEffect, useState } from "react";
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

    fetch(`/api/dashboard?companyId=${activeCompanyId}`)
      .then((res) => res.json())
      .then((body) => {
        if (cancelled) return;
        setData(body);
        setLoading(false);
      });

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
