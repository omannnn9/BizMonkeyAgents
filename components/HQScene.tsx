"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { OrbitControls, Html } from "@react-three/drei";

// Labels use drei's <Html> (a positioned DOM overlay using the app's own
// CSS/fonts) rather than <Text> (troika-three-text, which fetches a font
// file over the network by default) — this sandbox's egress policy blocks
// arbitrary font hosts the same way it blocked Sentry's ingest host
// earlier, which silently broke the whole scene when <Text> was used.
function Label({ children, color = "#cfd3da" }: { children: React.ReactNode; color?: string }) {
  return (
    <Html center style={{ color, fontSize: "11px", whiteSpace: "nowrap", pointerEvents: "none" }}>
      {children}
    </Html>
  );
}
import type * as THREE from "three";
import { forceLayout, GRAPH_WIDTH, GRAPH_HEIGHT, type GraphEdge } from "@/lib/graph-layout";

export interface HQNode {
  id: string;
  type: "company" | "agent";
  label: string;
  lastRunAt: string | null;
}

const RECENT_MS = 10 * 60 * 1000; // matches /map's "is this agent live" window

function CompanyPedestal({ x, z, label }: { x: number; z: number; label: string }) {
  return (
    <group position={[x, 0, z]}>
      <mesh position={[0, 6, 0]}>
        <boxGeometry args={[28, 12, 28]} />
        <meshStandardMaterial color="#7c9cff" />
      </mesh>
      <group position={[0, 16, 0]}>
        <Label color="white">{label}</Label>
      </group>
    </group>
  );
}

function AgentMarker({
  x,
  z,
  label,
  live,
  selected,
  onSelect,
}: {
  x: number;
  z: number;
  label: string;
  live: boolean;
  selected: boolean;
  onSelect: () => void;
}) {
  const materialRef = useRef<THREE.MeshStandardMaterial>(null);

  // Emissive pulse driven only by a real recent agent_runs timestamp
  // (passed in as `live`) — never a decorative animation on its own, same
  // rule as the 2D /map.
  useFrame((state) => {
    if (!materialRef.current) return;
    materialRef.current.emissiveIntensity = live
      ? 0.6 + Math.sin(state.clock.elapsedTime * 4) * 0.4
      : 0.1;
  });

  return (
    <group
      position={[x, 10, z]}
      onClick={(e) => {
        e.stopPropagation();
        onSelect();
      }}
    >
      <mesh>
        <sphereGeometry args={[selected ? 5 : 4, 16, 16]} />
        <meshStandardMaterial ref={materialRef} color="#8fd3a0" emissive="#8fd3a0" emissiveIntensity={0.1} />
      </mesh>
      <group position={[0, 8, 0]}>
        <Label>{label}</Label>
      </group>
    </group>
  );
}

/**
 * A single marker, not a character — deliberately. The architecture doc's
 * own critical review flags Pixar-quality human character animation as the
 * single biggest risk in this phase, normally a dedicated-artist job, not
 * something to approximate with a humanoid-shaped primitive.
 */
function FounderMarker({ x, z }: { x: number; z: number }) {
  return (
    <group position={[x, 22, z]}>
      <mesh>
        <coneGeometry args={[6, 14, 4]} />
        <meshStandardMaterial color="#e0b35c" />
      </mesh>
      <group position={[0, 12, 0]}>
        <Label color="#e0b35c">Founder</Label>
      </group>
    </group>
  );
}

export function HQScene({
  nodes,
  edges,
  selectedId,
  onSelect,
}: {
  nodes: HQNode[];
  edges: GraphEdge[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const positioned = useMemo(() => forceLayout(nodes, edges), [nodes, edges]);

  // /api/map's nodes don't carry parent_id — the group-level company is
  // derived here the same way it's true everywhere else in the schema:
  // it's the one company that's never the target of an "owns" edge.
  const rootCompanyId = useMemo(() => {
    const ownedIds = new Set(edges.filter((e) => e.relation === "owns").map((e) => e.target));
    return nodes.find((n) => n.type === "company" && !ownedIds.has(n.id))?.id;
  }, [nodes, edges]);

  // A ticking `now` in state, not a direct Date.now() read during render
  // (React's purity rule) — only needs to be fresh enough to flip the
  // 10-minute "live" window, not every frame.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const tick = setInterval(() => setNow(Date.now()), 5_000);
    return () => clearInterval(tick);
  }, []);

  return (
    <Canvas camera={{ position: [0, 220, 320], fov: 50 }}>
      <color attach="background" args={["#0b0d12"]} />
      <ambientLight intensity={0.6} />
      <directionalLight position={[150, 250, 150]} intensity={0.9} />
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -1, 0]}>
        <planeGeometry args={[GRAPH_WIDTH * 1.4, GRAPH_HEIGHT * 1.4]} />
        <meshStandardMaterial color="#151820" />
      </mesh>

      {positioned.map((n) => {
        const x = n.x - GRAPH_WIDTH / 2;
        const z = n.y - GRAPH_HEIGHT / 2;

        if (n.type === "company") {
          return (
            <group
              key={n.id}
              onClick={(e) => {
                e.stopPropagation();
                onSelect(n.id);
              }}
            >
              <CompanyPedestal x={x} z={z} label={n.label} />
              {n.id === rootCompanyId && <FounderMarker x={x} z={z - 24} />}
            </group>
          );
        }

        const live = !!n.lastRunAt && now - new Date(n.lastRunAt).getTime() < RECENT_MS;
        return (
          <AgentMarker
            key={n.id}
            x={x}
            z={z}
            label={n.label}
            live={live}
            selected={selectedId === n.id}
            onSelect={() => onSelect(n.id)}
          />
        );
      })}

      <OrbitControls enablePan maxPolarAngle={Math.PI / 2.05} />
    </Canvas>
  );
}
