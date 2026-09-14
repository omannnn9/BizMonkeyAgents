"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import type * as THREE from "three";
import type { OfficeAgentPosition, OfficeDistrict, OfficeLayout } from "@/lib/office-layout";
import { deriveAgentState, STATE_COLOR, type AgentVisualState } from "@/lib/agent-visual-state";
import { deriveAgentRank } from "@/lib/agent-title";

// World units per layout unit — lib/office-layout.ts's radial colony
// layout stays the single source of truth for where every district/Operator
// sits; this view just re-reads those same x/y numbers as a floor plan
// instead of abstract layout units. Chosen (same reasoning as the prior
// grid-office pass) so a district's footprint lands proportionate to a
// ~1-unit-tall character — get this wrong and characters become invisible
// slivers against the whole colony, a real bug this project already hit
// once; verified against a real screenshot again this pass, not just math.
const SCALE = 40;

// Lego-minifigure palette: one flat, saturated color per Operator, hashed
// from the agent id. A paired, desaturated "sleeping" variant so a dormant
// Operator visibly reads as dormant at a glance, not just via its halo.
const CHARACTER_COLORS = ["#f2c14e", "#4d96ff", "#6bcb77", "#b57edc", "#ff8c5a", "#ff6b9d"];
const CHARACTER_COLORS_SLEEP = ["#8a7a52", "#425a7a", "#4d6b55", "#6b5a7a", "#7a5a48", "#7a4d5e"];

function hashToIndex(id: string, mod: number): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return h % mod;
}

// Deterministic per-district platform tint, same hashing approach as the
// character palette above, over a distinct hue set so districts read as
// visually separate zones on sight rather than identical grey platforms.
const DISTRICT_TINTS = ["#1d2a45", "#1f3a33", "#3a2440", "#402a1f", "#233a40"];

function Label({ children, color = "#cfd3da" }: { children: React.ReactNode; color?: string }) {
  // A DOM overlay (the app's own CSS/fonts), not drei's <Text> — <Text>
  // (troika-three-text) fetches a font file over the network and silently
  // breaks in this network-restricted sandbox. Learned the hard way
  // building the retired /hq scene; not relearning it. Same reasoning is
  // why the colony's atmosphere below is a hand-rolled point cloud rather
  // than drei's <Stars> — no unfamiliar component's asset-loading behavior
  // to verify under this sandbox's restrictions.
  return (
    <Html center style={{ color, fontSize: "11px", whiteSpace: "nowrap", pointerEvents: "none" }}>
      {children}
    </Html>
  );
}

// Deterministic pseudo-random (mulberry32) rather than Math.random() — the
// starfield is pure atmosphere with no data behind it, but React's purity
// rule still forbids an impure function call during render (even memoized,
// useMemo's body still runs as part of render on a cache miss); a seeded
// generator is a pure function of its seed, so it satisfies that rule while
// still looking randomly scattered.
function seededRandom(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function Starfield({ radius }: { radius: number }) {
  const positions = useMemo(() => {
    const rand = seededRandom(1337);
    const count = 240;
    const arr = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      const r = radius * (1.15 + rand() * 1.6);
      const theta = rand() * Math.PI * 2;
      arr[i * 3] = Math.cos(theta) * r;
      arr[i * 3 + 1] = rand() * radius * 0.9 + 1.5;
      arr[i * 3 + 2] = Math.sin(theta) * r;
    }
    return arr;
  }, [radius]);

  return (
    <points>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
      </bufferGeometry>
      <pointsMaterial color="#5a6b99" size={0.045} sizeAttenuation transparent opacity={0.55} />
    </points>
  );
}

function Bridge({
  to,
  active,
}: {
  to: [number, number];
  active: boolean;
}) {
  const [dx, dz] = to;
  const length = Math.hypot(dx, dz);
  if (length < 0.001) return null;
  const rotationY = Math.atan2(-dz, dx);
  return (
    <mesh position={[dx / 2, 0.02, dz / 2]} rotation={[0, rotationY, 0]}>
      <boxGeometry args={[length, 0.02, 0.12]} />
      <meshStandardMaterial
        color={active ? "#5aa9ff" : "#232c47"}
        emissive={active ? "#5aa9ff" : "#000000"}
        emissiveIntensity={active ? 0.85 : 0}
      />
    </mesh>
  );
}

