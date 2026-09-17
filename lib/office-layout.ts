import type { MapEdge, MapNode } from "@/app/api/map/route";

export interface OfficeDistrict {
  companyId: string;
  label: string;
  /** Platform center, in layout units (world-space X/Z after the 3D scene's own SCALE). */
  x: number;
  y: number;
  /** Platform footprint radius — scales with how many Operators are stationed here. */
  radius: number;
  /** OD Holdings (no parent) — the Central Command District every other district orbits. */
  isCentral: boolean;
  /** The real business this district represents (`companies.industry`) — visual differentiation grounded in real data, not a synthetic per-company color scheme. */
  industry: string | null;
}

export interface OfficeAgentPosition {
  agentId: string;
  companyId: string;
  label: string;
  x: number;
  y: number;
  lastRunAt: string | null;
  lastRunStatus: MapNode["lastRunStatus"];
  hasPendingApproval: boolean;
  status: string | null;
  scope: string | null;
  departmentId: string | null;
  roleTitle: string | null;
  /** Real workload — from tasks.assigned_agent_id, via assign_task. */
  openTaskCount: number;
  blockedTaskCount: number;
}

export interface OfficeLayout {
  districts: OfficeDistrict[];
  agents: OfficeAgentPosition[];
  width: number;
  height: number;
  centralCompanyId: string | null;
}

const CENTRAL_RADIUS = 130;
const CHILD_BASE_RADIUS = 110;
const CHILD_RADIUS_PER_AGENT = 12;
const ORBIT_GAP = 70;
const AGENT_RING_MIN = 75;
const AGENT_RING_PER_AGENT = 8;

/**
 * A radial "colony" layout, not a wrapping grid — OD Holdings (the company
 * with no parent, i.e. never the target of an `owns` edge) becomes the
 * Central Command District at the origin; every other company is placed
 * radially around it, one orbit position per district, using the same
 * real `owns` edges `/graph` already draws. Deterministic (no force
 * simulation, unlike `forceLayout` in graph-layout.ts) — districts are
 * meant to read as fixed places, not a free-floating network. Operators
 * are arranged in a small ring inside their district rather than a desk
 * grid, since a district is a platform, not a room.
 */
export function officeLayout(nodes: MapNode[], edges: MapEdge[]): OfficeLayout {
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

  const childCompanyIds = new Set(
    edges.filter((e) => e.relation === "owns").map((e) => e.target),
  );
  const central = companies.find((c) => !childCompanyIds.has(c.id)) ?? companies[0] ?? null;
  const children = companies.filter((c) => c.id !== central?.id);

  const districts: OfficeDistrict[] = [];
  const agents: OfficeAgentPosition[] = [];

  function placeAgentsAround(district: OfficeDistrict, companyAgents: MapNode[]) {
    const ringRadius = Math.min(
      district.radius * 0.85,
      AGENT_RING_MIN + companyAgents.length * AGENT_RING_PER_AGENT,
    );
    companyAgents.forEach((agent, i) => {
      // Starts at 0 (not -PI/2, i.e. spreads left/right first, not
      // front/back) so a 2-Operator district doesn't stack both Operators
      // on the same axis the district's own label is offset along below —
      // avoided a real label-collision bug caught by a screenshot, not by
      // the math (see OfficeScene3D.tsx's District label height comment).
      const angle = (i / Math.max(companyAgents.length, 1)) * Math.PI * 2;
      agents.push({
        agentId: agent.id,
        companyId: district.companyId,
        label: agent.label,
        x: district.x + Math.cos(angle) * ringRadius,
        y: district.y + Math.sin(angle) * ringRadius,
        lastRunAt: agent.lastRunAt,
        lastRunStatus: agent.lastRunStatus,
        hasPendingApproval: agent.hasPendingApproval,
        status: agent.status,
        scope: agent.scope,
        departmentId: agent.departmentId,
        roleTitle: agent.roleTitle,
        openTaskCount: agent.openTaskCount ?? 0,
        blockedTaskCount: agent.blockedTaskCount ?? 0,
      });
    });
  }

  if (central) {
    const centralAgents = agentsByCompany.get(central.id) ?? [];
    const centralDistrict: OfficeDistrict = {
      companyId: central.id,
      label: central.label,
      x: 0,
      y: 0,
      radius: CENTRAL_RADIUS,
      isCentral: true,
      industry: central.industry,
    };
    districts.push(centralDistrict);
    placeAgentsAround(centralDistrict, centralAgents);
  }

  children.forEach((company, i) => {
    const companyAgents = agentsByCompany.get(company.id) ?? [];
    const radius = CHILD_BASE_RADIUS + Math.max(0, companyAgents.length - 1) * CHILD_RADIUS_PER_AGENT;
    const angle = (i / Math.max(children.length, 1)) * Math.PI * 2 - Math.PI / 2;
    const orbitRadius = CENTRAL_RADIUS + ORBIT_GAP + radius;
    const district: OfficeDistrict = {
      companyId: company.id,
      label: company.label,
      x: Math.cos(angle) * orbitRadius,
      y: Math.sin(angle) * orbitRadius,
      radius,
      isCentral: false,
      industry: company.industry,
    };
    districts.push(district);
    placeAgentsAround(district, companyAgents);
  });

  const maxExtent = districts.reduce((max, d) => {
    const dist = Math.hypot(d.x, d.y) + d.radius;
    return Math.max(max, dist);
  }, CENTRAL_RADIUS);

  return {
    districts,
    agents,
    width: maxExtent * 2,
    height: maxExtent * 2,
    centralCompanyId: central?.id ?? null,
  };
}
