"use client";

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { OrbitControls, Html, useGLTF, useAnimations } from "@react-three/drei";
import { clone as cloneSkeleton } from "three/examples/jsm/utils/SkeletonUtils.js";

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

// CesiumMan (CC BY 4.0, © 2017 Cesium — see public/models/CesiumMan.LICENSE.md),
// the standard rigged/skinned/animated reference character three.js's own
// examples use for exactly this purpose. Preloaded once at module scope so
// every agent instance shares the same cached GLTF (each still gets its
// own SkeletonUtils clone + AnimationMixer below — a skinned mesh can't
// share a single scene graph across multiple positions, since bones are
// referenced, not copied, by a plain object clone).
const AGENT_MODEL_PATH = "/models/CesiumMan.glb";
useGLTF.preload(AGENT_MODEL_PATH);

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

/**
 * A real animated, rigged, skinned character (CesiumMan) — the founder
 * asked for this after being told the literal Pixar-quality version needs
 * a dedicated 3D artist. This is the honest middle ground: a genuine
 * walk-cycle animation, not custom character art, sourced from an
 * existing CC-BY reference model.
 *
 * The walk cycle itself is ambient scene life, same category as the 2D
 * /map's "idle nodes breathe gently" — it never implies a real event on
 * its own. The ring beneath the character is the actual data-driven
 * signal: it only lights up when `live` (a real recent agent_runs
 * timestamp) says so.
 */
function AgentCharacter({
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
  const group = useRef<THREE.Group>(null);
  const { scene, animations } = useGLTF(AGENT_MODEL_PATH);
  const clonedScene = useMemo(() => cloneSkeleton(scene), [scene]);
  const { actions, names } = useAnimations(animations, group);

  useEffect(() => {
    const action = names[0] ? actions[names[0]] : undefined;
    action?.reset().fadeIn(0.3).play();
    return () => {
      action?.fadeOut(0.3);
    };
  }, [actions, names]);

  const ringMaterialRef = useRef<THREE.MeshBasicMaterial>(null);
  useFrame((state) => {
    if (!ringMaterialRef.current) return;
    ringMaterialRef.current.opacity = live
      ? 0.4 + Math.sin(state.clock.elapsedTime * 4) * 0.3
      : selected
        ? 0.35
        : 0;
  });

  return (
    <group
      position={[x, 0, z]}
      onClick={(e) => {
        e.stopPropagation();
        onSelect();
      }}
    >
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.2, 0]}>
        <ringGeometry args={[9, 11, 32]} />
        <meshBasicMaterial ref={ringMaterialRef} color={selected ? "#ffffff" : "#8fd3a0"} transparent opacity={0} />
      </mesh>
      <primitive ref={group} object={clonedScene} scale={24} />
      <group position={[0, 40, 0]}>
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

      <Suspense fallback={null}>
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
            <AgentCharacter
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
      </Suspense>

      <OrbitControls enablePan maxPolarAngle={Math.PI / 2.05} />
    </Canvas>
  );
}