function District({
  district,
  isActive,
  onSelect,
}: {
  district: OfficeDistrict;
  isActive: boolean;
  onSelect: () => void;
}) {
  const r = district.radius / SCALE;
  const tint = DISTRICT_TINTS[hashToIndex(district.companyId, DISTRICT_TINTS.length)];

  return (
    <group>
      <mesh
        position={[0, -0.06, 0]}
        onClick={(e) => {
          e.stopPropagation();
          onSelect();
        }}
      >
        <cylinderGeometry args={[r, r, 0.12, 48]} />
        <meshStandardMaterial
          color={tint}
          emissive={tint}
          emissiveIntensity={isActive ? 0.5 : district.isCentral ? 0.2 : 0.08}
        />
      </mesh>

      {isActive && (
        <mesh position={[0, 0.01, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[r - 0.05, r, 48]} />
          <meshBasicMaterial color="#5aa9ff" transparent opacity={0.55} />
        </mesh>
      )}

      {/* Well above the tallest Operator's own label (~1.4-1.5 world
          units) so the two never visually collide from the colony's
          steep, near-overhead camera angle — a real overlap this pass
          caught on a screenshot with a lower placement. */}
      <group position={[0, district.isCentral ? 3.4 : 2.8, -r * 0.4]}>
        <Label color={isActive ? "#cfe4ff" : district.isCentral ? "#a9c6ff" : "#7c88ad"}>
          {district.isCentral ? `${district.label} — Central Command` : district.label}
        </Label>
      </group>
    </group>
  );
}

function ExecutingFX({ active }: { active: boolean }) {
  const swirlRef = useRef<THREE.Group>(null);
  const streamRef = useRef<THREE.Group>(null);
  const [motif, setMotif] = useState(0);

  useFrame((frameState) => {
    if (!active) return;
    const t = frameState.clock.elapsedTime;
    const nextMotif = Math.floor(t / 1.5) % 2;
    if (nextMotif !== motif) setMotif(nextMotif);
    if (swirlRef.current) swirlRef.current.rotation.y = t * 2.2;
    if (streamRef.current) {
      streamRef.current.children.forEach((child, i) => {
        child.position.y = ((t * 0.6 + i * 0.3) % 1) * 0.55;
      });
    }
  });

  if (!active) return null;

  return (
    <group position={[0, 1.42, 0]}>
      <group ref={swirlRef} visible={motif === 0}>
        {[0, 1, 2, 3].map((i) => {
          const a = (i / 4) * Math.PI * 2;
          return (
            <mesh key={i} position={[Math.cos(a) * 0.16, 0, Math.sin(a) * 0.16]}>
              <sphereGeometry args={[0.018, 6, 6]} />
              <meshBasicMaterial color="#bfe0ff" />
            </mesh>
          );
        })}
      </group>
      <group ref={streamRef} visible={motif === 1}>
        {[0, 1, 2].map((i) => (
          <mesh key={i} position={[(i - 1) * 0.08, 0, 0]}>
            <boxGeometry args={[0.03, 0.03, 0.03]} />
            <meshBasicMaterial color="#8fd3ff" />
          </mesh>
        ))}
      </group>
    </group>
  );
}

function AgentFigure({
  agent,
  isWorking,
  selected,
  now,
  onSelect,
}: {
  agent: OfficeAgentPosition;
  isWorking: boolean;
  selected: boolean;
  now: number;
  onSelect: () => void;
}) {
  const colorIndex = hashToIndex(agent.agentId, CHARACTER_COLORS.length);
  const state: AgentVisualState = deriveAgentState(agent, isWorking, now);
  const rank = deriveAgentRank({ scope: agent.scope ?? "company", departmentId: agent.departmentId, roleTitle: agent.roleTitle });
  const glowColor = STATE_COLOR[state];
  const bodyColor = state === "sleeping" ? CHARACTER_COLORS_SLEEP[colorIndex] : CHARACTER_COLORS[colorIndex];
  const glowRef = useRef<THREE.Mesh>(null);
  const lightRef = useRef<THREE.PointLight>(null);

  useFrame((frameState) => {
    if (!glowRef.current || !lightRef.current) return;
    const pulse = state === "executing" ? 0.6 + 0.4 * Math.sin(frameState.clock.elapsedTime * 4) : 1;
    const scale = glowColor ? 0.14 * pulse : 0;
    glowRef.current.scale.setScalar(scale > 0 ? scale : 0.0001);
    lightRef.current.intensity = glowColor ? 1.1 * pulse : 0;
  });

  return (
    <group>
      {/* Console desk — a HUD-styled station rather than literal office
          furniture, since this Operator stands on a colony platform, not
          in a room. The screen edge is real state, not decorative: lit
          only once this Operator has ever produced a run. */}
      <mesh position={[0, 0.4, -0.5]}>
        <boxGeometry args={[0.9, 0.05, 0.55]} />
        <meshStandardMaterial color="#232a3d" metalness={0.3} roughness={0.6} />
      </mesh>
      <mesh position={[0, 0.2, -0.7]}>
        <boxGeometry args={[0.06, 0.4, 0.06]} />
        <meshStandardMaterial color="#181d29" />
      </mesh>
      <mesh position={[0, 0.2, -0.3]}>
        <boxGeometry args={[0.06, 0.4, 0.06]} />
        <meshStandardMaterial color="#181d29" />
      </mesh>
      <mesh position={[0, 0.62, -0.7]}>
        <boxGeometry args={[0.32, 0.22, 0.03]} />
        <meshStandardMaterial
          color={agent.lastRunAt ? "#0a2a3a" : "#151823"}
          emissive={agent.lastRunAt ? "#3dc7dc" : "#000000"}
          emissiveIntensity={agent.lastRunAt ? 0.85 : 0}
        />
      </mesh>

      {/* Character */}
      <group
        position={[0, 0, 0.35]}
        onClick={(e) => {
          e.stopPropagation();
          onSelect();
        }}
      >
        <mesh position={[0, 0.62, 0]}>
          <capsuleGeometry args={[0.25, 0.58, 4, 12]} />
          <meshStandardMaterial color={bodyColor} />
        </mesh>
        <mesh position={[0, 1.18, 0]}>
          <sphereGeometry args={[0.22, 16, 16]} />
          <meshStandardMaterial color={bodyColor} />
        </mesh>

        {selected && (
          <mesh position={[0, 0.55, 0]} rotation={[Math.PI / 2, 0, 0]}>
            <torusGeometry args={[0.42, 0.02, 8, 32]} />
            <meshBasicMaterial color="#ffffff" />
          </mesh>
        )}

        <pointLight ref={lightRef} position={[0, 1.45, 0]} color={glowColor ?? "#ffffff"} distance={1.9} />
        <mesh ref={glowRef} position={[0, 1.45, 0]}>
          <sphereGeometry args={[1, 12, 12]} />
          <meshBasicMaterial color={glowColor ?? "#000000"} transparent opacity={0.85} />
        </mesh>

        <ExecutingFX active={state === "executing"} />

        <group position={[0, 1.42, 0]}>
          <Label>
            <div style={{ textAlign: "center" }}>
              <div>{agent.label.split(" ")[0]}</div>
              <div style={{ fontSize: "8px", opacity: 0.75 }}>{rank}</div>
            </div>
          </Label>
        </group>
      </group>
    </group>
  );
}

function SceneContents({
  layout,
  workingAgentIds,
  selectedAgentId,
  activeCompanyId,
  now,
  onSelectAgent,
  onSelectCompany,
}: {
  layout: OfficeLayout;
  workingAgentIds: Set<string>;
  selectedAgentId: string | null;
  activeCompanyId: string | null;
  now: number;
  onSelectAgent: (agentId: string) => void;
  onSelectCompany: (companyId: string) => void;
}) {
  const sceneRadius = Math.max(layout.width, layout.height) / 2 / SCALE;

  return (
    <>
      <Starfield radius={Math.max(sceneRadius, 6)} />

      {layout.districts
        .filter((d) => !d.isCentral)
        .map((d) => (
          <Bridge
            key={`bridge-${d.companyId}`}
            to={[d.x / SCALE, d.y / SCALE]}
            active={activeCompanyId !== null && d.companyId === `company:${activeCompanyId}`}
          />
        ))}

      {layout.districts.map((district) => {
        const isActive = activeCompanyId !== null && district.companyId === `company:${activeCompanyId}`;
        const cx = district.x / SCALE;
        const cz = district.y / SCALE;
        return (
          <group key={district.companyId} position={[cx, 0, cz]}>
            <District
              district={district}
              isActive={isActive}
              onSelect={() => onSelectCompany(district.companyId.replace(/^company:/, ""))}
            />
          </group>
        );
      })}

      {layout.agents.map((agent) => {
        const x = agent.x / SCALE;
        const z = agent.y / SCALE;
        return (
          <group key={agent.agentId} position={[x, 0, z]}>
            <AgentFigure
              agent={agent}
              isWorking={workingAgentIds.has(agent.agentId)}
              selected={selectedAgentId === agent.agentId}
              now={now}
              onSelect={() => onSelectAgent(agent.agentId)}
            />
          </group>
        );
      })}
    </>
  );
}

export function OfficeScene3D({
  layout,
  workingAgentIds,
  selectedAgentId,
  activeCompanyId,
  onSelectAgent,
  onSelectCompany,
}: {
  layout: OfficeLayout;
  workingAgentIds: Set<string>;
  selectedAgentId: string | null;
  activeCompanyId: string | null;
  onSelectAgent: (agentId: string) => void;
  onSelectCompany: (companyId: string) => void;
}) {
  // `layout.width`/`height` are already a full diameter (office-layout.ts
  // computes them as 2x the farthest district's extent from the origin) —
  // "dist" needs that same full-diameter quantity, not a radius, to match
  // the proven camera-framing ratios below. Halving it here was the exact
  // shape of the invisible-character bug this project already hit once on
  // the old grid layout — caught again this pass by actually looking at a
  // screenshot before calling the colony rewrite done, not by the math
  // alone. See app/globals.css's SCALE comment above for the earlier story.
  const dist = Math.max(Math.max(layout.width, layout.height) / SCALE, 6);

  // A ticking clock in state, not a direct Date.now() read during render —
  // only needs to be fresh enough to flip the "delivered"/"sleeping"
  // windows, same pattern the rest of this app uses.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const tick = setInterval(() => setNow(Date.now()), 5_000);
    return () => clearInterval(tick);
  }, []);

  return (
    <Canvas
      // A left-to-right grid (the old /office layout) only ever extended
      // away from a camera parked on one side, so a modest 3/4 angle framed
      // it fine. A 360-degree radial colony doesn't: districts on the
      // camera's own side get foreshortened close to the lens while the
      // far side recedes, so the same modest angle clips whichever
      // districts happen to sit nearest the camera. A steeper, more
      // overhead "strategy game" angle (which also just suits the brief
      // better) sees the full circle evenly regardless of which way a
      // district happens to orbit — caught by actually looking at a
      // screenshot with the old 3/4 angle first, not by the math alone.
      camera={{ position: [0, dist * 1.6, dist * 0.75], fov: 42 }}
      gl={{ antialias: true }}
      role="img"
      aria-label="Colony scene"
    >
      <color attach="background" args={["#05060a"]} />
      <fog attach="fog" args={["#05060a", dist * 1.9, dist * 4.6]} />
      <ambientLight intensity={0.5} />
      <directionalLight position={[dist * 0.4, dist * 0.9, dist * 0.3]} intensity={0.65} />

      <SceneContents
        layout={layout}
        workingAgentIds={workingAgentIds}
        selectedAgentId={selectedAgentId}
        activeCompanyId={activeCompanyId}
        now={now}
        onSelectAgent={onSelectAgent}
        onSelectCompany={onSelectCompany}
      />
    </Canvas>
  );
}
