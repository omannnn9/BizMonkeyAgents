"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { getScopedCompanyIds } from "@/lib/agent/scoped-companies";
import { useCompany } from "@/lib/company-context";
import { Spinner } from "@/components/Spinner";

interface ActivityItem {
  id: string;
  kind: "agent_run" | "audit";
  createdAt: string;
  summary: string;
  status?: string;
}

export default function ActivityPage() {
  const { activeCompanyId } = useCompany();
  const [items, setItems] = useState<ActivityItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!activeCompanyId) return;
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional: show a loading state while refetching on company switch
    setLoading(true);

    (async () => {
      const supabase = createClient();
      const scopedCompanyIds = await getScopedCompanyIds(supabase, activeCompanyId);

      const [runs, logs] = await Promise.all([
        supabase
          .from("agent_runs")
          .select("id, created_at, status, model, input")
          .in("company_id", scopedCompanyIds)
          .order("created_at", { ascending: false })
          .limit(30),
        supabase
          .from("audit_log")
          .select("id, created_at, actor_type, action, target_type")
          .in("company_id", scopedCompanyIds)
          .order("created_at", { ascending: false })
          .limit(30),
      ]);

      if (cancelled) return;

      const merged: ActivityItem[] = [
        ...(runs.data ?? []).map((r) => ({
          id: r.id,
          kind: "agent_run" as const,
          createdAt: r.created_at,
          status: r.status,
          summary: `CEO Agent ran (${r.model}): "${(r.input ?? "").slice(0, 80)}${
            (r.input ?? "").length > 80 ? "…" : ""
          }"`,
        })),
        ...(logs.data ?? []).map((l) => ({
          id: l.id,
          kind: "audit" as const,
          createdAt: l.created_at,
          summary: `[${l.actor_type}] ${l.action}${l.target_type ? ` (${l.target_type})` : ""}`,
        })),
      ].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

      setItems(merged);
      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [activeCompanyId]);

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-lg font-semibold text-foreground">Activity</h1>
      {loading ? (
        <Spinner />
      ) : items.length === 0 ? (
        <p className="text-sm text-muted">Nothing has happened here yet.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {items.map((item) => (
            <li
              key={`${item.kind}-${item.id}`}
              className="flex items-start justify-between gap-4 rounded-lg border border-border bg-surface px-4 py-3"
            >
              <div>
                <span
                  className={`mr-2 inline-block rounded px-1.5 py-0.5 text-[10px] uppercase tracking-wide ${
                    item.kind === "agent_run" ? "bg-accent/20 text-accent" : "bg-surface-raised text-muted"
                  }`}
                >
                  {item.kind === "agent_run" ? "agent" : "audit"}
                </span>
                <span className="text-sm text-foreground">{item.summary}</span>
                {item.status && item.status !== "success" && (
                  <span className="ml-2 text-xs text-danger">{item.status}</span>
                )}
              </div>
              <span className="shrink-0 text-xs text-muted">
                {new Date(item.createdAt).toLocaleString()}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
