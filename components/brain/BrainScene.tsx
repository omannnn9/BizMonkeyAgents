"use client";

import { useEffect, useMemo, useRef } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import type * as THREE from "three";
import type { BrainDocument, BrainMemory, BrainSynergy } from "@/app/api/brain/route";

// Absolute world units, not a layout-pixel scale like the colony world or
// the hierarchy tree — there's no 2D layout step here, positions are
// computed directly on a sphere. Chosen generously and verified with a
// real screenshot, the same discipline that caught two real camera-
// framing bugs in the colony world and one in the hierarchy tree: a
// centered radial scene needs real margin between its content radius and
// the camera's visible radius, not a tight fit.
const CORE_BASE_RADIUS = 0.6;
const CORE_GROWTH = 0.35;
const SHELL_RATIO = 1.85;

const GROUP_COLOR = "#5ad4ff";
const FOUNDER_COLOR = "#ffd166";
const SCOPE_PALETTE = ["#f2c14e", "#4d96ff", "#6bcb77", "#b57edc", "#ff8c5a", "#ff6b9d"];

function hashToIndex(id: string, mod: number): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return h % mod;
}

function colorForMemory(m: BrainMemory): string {
  if (m.scope === "founder") return FOUNDER_COLOR;
  if (m.scope === "group") return GROUP_COLOR;
  return SCOPE_PALETTE[hashToIndex(m.scopeId ?? m.id, SCOPE_PALETTE.length)];
}

/** Same per-company hash as memories, so a document and a memory from the
 *  same company read as related at a glance — the shape (cube, not
 *  sphere) is what marks a node as a document, not a separate palette. */
function colorForDocument(d: BrainDocument): string {
  return SCOPE_PALETTE[hashToIndex(d.companyId, SCOPE_PALETTE.length)];
}

/** Even coverage of a sphere with no physics simulation — a dozen-line
 *  formula, the same "hand-roll it for a few dozen items" precedent
 *  graph-layout.ts's forceLayout and hierarchy-layout.ts's tree layout
 *  both already set, extended to 3D. */
function fibonacciSpherePoint(i: number, n: number, radius: number): [number, number, number] {
  const goldenAngle = Math.PI * (3 - Math.sqrt(5));
  const y = n > 1 ? 1 - (i / (n - 1)) * 2 : 0;
  const r = Math.sqrt(Math.max(0, 1 - y * y));
  const theta = goldenAngle * i;
  return [Math.cos(theta) * r * radius, y * radius, Math.sin(theta) * r * radius];
}

function bezierPoints(from: [number, number, number], to: [number, number, number], bow: number): Float32Array {
  const mid: [number, number, number] = [
    ((from[0] + to[0]) / 2) * bow,
    ((from[1] + to[1]) / 2) * bow,
    ((from[2] + to[2]) / 2) * bow,
  ];
  const segments = 16;
  const arr = new Float32Array((segments + 1) * 3);
  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    const it = 1 - t;
    arr[i * 3] = it * it * from[0] + 2 * it * t * mid[0] + t * t * to[0];
    arr[i * 3 + 1] = it * it * from[1] + 2 * it * t * mid[1] + t * t * to[1];
    arr[i * 3 + 2] = it * it * from[2] + 2 * it * t * mid[2] + t * t * to[2];
  }
  return arr;
}

function Core({ radius }: { radius: number }) {
  // Layered transparent shells at increasing radius / decreasing opacity —
  // a cheap stand-in for a real bloom pass (no post-processing pipeline in
  // this app) that reads as a soft glow halo rather than a flat painted
  // ball, which a single opaque sphere did on the first real screenshot.
  return (
    <group>
      <mesh>
        <sphereGeometry args={[radius * 1.9, 20, 20]} />
        <meshBasicMaterial color="#6ae0ff" transparent opacity={0.07} depthWrite={false} />
      </mesh>
      <mesh>
        <sphereGeometry args={[radius * 1.4, 24, 24]} />
        <meshBasicMaterial color="#6ae0ff" transparent opacity={0.14} depthWrite={false} />
      </mesh>
      <mesh>
        <sphereGeometry args={[radius, 32, 32]} />
        <meshStandardMaterial color="#123a8a" emissive="#4d8bff" emissiveIntensity={1.8} transparent opacity={0.7} />
      </mesh>
      <mesh>
        <sphereGeometry args={[radius * 1.01, 22, 22]} />
        <meshBasicMaterial color="#c5edff" wireframe transparent opacity={0.55} />
      </mesh>
      <pointLight color="#5ad4ff" intensity={2.4} distance={radius * 7} />
    </group>
  );
}

function SynergyArc({ from, to }: { from: [number, number, number]; to: [number, number, number] }) {
  const positions = useMemo(() => bezierPoints(from, to, 1.2), [from, to]);
  return (
    <line>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
      </bufferGeometry>
      <lineBasicMaterial color="#8fd3ff" transparent opacity={0.55} />
    </line>
  );
}

