export interface AgentRankInput {
  scope: string;
  departmentId: string | null;
  roleTitle?: string | null;
}

/**
 * Maps an agent's existing scope/department_id onto the founder's
 * requested hierarchy language (Founder -> Group Executives -> Company
 * Executives -> Department Leads -> Specialists) — no schema change, just
 * a different label computed from columns that already exist on every
 * `agents` row. `scope='project'` is reserved (nothing uses it yet) but
 * still resolves to a sensible label rather than falling through.
 */
export function deriveAgentRank(agent: AgentRankInput): string {
  if (agent.scope === "group") return "Group Executive";
  if (agent.scope === "project") return "Specialist";
  if (agent.departmentId) return `${agent.roleTitle ?? "Department"} Lead`;
  return "Company Executive";
}
