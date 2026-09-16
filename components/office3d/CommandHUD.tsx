import { Panel } from "@/components/ui/Panel";
import { STATE_COLOR, STATE_LABEL, summarizeAgentStates, type AgentVisualState } from "@/lib/agent-visual-state";
import type { OfficeLayout } from "@/lib/office-layout";

// Fixed display order, not insertion order — keeps the chip row stable
// frame to frame instead of reshuffling as counts change.
const STATE_ORDER: AgentVisualState[] = [
  "executing",
  "blocked",
  "approval",
  "collaborating",
  "delivered",
  "sleeping",
  "idle",
];

interface RecentDecision {
  id: string;
  title: string;
  created_at: string;
}

/**
 * Founder Command Mode's metrics overlay — a plain DOM panel over the 3D
 * viewport, not a drei <Html> inside the Canvas (avoids z-index/event
 * complexity for something that isn't part of the 3D world at all). Every
 * number here comes straight from `layout` (the same org-wide object
 * `officeLayout()` already produces from /api/map's unscoped response) or
 * `recentDecisions` (the page's own already-fetched dashboard state) — no
 * new fetch either way, and the district/Operator/state counts stay honest
 * regardless of which company happens to be active in the switcher.
 * `recentDecisions` is scoped to whichever company is active, same as the
 * rest of the page's dashboard state — the one piece of this HUD that
 * isn't org-wide, called out here rather than silently implied.
 */
export function CommandHUD({
  layout,
  workingAgentIds,
  now,
  recentDecisions = [],
  collaboratingAgentIds = new Set(),
}: {
  layout: OfficeLayout;
  workingAgentIds: Set<string>;
  now: number;
  recentDecisions?: RecentDecision[];
  collaboratingAgentIds?: Set<string>;
}) {
  const counts = summarizeAgentStates(layout.agents, workingAgentIds, now, collaboratingAgentIds);
  const pendingApprovals = layout.agents.filter((a) => a.hasPendingApproval).length;

  const districtLabelById = new Map(layout.districts.map((d) => [d.companyId, d.label]));
  const pendingByCompany = new Map<string, number>();
  for (const a of layout.agents) {
    if (!a.hasPendingApproval) continue;
    pendingByCompany.set(a.companyId, (pendingByCompany.get(a.companyId) ?? 0) + 1);
  }

  return (
    // A separate positioned wrapper, not passed as Panel's own className —
    // Panel already hardcodes "relative" on itself, which fights an
    // "absolute" override passed alongside it via Tailwind's class-order
    // (not DOM-order) cascade. A real bug this pass caught only by looking
    // at a screenshot: the HUD rendered in normal document flow, pushed
    // hundreds of pixels below the viewport, not floating over the scene.
    <div className="pointer-events-none absolute right-3 top-3 w-64">
      <Panel data-testid="command-hud" className="!bg-surface/85 backdrop-blur-sm">
        <p className="label-caps mb-2">Command Mode</p>
        <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
          <dt className="text-muted">Districts</dt>
          <dd className="text-right text-foreground">{layout.districts.length}</dd>
          <dt className="text-muted">Operators</dt>
          <dd className="text-right text-foreground">{layout.agents.length}</dd>
          <dt className="text-muted">Pending approvals</dt>
          <dd className="text-right text-foreground">{pendingApprovals}</dd>
        </dl>

        {pendingByCompany.size > 0 && (
          <ul className="mt-2 flex flex-col gap-0.5 text-[10px] text-muted">
            {[...pendingByCompany.entries()].map(([companyId, count]) => (
              <li key={companyId} className="flex justify-between">
                <span>{districtLabelById.get(companyId) ?? companyId}</span>
                <span className="text-foreground">{count}</span>
              </li>
            ))}
          </ul>
        )}

        <div className="mt-3 flex flex-wrap gap-1.5">
          {STATE_ORDER.filter((state) => counts[state] > 0).map((state) => (
            <span
              key={state}
              className="flex items-center gap-1.5 rounded-full border border-border bg-surface-raised px-2 py-0.5 text-[10px] text-foreground"
            >
              <span
                aria-hidden="true"
                className="h-1.5 w-1.5 rounded-full"
                style={{ background: STATE_COLOR[state] ?? "#7c88ad" }}
              />
              {counts[state]} {STATE_LABEL[state]}
            </span>
          ))}
        </div>

        {recentDecisions.length > 0 && (
          <>
            <p className="label-caps mb-1 mt-3">Recent decisions</p>
            <ul className="flex flex-col gap-1">
              {recentDecisions.slice(0, 3).map((d) => (
                <li key={d.id} className="truncate text-[11px] text-foreground" title={d.title}>
                  {d.title}
                </li>
              ))}
            </ul>
          </>
        )}
      </Panel>
    </div>
  );
}
