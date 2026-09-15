import { Panel } from "@/components/ui/Panel";
import { STATE_COLOR, STATE_LABEL, summarizeAgentStates, type AgentVisualState } from "@/lib/agent-visual-state";
import type { OfficeLayout } from "@/lib/office-layout";

// Fixed display order, not insertion order — keeps the chip row stable
// frame to frame instead of reshuffling as counts change.
const STATE_ORDER: AgentVisualState[] = ["executing", "approval", "blocked", "delivered", "sleeping", "idle"];

/**
 * Founder Command Mode's metrics overlay — a plain DOM panel over the 3D
 * viewport, not a drei <Html> inside the Canvas (avoids z-index/event
 * complexity for something that isn't part of the 3D world at all). Every
 * number here comes straight from `layout`, the same org-wide object
 * `officeLayout()` already produces from /api/map's unscoped response — no
 * new fetch, and honest regardless of which company happens to be active
 * in the switcher.
 */
export function CommandHUD({
  layout,
  workingAgentIds,
  now,
}: {
  layout: OfficeLayout;
  workingAgentIds: Set<string>;
  now: number;
}) {
  const counts = summarizeAgentStates(layout.agents, workingAgentIds, now);
  const pendingApprovals = layout.agents.filter((a) => a.hasPendingApproval).length;

  return (
    // A separate positioned wrapper, not passed as Panel's own className —
    // Panel already hardcodes "relative" on itself, which fights an
    // "absolute" override passed alongside it via Tailwind's class-order
    // (not DOM-order) cascade. A real bug this pass caught only by looking
    // at a screenshot: the HUD rendered in normal document flow, pushed
    // hundreds of pixels below the viewport, not floating over the scene.
    <div className="pointer-events-none absolute right-3 top-3 w-56">
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
      </Panel>
    </div>
  );
}
