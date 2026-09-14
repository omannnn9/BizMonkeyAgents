import type { HTMLAttributes, ReactNode } from "react";

interface PanelProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
  /** Adds a soft glow on hover/focus — reserve for genuinely interactive panels. */
  glow?: boolean;
}

/**
 * The shared "instrument panel" surface — replaces the raw
 * `rounded-lg border border-border bg-surface p-4` pattern repeated
 * verbatim across Documents/Approvals/Memories/Chat with one consistent
 * look (a subtle top highlight line, an optional glow on hover/focus for
 * interactive panels). A visual-language primitive only — no data or
 * behavior of its own, so every page keeps its existing logic and only
 * swaps its outer wrapper.
 */
export function Panel({ children, className = "", glow = false, ...rest }: PanelProps) {
  return (
    <div
      className={`transition-cortex relative overflow-hidden rounded-lg border border-border bg-surface p-4 ${
        glow ? "hover:glow-accent focus-within:glow-accent" : ""
      } ${className}`}
      {...rest}
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-border to-transparent opacity-80"
      />
      {children}
    </div>
  );
}
