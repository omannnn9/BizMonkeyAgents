"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Panel } from "@/components/ui/Panel";
import { Spinner } from "@/components/Spinner";
import { useCompany } from "@/lib/company-context";
import { getCompanyIdentity } from "@/lib/company-identity";
import { deriveAgentState, STATE_COLOR, STATE_LABEL, type AgentVisualState } from "@/lib/agent-visual-state";
import { groupByRecency, RECENCY_LABEL, getLastVisit, markVisit, type RecencyBucket } from "@/lib/temporal";
import type { MapNode } from "@/app/api/map/route";

interface CompanySummary {
  id: string;
  name: string;
  slug: string;
  parent_id: string | null;
  industry: string | null;
}

interface Approval {
  id: string;
  proposed_by_agent_id: string;
  agentName: string;
  company_id: string;
  company_name: string;
  action_type: string;
  risk_level: string;
  created_at: string;
}

interface BlockedTask {
  id: string;
  title: string;
  company_id: string;
  company_name: string;
  created_at: string;
}

interface OverdueTask {
  id: string;
  title: string;
  company_id: string;
  company_name: string;
  due_at: string;
}

interface AtRiskGoal {
  id: string;
  objective: string;
  company_id: string;
  company_name: string;
  status: string;
}

interface CompanyHealth {
  companyId: string;
  companyName: string;
  industry: string | null;
  ownership: Record<string, number> | null;
  market: string | null;
  openTasks: number;
  blockedTasks: number;
  pendingApprovals: number;
  lastRunAt: string | null;
  lastRunStatus: string | null;
  goalsOnTrack: number;
  goalsAtRisk: number;
  goalsOffTrack: number;
  spendUsd: number;
  spendCapUsd: number | null;
}

interface Opportunity {
  similarity: number;
  companyA: string;
  memoryA: string;
  companyB: string;
  memoryB: string;
}

interface ActivityRun {
  id: string;
  agentId: string;
  agentName: string;
  companyId: string;
  companyName: string;
  status: string;
  output: string | null;
  createdAt: string;
}

interface DailyBriefing {
  companyId: string;
  companyName: string;
  content: string;
  createdAt: string;
}

interface CommandData {
  companies: CompanySummary[];
  attention: {
    pendingApprovals: Approval[];
    blockedTasks: BlockedTask[];
    overdueTasks: OverdueTask[];
    atRiskGoals: AtRiskGoal[];
  };
  companyHealth: CompanyHealth[];
  opportunities: Opportunity[];
  recentActivity: ActivityRun[];
  dailyBriefings: DailyBriefing[];
}

const RISK_TONE: Record<string, string> = {
  high: "text-danger",
  medium: "text-warning",
  low: "text-muted",
};

function formatOwnership(ownership: Record<string, number> | null): string | null {
  if (!ownership) return null;
  const parts = Object.entries(ownership).map(([key, pct]) => {
    const label = key.replace(/_pct$/, "").replace(/_/g, " ");
    return `${pct}% ${label.charAt(0).toUpperCase()}${label.slice(1)}`;
  });
  return parts.length > 0 ? parts.join(" / ") : null;
}

function relativeTime(iso: string, now: number): string {
  const diffMs = now - new Date(iso).getTime();
  const min = Math.floor(diffMs / 60000);
  if (min < 1) return "just now";
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  return `${Math.floor(hr / 24)}d ago`;
}

type AttentionItem =
  | { kind: "approval"; id: string; createdAt: string; row: Approval }
  | { kind: "blocked"; id: string; createdAt: string; row: BlockedTask }
  | { kind: "overdue"; id: string; createdAt: string; row: OverdueTask }
  | { kind: "goal"; id: string; createdAt: string; row: AtRiskGoal };

/** What each attention kind actually asks the founder to do, and where —
 *  the "Founder Actions" the spec asks for, wired to the pages that
 *  already own those flows rather than duplicating approve/reject logic
 *  here too. */
