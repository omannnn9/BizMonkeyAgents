"use client";

export type WorldLayer = "organization" | "relationships" | "hierarchy" | "knowledge";

/** One source of truth for each layer's name and header description, used
 *  by both the switcher below and the World shell's header. */
export const LAYER_META: Record<WorldLayer, { label: string; description: string }> = {
  organization: {
    label: "Organization",
    description:
      "Districts are companies, Operators are your AI teammates. A glow above an Operator's head is always real: blue while executing, amber waiting on approval, red when blocked, green just delivered, muted grey when sleeping.",
  },
  relationships: {
    label: "Relationships",
    description:
      "Every real relationship the system knows about — company ownership, which agent belongs to which company, and (as they accumulate) documents, decisions, and tasks. Click a node for details.",
  },
  hierarchy: {
    label: "Hierarchy",
    description:
      "Founder, then every real reporting line beneath you — Group Executives, Company Executives, and each department's Lead. Click a company to focus it, an Operator to open its chat, runs, and pending approvals.",
  },
  knowledge: {
    label: "Knowledge",
    description:
      "Every real memory the system has retained, across every company — the core's size and the connections between memories are both real. Click a memory for details.",
  },
};

const LAYER_ORDER: WorldLayer[] = ["organization", "relationships", "hierarchy", "knowledge"];

/**
 * The World shell's primary navigation — replaces separate Graph/
 * Hierarchy/Brain routes with layer buttons that swap the shell's
 * viewport via client state, never a page navigation. Same pressed-state
 * pill styling the Command Mode toggle already uses, so both read as the
 * same kind of control.
 */
export function WorldLayerSwitcher({
  activeLayer,
  onChange,
}: {
  activeLayer: WorldLayer;
  onChange: (layer: WorldLayer) => void;
}) {
  return (
    <nav aria-label="World layers" className="flex flex-wrap gap-2">
      {LAYER_ORDER.map((layer) => {
        const isActive = layer === activeLayer;
        return (
          <button
            key={layer}
            type="button"
            aria-pressed={isActive}
            onClick={() => onChange(layer)}
            className={`transition-cortex rounded-md border px-3 py-1.5 text-xs ${
              isActive
                ? "border-accent bg-accent/15 text-foreground glow-accent"
                : "border-border bg-surface text-muted hover:bg-surface-raised hover:text-foreground"
            }`}
          >
            {LAYER_META[layer].label}
          </button>
        );
      })}
    </nav>
  );
}