function MemoryNode({
  memory,
  position,
  isNew,
  selected,
  onSelect,
}: {
  memory: BrainMemory;
  position: [number, number, number];
  isNew: boolean;
  selected: boolean;
  onSelect: () => void;
}) {
  const size = 0.035 + memory.importance * 0.045;
  const color = colorForMemory(memory);
  const meshRef = useRef<THREE.Mesh>(null);
  const arrivalStartRef = useRef<number | null>(null);

  useEffect(() => {
    if (isNew) arrivalStartRef.current = performance.now();
  }, [isNew]);

  useFrame(() => {
    if (!meshRef.current) return;
    let scale = size;
    if (arrivalStartRef.current !== null) {
      const t = Math.min(1, (performance.now() - arrivalStartRef.current) / 600);
      scale = size * t;
    }
    meshRef.current.scale.setScalar(Math.max(scale, 0.001));
  });

  return (
    <group position={position}>
      <mesh>
        <sphereGeometry args={[size * 2.4, 10, 10]} />
        <meshBasicMaterial color={color} transparent opacity={selected ? 0.35 : 0.16} depthWrite={false} />
      </mesh>
      <mesh
        ref={meshRef}
        onClick={(e) => {
          e.stopPropagation();
          onSelect();
        }}
      >
        <sphereGeometry args={[1, 10, 10]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={selected ? 1.4 : 0.9} />
      </mesh>
      {selected && (
        <mesh>
          <sphereGeometry args={[size * 3.2, 12, 12]} />
          <meshBasicMaterial color={color} transparent opacity={0.15} depthWrite={false} />
        </mesh>
      )}
    </group>
  );
}

const DOCUMENT_NODE_SIZE = 0.055;

/** Same halo/click/arrival-animation structure as MemoryNode, but a cube
 *  instead of a sphere — documents are a different kind of thing than a
 *  memory, so they read as one on sight, not just via a tooltip. Clickable
 *  (like MemoryNode) so a document's real title/company/type surfaces in
 *  the same detail panel a memory click already opens — previously the
 *  only node type in this scene with no click handler at all. */
function DocumentNode({
  document,
  position,
  isNew,
  selected,
  onSelect,
}: {
  document: BrainDocument;
  position: [number, number, number];
  isNew: boolean;
  selected: boolean;
  onSelect: () => void;
}) {
  const size = DOCUMENT_NODE_SIZE;
  const color = colorForDocument(document);
  const meshRef = useRef<THREE.Mesh>(null);
  const arrivalStartRef = useRef<number | null>(null);

  useEffect(() => {
    if (isNew) arrivalStartRef.current = performance.now();
  }, [isNew]);

  useFrame(() => {
    if (!meshRef.current) return;
    let scale = size;
    if (arrivalStartRef.current !== null) {
      const t = Math.min(1, (performance.now() - arrivalStartRef.current) / 600);
      scale = size * t;
    }
    meshRef.current.scale.setScalar(Math.max(scale, 0.001));
  });

  return (
    <group position={position}>
      <mesh>
        <boxGeometry args={[size * 2.4, size * 2.4, size * 2.4]} />
        <meshBasicMaterial color={color} transparent opacity={selected ? 0.3 : 0.14} depthWrite={false} />
      </mesh>
      <mesh
        ref={meshRef}
        onClick={(e) => {
          e.stopPropagation();
          onSelect();
        }}
      >
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={selected ? 1.3 : 0.8} />
      </mesh>
      {selected && (
        <mesh>
          <boxGeometry args={[size * 3.2, size * 3.2, size * 3.2]} />
          <meshBasicMaterial color={color} transparent opacity={0.14} depthWrite={false} />
        </mesh>
      )}
    </group>
  );
}

export function BrainScene({
  totalMemoryCount,
  memories,
  documents,
  synergies,
  newlyArrivedIds,
  selectedId,
  onSelect,
}: {
  totalMemoryCount: number;
  memories: BrainMemory[];
  documents: BrainDocument[];
  synergies: BrainSynergy[];
  newlyArrivedIds: Set<string>;
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const coreRadius = CORE_BASE_RADIUS + Math.log(totalMemoryCount + 1) * CORE_GROWTH;
  const shellRadius = coreRadius * SHELL_RATIO;
  const dist = Math.max(shellRadius * 2.9, 5);

  // Memories and documents share one Fibonacci-sphere index space (memory
  // indices first, document indices after) rather than two independent
  // distributions, so the two node kinds never land on top of each other
  // regardless of their relative counts.
  const positionById = useMemo(() => {
    const map = new Map<string, [number, number, number]>();
    const total = memories.length + documents.length;
    memories.forEach((m, i) => map.set(m.id, fibonacciSpherePoint(i, total, shellRadius)));
    documents.forEach((d, i) => map.set(`doc:${d.id}`, fibonacciSpherePoint(memories.length + i, total, shellRadius)));
    return map;
  }, [memories, documents, shellRadius]);

  return (
    <Canvas
      camera={{ position: [0, dist * 0.5, dist * 0.85], fov: 45 }}
      gl={{ antialias: true }}
      role="img"
      aria-label="AI Brain"
    >
      <color attach="background" args={["#05060a"]} />
      <fog attach="fog" args={["#05060a", dist * 1.6, dist * 4]} />
      <ambientLight intensity={0.45} />
      <directionalLight position={[dist * 0.3, dist * 0.8, dist * 0.4]} intensity={0.5} />

      <Core radius={coreRadius} />

      {synergies.map((s, i) => {
        const from = positionById.get(s.memoryAId);
        const to = positionById.get(s.memoryBId);
        if (!from || !to) return null;
        return <SynergyArc key={i} from={from} to={to} />;
      })}

      {memories.map((m) => {
        const position = positionById.get(m.id);
        if (!position) return null;
        return (
          <MemoryNode
            key={m.id}
            memory={m}
            position={position}
            isNew={newlyArrivedIds.has(m.id)}
            selected={selectedId === m.id}
            onSelect={() => onSelect(m.id)}
          />
        );
      })}

      {documents.map((d) => {
        const position = positionById.get(`doc:${d.id}`);
        if (!position) return null;
        return (
          <DocumentNode
            key={d.id}
            document={d}
            position={position}
            isNew={newlyArrivedIds.has(`doc:${d.id}`)}
            selected={selectedId === `doc:${d.id}`}
            onSelect={() => onSelect(`doc:${d.id}`)}
          />
        );
      })}
    </Canvas>
  );
}
