export interface GraphNode {
  id: string;
  type: string;
  label: string;
}
export interface GraphEdge {
  source: string;
  target: string;
  relation: string;
}
export interface PositionedNode extends GraphNode {
  x: number;
  y: number;
}

export const GRAPH_WIDTH = 800;
export const GRAPH_HEIGHT = 480;

/**
 * A small hand-rolled force-directed layout (repulsion + spring + center
 * pull, run for a fixed number of iterations) — deliberately not a new
 * dependency (d3-force, React Flow): the graphs using this (`/graph`,
 * `/map`, `/hq`) are a few dozen nodes at most, and this is a few dozen
 * lines. Generic over the node type so callers with extra fields (e.g.
 * `/map` and `/hq`'s `lastRunAt`) get them back typed, not just at runtime.
 */
export function forceLayout<T extends GraphNode>(nodes: T[], edges: GraphEdge[]): (T & { x: number; y: number })[] {
  const positioned: (T & { x: number; y: number })[] = nodes.map((n, i) => {
    const angle = (i / Math.max(nodes.length, 1)) * Math.PI * 2;
    return {
      ...n,
      x: GRAPH_WIDTH / 2 + Math.cos(angle) * 150,
      y: GRAPH_HEIGHT / 2 + Math.sin(angle) * 150,
    };
  });
  const byId = new Map(positioned.map((n) => [n.id, n]));

  const REPULSION = 6000;
  const SPRING = 0.02;
  const SPRING_LENGTH = 140;
  const CENTER_PULL = 0.01;

  for (let iter = 0; iter < 300; iter++) {
    const forces = new Map<string, { fx: number; fy: number }>();
    for (const n of positioned) forces.set(n.id, { fx: 0, fy: 0 });

    for (let i = 0; i < positioned.length; i++) {
      for (let j = i + 1; j < positioned.length; j++) {
        const a = positioned[i];
        const b = positioned[j];
        const dx = a.x - b.x;
        const dy = a.y - b.y;
        const distSq = Math.max(dx * dx + dy * dy, 1);
        const dist = Math.sqrt(distSq);
        const force = REPULSION / distSq;
        const fx = (dx / dist) * force;
        const fy = (dy / dist) * force;
        forces.get(a.id)!.fx += fx;
        forces.get(a.id)!.fy += fy;
        forces.get(b.id)!.fx -= fx;
        forces.get(b.id)!.fy -= fy;
      }
    }

    for (const e of edges) {
      const a = byId.get(e.source);
      const b = byId.get(e.target);
      if (!a || !b) continue;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const dist = Math.max(Math.sqrt(dx * dx + dy * dy), 1);
      const displacement = dist - SPRING_LENGTH;
      const fx = (dx / dist) * displacement * SPRING;
      const fy = (dy / dist) * displacement * SPRING;
      forces.get(a.id)!.fx += fx;
      forces.get(a.id)!.fy += fy;
      forces.get(b.id)!.fx -= fx;
      forces.get(b.id)!.fy -= fy;
    }

    for (const n of positioned) {
      const f = forces.get(n.id)!;
      f.fx += (GRAPH_WIDTH / 2 - n.x) * CENTER_PULL;
      f.fy += (GRAPH_HEIGHT / 2 - n.y) * CENTER_PULL;
      n.x = Math.min(Math.max(n.x + f.fx, 30), GRAPH_WIDTH - 30);
      n.y = Math.min(Math.max(n.y + f.fy, 30), GRAPH_HEIGHT - 30);
    }
  }

  return positioned;
}

export function colorForNodeType(type: string): string {
  switch (type) {
    case "company":
      return "#7c9cff";
    case "agent":
      return "#8fd3a0";
    case "document":
      return "#e0b35c";
    case "decision":
      return "#d98cd8";
    case "department":
      return "#6ab8d6";
    case "project":
      return "#f2a65a";
    case "task":
      return "#a0d98c";
    default:
      return "#9aa4b2";
  }
}
