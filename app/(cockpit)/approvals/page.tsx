"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { getScopedCompanyIds } from "@/lib/agent/scoped-companies";
import { useCompany } from "@/lib/company-context";
import { Spinner } from "@/components/Spinner";

interface Approval {
  id: string;
  action_type: string;
  payload: Record<string, unknown>;
  risk_level: string;
  status: string;
  created_at: string;
}

function PayloadPreview({ actionType, payload }: { actionType: string; payload: Record<string, unknown> }) {
  if (actionType === "send_email" && typeof payload.to === "string") {
    return (
      <div className="mb-3 space-y-1 rounded bg-surface-raised p-3 text-xs">
        <p className="text-muted">
          To <span className="text-foreground">{String(payload.to)}</span>
        </p>
        <p className="text-muted">
          Subject <span className="text-foreground">{String(payload.subject ?? "")}</span>
        </p>
        <p className="whitespace-pre-wrap text-foreground">{String(payload.body ?? "")}</p>
      </div>
    );
  }
  return (
    <pre className="mb-3 whitespace-pre-wrap rounded bg-surface-raised p-2 text-xs text-muted">
      {JSON.stringify(payload, null, 2)}
    </pre>
  );
}

export default function ApprovalsPage() {
  const { activeCompanyId } = useCompany();
  const [approvals, setApprovals] = useState<Approval[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!activeCompanyId) return;
    setLoading(true);
    const supabase = createClient();
    const scopedCompanyIds = await getScopedCompanyIds(supabase, activeCompanyId);
    const { data } = await supabase
      .from("approvals")
      .select("id, action_type, payload, risk_level, status, created_at")
      .in("company_id", scopedCompanyIds)
      .order("created_at", { ascending: false })
      .limit(50);
    setApprovals((data as Approval[]) ?? []);
    setLoading(false);
  }, [activeCompanyId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional: load() sets loading state while fetching on mount/company switch
    load();
  }, [load]);

  async function decide(id: string, decision: "approved" | "rejected") {
    setBusyId(id);
    setFeedback(null);
    const res = await fetch(`/api/approvals/${id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ decision }),
    });
    const body = await res.json();
    if (!res.ok) {
      setFeedback(`Error: ${body.error}`);
    } else if (body.status === "failed") {
      setFeedback(`Approved, but could not execute: ${body.error}`);
    } else {
      setFeedback(`Action ${body.status}.`);
    }
    setBusyId(null);
    load();
  }

  const pending = approvals.filter((a) => a.status === "pending");
  const decided = approvals.filter((a) => a.status !== "pending");

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-lg font-semibold text-foreground">Approvals</h1>
      {feedback && <p className="text-sm text-muted">{feedback}</p>}

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-medium text-muted">Pending ({pending.length})</h2>
        {loading ? (
          <Spinner />
        ) : pending.length === 0 ? (
          <p className="text-sm text-muted">Nothing waiting on you.</p>
        ) : (
          pending.map((a) => (
            <div key={a.id} className="rounded-lg border border-border bg-surface p-4">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-sm font-medium text-foreground">{a.action_type}</span>
                <span
                  className={`rounded px-1.5 py-0.5 text-[10px] uppercase tracking-wide ${
                    a.risk_level === "high"
                      ? "bg-danger/20 text-danger"
                      : a.risk_level === "medium"
                        ? "bg-warning/20 text-warning"
                        : "bg-surface-raised text-muted"
                  }`}
                >
                  {a.risk_level}
                </span>
              </div>
              <PayloadPreview actionType={a.action_type} payload={a.payload} />
              <div className="flex gap-2">
                <button
                  disabled={busyId === a.id}
                  onClick={() => decide(a.id, "approved")}
                  className="rounded-md bg-success px-3 py-1.5 text-xs font-medium text-black disabled:opacity-50"
                >
                  Approve
                </button>
                <button
                  disabled={busyId === a.id}
                  onClick={() => decide(a.id, "rejected")}
                  className="rounded-md border border-border px-3 py-1.5 text-xs text-muted hover:text-foreground disabled:opacity-50"
                >
                  Reject
                </button>
              </div>
            </div>
          ))
        )}
      </section>

      {decided.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className="text-sm font-medium text-muted">History</h2>
          {decided.map((a) => (
            <div key={a.id} className="flex justify-between rounded-md border border-border px-3 py-2 text-sm">
              <span className="text-foreground">{a.action_type}</span>
              <span className="text-muted">{a.status}</span>
            </div>
          ))}
        </section>
      )}
    </div>
  );
}
