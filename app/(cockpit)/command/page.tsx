"use client";

import { useEffect, useState } from "react";
import { Spinner } from "@/components/Spinner";
import { Panel } from "@/components/ui/Panel";

interface CompanySummary {
  id: string;
  name: string;
  parent_id: string | null;
}

interface Approval {
  id: string;
  proposed_by_agent_id: string;
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
  openTasks: number;
  blockedTasks: number;
  pendingApprovals: number;
  lastRunAt: string | null;
  lastRunStatus: string | null;
  goalsOnTrack: number;
  goalsAtRisk: number;
  goalsOffTrack: number;
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

const RISK_BADGE: Record<string, string> = {
  high: "bg-danger/20 text-danger",
  medium: "bg-warning/20 text-warning",
  low: "bg-surface-raised text-muted",
};

export default function CommandCenterPage() {
  const [data, setData] = useState<CommandData | null>(null);
  const [loading, setLoading] = useState(true);
  const [briefing, setBriefing] = useState<string | null>(null);
  const [briefingLoading, setBriefingLoading] = useState(false);
  const [briefingError, setBriefingError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/command")
      .then((res) => res.json())
      .then((body) => {
        if (!cancelled) setData(body);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

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
  if (!data) return <p className="text-sm text-muted">Could not load the Command Center.</p>;

  const attentionCount =
    data.attention.pendingApprovals.length +
    data.attention.blockedTasks.length +
    data.attention.overdueTasks.length +
    data.attention.atRiskGoals.length;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-lg font-semibold text-foreground">Command Center</h1>
        <p className="text-sm text-muted">
          Every company, one view — real attention items, real risks, real activity. Nothing below is
          fabricated: each section traces to a table this app already writes to.
        </p>
      </div>

      <Panel data-testid="attention-center">
        <p className="label-caps mb-3">Attention Center ({attentionCount})</p>
        {attentionCount === 0 ? (
          <p className="text-sm text-muted">Nothing needs you right now — that&apos;s a real result.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {data.attention.pendingApprovals.map((a) => (
              <li key={`approval-${a.id}`} className="flex items-center justify-between gap-2 text-sm">
                <span className="text-foreground">
                  <span
                    className={`mr-2 rounded px-1.5 py-0.5 text-[10px] uppercase ${RISK_BADGE[a.risk_level] ?? "bg-surface-raised text-muted"}`}
                  >
                    Approval
                  </span>
                  {a.action_type} — {a.company_name}
                </span>
                <span className="shrink-0 text-xs text-muted">{new Date(a.created_at).toLocaleDateString()}</span>
              </li>
            ))}
            {data.attention.blockedTasks.map((t) => (
              <li key={`blocked-${t.id}`} className="flex items-center justify-between gap-2 text-sm">
                <span className="text-foreground">
                  <span className="mr-2 rounded bg-danger/20 px-1.5 py-0.5 text-[10px] uppercase text-danger">Blocked</span>
                  {t.title} — {t.company_name}
                </span>
              </li>
            ))}
            {data.attention.overdueTasks.map((t) => (
              <li key={`overdue-${t.id}`} className="flex items-center justify-between gap-2 text-sm">
                <span className="text-foreground">
                  <span className="mr-2 rounded bg-warning/20 px-1.5 py-0.5 text-[10px] uppercase text-warning">Overdue</span>
                  {t.title} — {t.company_name}
                </span>
                <span className="shrink-0 text-xs text-muted">Due {new Date(t.due_at).toLocaleDateString()}</span>
              </li>
            ))}
            {data.attention.atRiskGoals.map((g) => (
              <li key={`goal-${g.id}`} className="flex items-center justify-between gap-2 text-sm">
                <span className="text-foreground">
                  <span className="mr-2 rounded bg-warning/20 px-1.5 py-0.5 text-[10px] uppercase text-warning">
                    {g.status === "off_track" ? "Off track" : "At risk"}
                  </span>
                  {g.objective} — {g.company_name}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Panel data-testid="opportunities">
          <p className="label-caps mb-3">Opportunities</p>
          {data.opportunities.length === 0 ? (
            <p className="text-sm text-muted">
              No cross-company similarities found above the threshold right now — a real result, not a gap.
            </p>
          ) : (
            <ul className="flex flex-col gap-3">
              {data.opportunities.map((o, i) => (
                <li key={i} className="text-sm">
                  <p className="text-xs text-muted">
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
            <p className="label-caps">Weekly Executive Briefing</p>
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
              Live-generated by the Chief of Staff agent from real tasks, decisions, and goals across
              every company — not stored, so it&apos;s always current when you ask for it.
            </p>
          )}
        </Panel>
      </div>

      <div>
        <p className="label-caps mb-3">Company Health</p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {data.companyHealth.map((c) => (
            <Panel key={c.companyId} data-testid={`company-health-${c.companyId}`}>
              <p className="mb-2 font-medium text-foreground">{c.companyName}</p>
              <dl className="grid grid-cols-2 gap-x-2 gap-y-1 text-xs">
                <dt className="text-muted">Open tasks</dt>
                <dd className="text-right text-foreground">{c.openTasks}</dd>
                <dt className="text-muted">Blocked</dt>
                <dd className="text-right text-foreground">{c.blockedTasks}</dd>
                <dt className="text-muted">Pending approvals</dt>
                <dd className="text-right text-foreground">{c.pendingApprovals}</dd>
                <dt className="text-muted">Goals on track</dt>
                <dd className="text-right text-foreground">{c.goalsOnTrack}</dd>
                <dt className="text-muted">Goals at risk</dt>
                <dd className="text-right text-foreground">{c.goalsAtRisk + c.goalsOffTrack}</dd>
              </dl>
              <p className="mt-2 text-[11px] text-muted">
                {c.lastRunAt
                  ? `Last activity ${new Date(c.lastRunAt).toLocaleString()} (${c.lastRunStatus})`
                  : "No agent activity yet"}
              </p>
            </Panel>
          ))}
        </div>
      </div>

      <Panel data-testid="daily-briefings">
        <p className="label-caps mb-3">Daily Briefings</p>
        {data.dailyBriefings.length === 0 ? (
          <p className="text-sm text-muted">
            No daily briefings yet — the daily-briefing Edge Function needs a live Supabase project and
            its scheduled job filled in (see README).
          </p>
        ) : (
          <ul className="flex flex-col gap-3">
            {data.dailyBriefings.map((b) => (
              <li key={b.companyId} className="text-sm">
                <p className="text-xs text-muted">
                  {b.companyName} · {new Date(b.createdAt).toLocaleString()}
                </p>
                <p className="mt-1 whitespace-pre-wrap text-foreground">{b.content}</p>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <Panel data-testid="agent-activity">
        <p className="label-caps mb-3">Agent Activity</p>
        {data.recentActivity.length === 0 ? (
          <p className="text-sm text-muted">Nothing has happened yet.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {data.recentActivity.map((r) => (
              <li key={r.id} className="flex items-start justify-between gap-3 text-sm">
                <p className={`flex-1 ${r.status === "error" ? "text-danger" : "text-foreground"}`}>
                  {r.output ?? (r.status === "error" ? "Run failed — no output." : `Status: ${r.status}`)}
                </p>
                <span className="shrink-0 text-xs text-muted">{new Date(r.createdAt).toLocaleTimeString()}</span>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}
