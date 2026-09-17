import type { MapEdge, MapNode } from "@/app/api/map/route";
import { deriveAgentRank } from "@/lib/agent-title";

export interface HierarchyNode {
  id: string;
  type: "founder" | "company" | "agent";
  label: string;
  /** Agent nodes only — the same rank language the colony world and ActivityFeed already use. */
  rank?: string;
  /** Agent nodes only — raw (unprefixed) ids, ready to hand to OfficeAgentPanel unchanged. */
  companyId?: string;
  agentId?: string;
  /** Agent nodes only — real workload, same /api/map fields the colony world reads. */
  openTaskCount?: number;
  blockedTaskCount?: number;
}

export interface PositionedHierarchyNode extends HierarchyNode {
  x: number;
  y: number;
  depth: number;
}

export interface HierarchyEdge {
  parent: string;
  child: string;
}

export const NODE_W = 150;
export const NODE_H = 44;
const H_GAP = 22;
const V_GAP = 96;

interface TreeNode extends HierarchyNode {
  children: TreeNode[];
}

/**
 * A deterministic top-down **tree** layout — deliberately not
 * `graph-layout.ts`'s force-directed `forceLayout`, since a hierarchy
 * shouldn't visibly jitter into place or allow crossing edges. Built
 * entirely from `/api/map`'s existing node/edge shape (no new fetch):
 * Founder (a real label, not a fabricated row — there's no "founder"
 * table, this position is the human user) -> the company with no parent
 * -> its own agents and child companies -> each child's own agents.
 */
export function hierarchyLayout(
  nodes: MapNode[],
  edges: MapEdge[],
): { nodes: PositionedHierarchyNode[]; edges: HierarchyEdge[] } {
  const companies = nodes.filter((n) => n.type === "company");
  const agentsByCompany = new Map<string, MapNode[]>();
  for (const e of edges) {
    if (e.relation !== "has_agent") continue;
    const agent = nodes.find((n) => n.id === e.target && n.type === "agent");
    if (!agent) continue;
    const list = agentsByCompany.get(e.source) ?? [];
    list.push(agent);
    agentsByCompany.set(e.source, list);
  }

  const childCompanyIds = new Set(edges.filter((e) => e.relation === "owns").map((e) => e.target));
  const central = companies.find((c) => !childCompanyIds.has(c.id)) ?? companies[0] ?? null;
  const childrenByParent = new Map<string, MapNode[]>();
  for (const e of edges) {
    if (e.relation !== "owns") continue;
    const child = companies.find((c) => c.id === e.target);
    if (!child) continue;
    const list = childrenByParent.get(e.source) ?? [];
    list.push(child);
    childrenByParent.set(e.source, list);
  }

  function agentTreeNode(agent: MapNode): TreeNode {
    return {
      id: agent.id,
      type: "agent",
      label: agent.label,
      rank: deriveAgentRank({
        scope: agent.scope ?? "company",
        departmentId: agent.departmentId,
        roleTitle: agent.roleTitle,
      }),
      agentId: agent.id.replace(/^agent:/, ""),
      openTaskCount: agent.openTaskCount ?? 0,
      blockedTaskCount: agent.blockedTaskCount ?? 0,
      children: [],
    };
  }

  function companyTreeNode(company: MapNode): TreeNode {
    const companyId = company.id.replace(/^company:/, "");
    const ownAgents = (agentsByCompany.get(company.id) ?? []).map((a) => ({
      ...agentTreeNode(a),
      companyId,
    }));
    const childCompanies = (childrenByParent.get(company.id) ?? []).map((c) => companyTreeNode(c));
    return {
      id: company.id,
      type: "company",
      label: company.label,
      children: [...ownAgents, ...childCompanies],
    };
  }

  if (!central) return { nodes: [], edges: [] };

  const root: TreeNode = {
    id: "founder",
    type: "founder",
    label: "Founder",
    children: [companyTreeNode(central)],
  };

  function subtreeWidth(node: TreeNode): number {
    if (node.children.length === 0) return NODE_W;
    return Math.max(
      NODE_W,
      node.children.reduce((sum, c) => sum + subtreeWidth(c), 0) + (node.children.length - 1) * H_GAP,
    );
  }

  const positioned: PositionedHierarchyNode[] = [];
  const edgesOut: HierarchyEdge[] = [];

  function assign(node: TreeNode, left: number, depth: number) {
    const width = subtreeWidth(node);
    const { children, ...rest } = node;
    positioned.push({ ...rest, x: left + width / 2, y: depth * V_GAP, depth });
    let cursor = left;
    for (const child of children) {
      assign(child, cursor, depth + 1);
      edgesOut.push({ parent: node.id, child: child.id });
      cursor += subtreeWidth(child) + H_GAP;
    }
  }

  assign(root, 0, 0);
  return { nodes: positioned, edges: edgesOut };
}
