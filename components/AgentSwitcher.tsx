"use client";

import { deriveAgentRank } from "@/lib/agent-title";

export interface AgentSummary {
  id: string;
  name: string;
  role_title: string | null;
  scope: string;
  department_id: string | null;
}

export function AgentSwitcher({
  agents,
  activeAgentId,
  onChange,
}: {
  agents: AgentSummary[];
  activeAgentId: string;
  onChange: (id: string) => void;
}) {
  // A single-Operator company has nothing to switch between — don't show a
  // dropdown with one option.
  if (agents.length <= 1) return null;

  return (
    <select
      value={activeAgentId}
      onChange={(e) => onChange(e.target.value)}
      aria-label="Active Operator"
      className="transition-cortex rounded-md border border-border bg-surface-raised px-3 py-1.5 text-sm font-medium text-foreground outline-none focus:border-accent focus:glow-accent"
    >
      {agents.map((a) => (
        <option key={a.id} value={a.id}>
          {a.name} — {deriveAgentRank({ scope: a.scope, departmentId: a.department_id, roleTitle: a.role_title })}
        </option>
      ))}
    </select>
  );
}