function attentionMeta(item: AttentionItem): { label: string; sub: string; href: string; cta: string } {
  switch (item.kind) {
    case "approval":
      return {
        label: `${item.row.action_type} — ${item.row.company_name}`,
        sub: `Proposed by ${item.row.agentName}`,
        href: "/approvals",
        cta: "Review",
      };
    case "blocked":
      return { label: `${item.row.title} — ${item.row.company_name}`, sub: "Blocked task", href: "/office", cta: "Open" };
    case "overdue":
      return {
        label: `${item.row.title} — ${item.row.company_name}`,
        sub: `Was due ${new Date(item.row.due_at).toLocaleDateString()}`,
        href: "/office",
        cta: "Open",
      };
    case "goal":
      return {
        label: `${item.row.objective} — ${item.row.company_name}`,
        sub: item.row.status === "off_track" ? "Off track" : "At risk",
        href: "/office",
        cta: "Open",
      };
  }
}

export default function CommandCenterPage() {
  const { companies: contextCompanies } = useCompany();
  const [data, setData] = useState<CommandData | null>(null);
  const [agentNodes, setAgentNodes] = useState<MapNode[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [briefing, setBriefing] = useState<string | null>(null);
  const [briefingLoading, setBriefingLoading] = useState(false);
  const [briefingError, setBriefingError] = useState<string | null>(null);
  const [now] = useState(() => Date.now());
  const [lastVisit] = useState<number | null>(() => getLastVisit("command"));

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      fetch("/api/command").then((res) => res.json()),
      fetch("/api/map")
        .then((res) => (res.ok ? res.json() : { nodes: [] }))
        .catch(() => ({ nodes: [] })),
    ])
      .then(([commandBody, mapBody]) => {
        if (cancelled) return;
        setData(commandBody);
        setAgentNodes((mapBody.nodes ?? []).filter((n: MapNode) => n.type === "agent"));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
        markVisit("command");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const attentionItems: AttentionItem[] = useMemo(() => {
    if (!data) return [];
    const items: AttentionItem[] = [
      ...data.attention.pendingApprovals.map((row) => ({ kind: "approval" as const, id: row.id, createdAt: row.created_at, row })),
      ...data.attention.blockedTasks.map((row) => ({ kind: "blocked" as const, id: row.id, createdAt: row.created_at, row })),
      ...data.attention.overdueTasks.map((row) => ({ kind: "overdue" as const, id: row.id, createdAt: row.due_at, row })),
      ...data.attention.atRiskGoals.map((row) => ({ kind: "goal" as const, id: row.id, createdAt: new Date().toISOString(), row })),
    ];
    return items.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [data]);

  const newSinceLastVisit = useMemo(() => {
    if (!lastVisit) return 0;
    return attentionItems.filter((i) => new Date(i.createdAt).getTime() > lastVisit).length;
  }, [attentionItems, lastVisit]);

  const agentStateCounts = useMemo(() => {
    const counts: Partial<Record<AgentVisualState, number>> = {};
    for (const node of agentNodes ?? []) {
      const state = deriveAgentState(
        { lastRunAt: node.lastRunAt, lastRunStatus: node.lastRunStatus, hasPendingApproval: node.hasPendingApproval, status: node.status },
        false,
        now,
      );
      counts[state] = (counts[state] ?? 0) + 1;
    }
    return counts;
  }, [agentNodes, now]);

  const activityByBucket = useMemo(
    () => (data ? groupByRecency(data.recentActivity, (r) => r.createdAt, now) : []),
    [data, now],
  );

  async function generateBriefing() {
    setBriefingLoading(true);
    setBriefingError(null);
    try {
      const res = await fetch("/api/briefing", { method: "POST" });
      const body = await res.json();
      if (!res.ok) {
        setBriefingError(body.error ?? "Failed to generate briefing.");
        return;
      }
      setBriefing(body.message);
    } catch {
      setBriefingError("Failed to generate briefing.");
    } finally {
      setBriefingLoading(false);
    }
  }

  if (loading) return <Spinner />;
  if (!data) return <p className="text-sm text-muted">Could not load Command.</p>;

  const attentionCount = attentionItems.length;

  return (
    <div className="flex flex-col gap-8">
      {/* The one question this whole page answers first. */}
      <div>
        <p className="text-context mb-1">Command</p>
        <h1 className="text-primary-emphasis">
          {attentionCount === 0 ? "Nothing needs you right now." : `${attentionCount} thing${attentionCount === 1 ? "" : ""} need${attentionCount === 1 ? "s" : ""} you.`}
        </h1>
        <p className="text-secondary-emphasis mt-1">
          {attentionCount === 0
            ? "Every company is running quietly — a real result, not an empty screen."
            : newSinceLastVisit > 0
              ? `${newSinceLastVisit} of these are new since your last visit.`
              : "Real approvals, blocked work, and risk — nothing fabricated below."}
        </p>
      </div>

      {/* 1. Immediate Attention */}
      <section>
        <p className="label-caps mb-3">Immediate attention</p>
        {attentionItems.length === 0 ? (
          <Panel className="text-sm text-muted">Nothing pending — check back after the next agent run.</Panel>
        ) : (
          <ul className="flex flex-col gap-1.5" data-testid="attention-center">
            {attentionItems.map((item) => {
              const meta = attentionMeta(item);
              const isNew = lastVisit !== null && new Date(item.createdAt).getTime() > lastVisit;
              const risk = item.kind === "approval" ? item.row.risk_level : item.kind === "blocked" ? "high" : "medium";
              return (
                <li key={`${item.kind}-${item.id}`}>
                  <Panel className="flex items-center justify-between gap-3 !p-3">
                    <div className="flex min-w-0 items-center gap-2.5">
                      <span
                        aria-hidden="true"
                        className={`h-1.5 w-1.5 shrink-0 rounded-full ${isNew ? "pulse-live" : ""}`}
                        style={{ background: `var(--${risk === "high" ? "danger" : risk === "medium" ? "warning" : "muted"})` }}
                      />
                      <div className="min-w-0">
                        <p className="truncate text-sm text-foreground">{meta.label}</p>
                        <p className={`text-meta ${RISK_TONE[risk] ?? "text-muted"}`}>{meta.sub}</p>
                      </div>
                    </div>
                    <Link
                      href={meta.href}
                      className="transition-cortex shrink-0 rounded-md border border-border px-2.5 py-1 text-xs text-foreground hover:border-[color:var(--company-accent)]"
                    >
                      {meta.cta}
                    </Link>
                  </Panel>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* 2. Agent Situation — a real, org-wide state summary (same signal
          every Operator's glow in the Colony already shows), so the
          founder knows the org's pulse without opening the 3D view. */}
      {agentNodes && agentNodes.length > 0 && (
        <section>
          <p className="label-caps mb-3">Agent situation</p>
          <div className="flex flex-wrap gap-2">
            {(Object.keys(STATE_LABEL) as AgentVisualState[])
              .filter((s) => (agentStateCounts[s] ?? 0) > 0)
              .map((s) => (
                <Link
                  key={s}
                  href="/office"
                  className="transition-cortex flex items-center gap-1.5 rounded-full border border-border bg-surface-raised px-2.5 py-1 text-xs text-foreground hover:border-[color:var(--company-accent)]"
                >
                  <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full" style={{ background: STATE_COLOR[s] ?? "#7c88ad" }} />
                  {agentStateCounts[s]} {STATE_LABEL[s]}
                </Link>
              ))}
          </div>
        </section>
      )}

      {/* 3. Company Pulse — a pulse strip, one row per real company, not a
          grid of identical stat cards. Each row's accent/motif comes from
          the same curated company-identity every other surface now uses. */}
      <section>
        <p className="label-caps mb-3">Company pulse</p>
        <div className="flex flex-col gap-2">
          {data.companyHealth.map((c) => {
            const summary = contextCompanies.find((cc) => cc.id === c.companyId);
            const identity = getCompanyIdentity({ slug: summary?.slug ?? c.companyId, industry: c.industry });
            const atRisk = c.goalsAtRisk + c.goalsOffTrack;
            return (
              <Panel key={c.companyId} className="!p-3" data-testid={`company-health-${c.companyId}`}>
                <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                  <div className="flex min-w-[11rem] items-center gap-2.5">
                    <span aria-hidden="true" className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: identity.accent }} />
                    <div>
                      <p className="text-sm font-medium text-foreground">{c.companyName}</p>
                      <p className="text-meta">
                        {identity.motif}
                        {formatOwnership(c.ownership) ? ` · ${formatOwnership(c.ownership)}` : ""}
                      </p>
                    </div>
                  </div>
                  <div className="flex flex-1 flex-wrap items-center gap-x-4 gap-y-1 text-xs">
                    <span className="text-muted">
                      <span className="text-foreground">{c.openTasks}</span> open
                    </span>
                    {c.blockedTasks > 0 && (
                      <span className="text-danger">
                        <span className="font-medium">{c.blockedTasks}</span> blocked
                      </span>
                    )}
                    {c.pendingApprovals > 0 && (
                      <span className="text-warning">
                        <span className="font-medium">{c.pendingApprovals}</span> awaiting approval
                      </span>
                    )}
                    {atRisk > 0 && (
                      <span className="text-warning">
                        <span className="font-medium">{atRisk}</span> goal{atRisk === 1 ? "" : "s"} at risk
                      </span>
                    )}
                    <span
                      className={c.spendCapUsd !== null && c.spendUsd > c.spendCapUsd ? "font-medium text-danger" : "text-muted"}
                    >
                      ${c.spendUsd.toFixed(2)}
                      {c.spendCapUsd !== null ? ` / $${c.spendCapUsd.toFixed(2)} (30d)` : " spend (30d)"}
                    </span>
                  </div>
                  <p className="shrink-0 text-meta">
                    {c.lastRunAt ? `Active ${relativeTime(c.lastRunAt, now)}` : "No activity yet"}
                  </p>
                </div>
              </Panel>
            );
          })}
        </div>
      </section>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Panel data-testid="opportunities">
          <p className="label-caps mb-3">Opportunities</p>
          {data.opportunities.length === 0 ? (
            <p className="text-sm text-muted">No cross-company similarities above the threshold right now.</p>
          ) : (
            <ul className="flex flex-col gap-3">
              {data.opportunities.map((o, i) => (
                <li key={i} className="text-sm">
                  <p className="text-meta">
                    {o.companyA} ↔ {o.companyB} · similarity {o.similarity.toFixed(3)}
                  </p>
                  <p className="mt-1 text-foreground">{o.memoryA}</p>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel data-testid="weekly-briefing">
          <div className="mb-3 flex items-center justify-between">
            <p className="label-caps">Weekly executive briefing</p>
            <button
              onClick={generateBriefing}
              disabled={briefingLoading}
              className="transition-cortex rounded-md border border-border px-3 py-1.5 text-xs text-muted hover:text-foreground disabled:opacity-50"
            >
              {briefingLoading ? "Generating…" : "Generate"}
            </button>
          </div>
          {briefingError && <p className="text-sm text-danger">{briefingError}</p>}
          {briefing ? (
            <p className="whitespace-pre-wrap text-sm text-foreground">{briefing}</p>
          ) : (
            <p className="text-sm text-muted">
              Live-generated by the Group CEO agent from real tasks, decisions, and goals across every company.
            </p>
          )}
        </Panel>
      </div>

      {/* 4. Executive Activity — grouped by real recency, real agent names. */}
      <section>
        <p className="label-caps mb-3">Executive activity</p>
        {activityByBucket.length === 0 ? (
          <Panel className="text-sm text-muted">Nothing has happened yet.</Panel>
        ) : (
          <div className="flex flex-col gap-4">
            {activityByBucket.map(({ bucket, items }) => (
              <div key={bucket}>
                <p className="text-meta mb-1.5">{RECENCY_LABEL[bucket as RecencyBucket]}</p>
                <ul className="flex flex-col gap-1.5" data-testid="agent-activity">
                  {items.map((r) => (
                    <Panel key={r.id} className="!p-2.5">
                      <div className="flex items-start justify-between gap-3">
                        <p className="text-sm text-foreground">
                          <span className="font-medium">{r.agentName}</span>{" "}
                          <span className="text-muted">({r.companyName})</span>{" "}
                          {r.status === "error" ? (
                            <span className="text-danger">hit an error.</span>
                          ) : (
                            (r.output ?? "ran with no output.")
                          )}
                        </p>
                        <span className="text-meta shrink-0">{relativeTime(r.createdAt, now)}</span>
                      </div>
                    </Panel>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </section>

      {data.dailyBriefings.length > 0 && (
        <Panel data-testid="daily-briefings">
          <p className="label-caps mb-3">Daily briefings</p>
          <ul className="flex flex-col gap-3">
            {data.dailyBriefings.map((b) => (
              <li key={b.companyId} className="text-sm">
                <p className="text-meta">
                  {b.companyName} · {new Date(b.createdAt).toLocaleString()}
                </p>
                <p className="mt-1 whitespace-pre-wrap text-foreground">{b.content}</p>
              </li>
            ))}
          </ul>
        </Panel>
      )}
    </div>
  );
}
