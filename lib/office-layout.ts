import type { MapEdge, MapNode } from "@/app/api/map/route";

export interface OfficeRoom {
  companyId: string;
  label: string;
  x: number;
  y: number;
  width: number;
  height: number;
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
}

export interface OfficeLayout {
  rooms: OfficeRoom[];
  agents: OfficeAgentPosition[];
  width: number;
  height: number;
}

const ROOM_GAP = 24;
const ROOM_PADDING = 20;
const ROOM_HEADER = 30;
const AGENT_SLOT = 54;
const AGENTS_PER_ROW = 3;
const ROOM_MIN_WIDTH = AGENT_SLOT * 2 + ROOM_PADDING * 2;

/**
 * A deterministic grid "floor plan" — no force simulation needed, unlike
 * `forceLayout` (lib/graph-layout.ts), since rooms are meant to read as
 * distinct company areas, not a free-floating network. Each company gets
 * one room sized to fit its agents in a small grid; rooms themselves flow
 * left-to-right, wrapping into rows that fit a target canvas width.
 */
export function officeLayout(nodes: MapNode[], edges: MapEdge[], targetWidth = 900): OfficeLayout {
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

  const rooms: OfficeRoom[] = [];
  const agents: OfficeAgentPosition[] = [];

  let cursorX = ROOM_GAP;
  let cursorY = ROOM_GAP;
  let rowHeight = 0;
  let maxWidthUsed = 0;

  for (const company of companies) {
    const companyAgents = agentsByCompany.get(company.id) ?? [];
    const cols = Math.max(1, Math.min(AGENTS_PER_ROW, companyAgents.length));
    const rows = Math.max(1, Math.ceil(companyAgents.length / AGENTS_PER_ROW));
    const width = Math.max(ROOM_MIN_WIDTH, cols * AGENT_SLOT + ROOM_PADDING * 2);
    const height = ROOM_HEADER + rows * AGENT_SLOT + ROOM_PADDING;

    if (cursorX + width + ROOM_GAP > targetWidth && cursorX > ROOM_GAP) {
      cursorX = ROOM_GAP;
      cursorY += rowHeight + ROOM_GAP;
      rowHeight = 0;
    }

    const room: OfficeRoom = { companyId: company.id, label: company.label, x: cursorX, y: cursorY, width, height };
    rooms.push(room);

    companyAgents.forEach((agent, i) => {
      const col = i % AGENTS_PER_ROW;
      const row = Math.floor(i / AGENTS_PER_ROW);
      agents.push({
        agentId: agent.id,
        companyId: company.id,
        label: agent.label,
        x: room.x + ROOM_PADDING + col * AGENT_SLOT + AGENT_SLOT / 2,
        y: room.y + ROOM_HEADER + row * AGENT_SLOT + AGENT_SLOT / 2,
        lastRunAt: agent.lastRunAt,
        lastRunStatus: agent.lastRunStatus,
        hasPendingApproval: agent.hasPendingApproval,
      });
    });

    cursorX += width + ROOM_GAP;
    rowHeight = Math.max(rowHeight, height);
    maxWidthUsed = Math.max(maxWidthUsed, cursorX);
  }

  return {
    rooms,
    agents,
    width: Math.max(maxWidthUsed, targetWidth),
    height: cursorY + rowHeight + ROOM_GAP,
  };
}
