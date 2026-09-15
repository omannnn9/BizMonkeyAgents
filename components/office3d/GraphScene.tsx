"use client";

import { useMemo } from "react";
import { Canvas } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import { forceLayout, colorForNodeType, GRAPH_WIDTH, GRAPH_HEIGHT, type GraphNode, type GraphEdge } from "@/lib/graph-layout";

// Layout units -> world units. Chosen generously and verified with a real
// screenshot, the same discipline that's caught a real camera-framing bug
// on every 3D pass this project has built.
const SCALE = 45;

/**
 * Depth isn't decoration here — it's a real encoding of what kind of thing
 * a node is and where it sits in the organization: companies/departments
 * form a foundation layer, agents/projects/tasks a working layer,
 * decisions/documents an output layer. The x/y within each band still
 * comes entirely from the existing, unchanged `forceLayout()` — this map
 * only adds a z offset on top of it.
 */
const TYPE_DEPTH: Record<string, number> = {
  company: -2.2,
  department: -2.2,
  agent: 0,
  project: 0,
  task: 0,
  decision: 2.2,
  document: 2.2,
};

function worldPosition(x: number, y: number, type: string): [number, number, number] {
  return [(x - GRAPH_WIDTH / 2) / SCALE, TYPE_DEPTH[type] ?? 0, (y - GRAPH_HEIGHT / 2) / SCALE];
}

function GraphEdgeLine({ from, to }: { from: [number, number, number]; to: [number, number, number] }) {
  const positions = useMemo(() => new Float32Array([...from, ...to]), [from, to]);
  return (
    <line>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
      </bufferGeometry>
      <lineBasicMaterial color="#5ad4ff" transparent opacity={0.45} />
    </line>
  );
}

function GraphNode3D({
  node,
  position,
  selected,
  onSelect,
}: {
  node: GraphNode;
  position: [number, number, number];
  selected: boolean;
  onSelect: () => void;
}) {
  const color = colorForNodeType(node.type);
  const size = 0.11;

  return (
    <group position={position}>
      <mesh>
        <sphereGeometry args={[size * 2.2, 10, 10]} />
        <meshBasicMaterial color={color} transparent opacity={selected ? 0.35 : 0.15} depthWrite={false} />
      </mesh>
      <mesh
        onClick={(e) => {
          e.stopPropagation();
          onSelect();
        }}
      >
        <sphereGeometry args={[size, 12, 12]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={selected ? 1.3 : 0.85} />
      </mesh>
      {selected && (
        <mesh>
          <sphereGeometry args={[size * 3, 12, 12]} />
          <meshBasicMaterial color={color} transparent opacity={0.15} depthWrite={false} />
        </mesh>
      )}
      <Html distanceFactor={9} position={[0, size * 2.5, 0]} style={{ pointerEvents: "none" }}>
        <div style={{ color: "#dbe6ff", fontSize: "11px", whiteSpace: "nowrap", textAlign: "center" }}>
          {node.label}
        </div>
      </Html>
    </group>
  );
}

export function GraphScene({
  nodes,
  edges,
  selectedId,
  onSelect,
}: {
  nodes: GraphNode[];
  edges: GraphEdge[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const positioned = useMemo(() => forceLayout(nodes, edges), [nodes, edges]);
  const positionById = useMemo(() => {
    const map = new Map<string, [number, number, number]>();
    for (const n of positioned) map.set(n.id, worldPosition(n.x, n.y, n.type));
    return map;
  }, [positioned]);

  // Real bounding radius from actual node positions (all three axes,
  // since the depth bands genuinely spread the scene along y too, not
  // just x/z) — never a fixed guess, so the camera always frames what's
  // actually there.
  const dist = useMemo(() => {
    let maxRadius = 2;
    for (const [x, y, z] of positionById.values()) {
      maxRadius = Math.max(maxRadius, Math.sqrt(x * x + y * y + z * z));
    }
    return Math.max(maxRadius * 2.6, 6);
  }, [positionById]);

  return (
    <Canvas
      // A flatter, more eye-level angle than the Organization layer's
      // near-overhead camera on purpose: the depth bands are the whole
      // point of this scene, and a steep top-down angle compresses them
      // into near-invisibility. Caught on the first real screenshot (the
      // company/agent bands barely separated at a steeper angle) and
      // fixed by lowering the elevation ratio, not by the math alone.
      camera={{ position: [0, dist * 0.2, dist * 1.05], fov: 50 }}
      gl={{ antialias: true }}
      role="img"
      aria-label="Knowledge graph"
    >
      <color attach="background" args={["#05060a"]} />
      <fog attach="fog" args={["#05060a", dist * 1.6, dist * 4]} />
      <ambientLight intensity={0.5} />
      <directionalLight position={[dist * 0.3, dist * 0.8, dist * 0.4]} intensity={0.6} />

      {edges.map((e, i) => {
        const from = positionById.get(e.source);
        const to = positionById.get(e.target);
        if (!from || !to) return null;
        return <GraphEdgeLine key={i} from={from} to={to} />;
      })}

      {positioned.map((n) => {
        const position = positionById.get(n.id);
        if (!position) return null;
        return (
          <GraphNode3D
            key={n.id}
            node={n}
            position={position}
            selected={selectedId === n.id}
            onSelect={() => onSelect(n.id)}
          />
        );
      })}
    </Canvas>
  );
}
