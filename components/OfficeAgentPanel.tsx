"use client";

import { useCallback, useEffect, useState } from "react";
import { AgentChatPanel } from "@/components/AgentChatPanel";
import { Spinner } from "@/components/Spinner";

interface RunRow {
  id: string;
  created_at: string;
  status: string;
  model: string;
  input: string | null;
}

interface ApprovalRow {
  id: string;
  action_type: string;
  status: string;
  risk_level: string;
  created_at: string;
}

/**
 * The click-an-agent overlay: chat (via AgentChatPanel, the same
 * implementation /chat uses), recent runs, and pending approvals for that
 * one agent — without navigating away from the office scene. Approve/reject
 * reuses the same POST /api/approvals/:id endpoint the /approvals page
 * already uses.
 */
export function OfficeAgentPanel({
  companyId,
  agentId,
  agentLabel,
  agentRank,
  onClose,
  onSendStart,
  onSendEnd,
}: {
  companyId: string;
  agentId: string;
  agentLabel: string;
  agentRank?: string;
  onClose: () => void;
  onSendStart?: () => void;
  onSendEnd?: () => void;
}) {
  const [runs, setRuns] = useState<RunRow[]>([]);
  const [approvals, setApprovals] = useState<ApprovalRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const [activityRes, approvalsRes] = await Promise.all([
      fetch(`/api/activity?companyId=${companyId}&agentId=${agentId}`).then((r) => r.json()),
      fetch(`/api/approvals?companyId=${companyId}&agentId=${agentId}`).then((r) => r.json()),
    ]);
    setRuns(activityRes.runs ?? []);
    setApprovals(approvalsRes.approvals ?? []);
    setLoading(false);
  }, [companyId, agentId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional: load() sets loading state while fetching on mount/agent switch
    load();
  }, [load]);

  async function decide(id: string, decision: "approved" | "rejected") {
    setBusyId(id);
    await fetch(`/api/approvals/${id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ decision }),
    });
    setBusyId(null);
    load();
  }

  const pendingApprovals = approvals.filter((a) => a.status === "pending");

  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-black/40" onClick={onClose}>
      <div
        className="flex h-full w-full max-w-xl flex-col gap-4 overflow-y-auto border-l border-border bg-background p-4 sm:p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-foreground">{agentLabel}</h2>
            {agentRank && <p className="label-caps">{agentRank}</p>}
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="rounded-md border border-border px-2 py-1 text-xs text-muted hover:text-foreground"
          >
            Close
          </button>
        </div>

        <div className="h-72 shrink-0">
          <AgentChatPanel
            key={agentId}
            companyId={companyId}
            agentId={agentId}
            agentLabel={agentLabel}
            onSendStart={onSendStart}
            onSendEnd={onSendEnd}
          />
        </div>

        {loading ? (
          <Spinner />
        ) : (
          <>
            <section className="flex flex-col gap-2">
              <h3 className="text-sm font-medium text-muted">Pending approvals ({pendingApprovals.length})</h3>
              {pendingApprovals.length === 0 ? (
                <p className="text-xs text-muted">Nothing waiting on you for this agent.</p>
              ) : (
                pendingApprovals.map((a) => (
                  <div key={a.id} className="rounded-md border border-border bg-surface p-3">
                    <div className="mb-2 flex items-center justify-between">
                      <span className="text-sm text-foreground">{a.action_type}</span>
                      <span className="text-[10px] uppercase tracking-wide text-warning">{a.risk_level}</span>
                    </div>
                    <div className="flex gap-2">
                      <button
                        disabled={busyId === a.id}
                        onClick={() => decide(a.id, "approved")}
                        className="rounded-md bg-success px-3 py-1 text-xs font-medium text-black disabled:opacity-50"
                      >
                        Approve
                      </button>
                      <button
                        disabled={busyId === a.id}
                        onClick={() => decide(a.id, "rejected")}
                        className="rounded-md border border-border px-3 py-1 text-xs text-muted hover:text-foreground disabled:opacity-50"
                      >
                        Reject
                      </button>
                    </div>
                  </div>
                ))
              )}
            </section>

            <section className="flex flex-col gap-2">
              <h3 className="text-sm font-medium text-muted">Recent runs</h3>
              {runs.length === 0 ? (
                <p className="text-xs text-muted">No runs yet.</p>
              ) : (
                runs.map((r) => (
                  <div key={r.id} className="rounded-md border border-border px-3 py-2 text-xs">
                    <div className="mb-1 flex items-center justify-between">
                      <span className={r.status === "error" ? "text-danger" : "text-muted"}>{r.status}</span>
                      <span className="text-muted">{new Date(r.created_at).toLocaleString()}</span>
                    </div>
                    {r.input && <p className="text-foreground">{r.input}</p>}
                  </div>
                ))
              )}
            </section>
          </>
        )}
      </div>
    </div>
  );
}
