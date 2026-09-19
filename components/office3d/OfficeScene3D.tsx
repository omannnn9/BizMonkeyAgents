"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import * as THREE from "three";
import type { OfficeAgentPosition, OfficeDistrict, OfficeLayout } from "@/lib/office-layout";
import { deriveAgentState, STATE_COLOR, type AgentVisualState } from "@/lib/agent-visual-state";
import { deriveAgentRank } from "@/lib/agent-title";
import type { CollaborationEdge } from "@/lib/collaboration";

export type { CollaborationEdge };

// World units per layout unit — lib/office-layout.ts's radial colony
// layout stays the single source of truth for where every district/Operator
// sits; this view just re-reads those same x/y numbers as a floor plan
// instead of abstract layout units. Chosen (same reasoning as the prior
// grid-office pass) so a district's footprint lands proportionate to a
// ~1-unit-tall character — get this wrong and characters become invisible
// slivers against the whole colony, a real bug this project already hit
// once; verified against a real screenshot again this pass, not just math.
const SCALE = 40;

// Per-Operator chassis palette: one saturated color hashed from the agent
// id, applied to the sleeker digital-operator silhouette below. A paired,
// desaturated "sleeping" variant so a dormant Operator visibly reads as
// dormant at a glance, not just via its halo.
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

// The angled-overhead ratios the fixed camera already used, factored out so
// both the initial static camera prop and the per-frame rig below stay in
// sync — one source of truth for "what this camera's shot looks like",
// never two numbers that can drift apart.
const CAMERA_HEIGHT_RATIO = 1.6;
const CAMERA_BACK_RATIO = 0.75;
const CAMERA_LERP_SPEED = 2.4;

// A district's own radius is much smaller than the whole colony's extent,
// so framing just one needs its own margin ratio relative to itself —
// tuned by a real screenshot before calling this done, the same discipline
// that already caught three camera-framing bugs in this project (colony
// world twice, the AI Brain once).
const FOCUS_DIST_MULTIPLIER = 4.5;
const FOCUS_MIN_DIST = 3.4;

function cameraPositionFor(cx: number, cz: number, dist: number): [number, number, number] {
  return [cx, dist * CAMERA_HEIGHT_RATIO, cz + dist * CAMERA_BACK_RATIO];
}

function colonyDist(layout: OfficeLayout): number {
  // Layout width/height are already a full diameter (office-layout.ts
  // computes them as 2x the farthest district's extent from the origin).
  return Math.max(Math.max(layout.width, layout.height) / SCALE, 6);
}

/** Command Mode always frames the whole colony (today's original fixed
 *  shot, made explicit and reachable on demand). Otherwise, frame just the
 *  active district tightly — falling back to the central district if none
 *  resolves, so the camera never has nothing to look at. */
function cameraTargetFor(
  layout: OfficeLayout,
  activeCompanyId: string | null,
  commandMode: boolean,
): { center: [number, number]; dist: number } {
  if (!commandMode) {
    const activeDistrict =
      layout.districts.find((d) => d.companyId === `company:${activeCompanyId}`) ??
      layout.districts.find((d) => d.isCentral) ??
      layout.districts[0];
    if (activeDistrict) {
      const dist = Math.max((activeDistrict.radius / SCALE) * FOCUS_DIST_MULTIPLIER, FOCUS_MIN_DIST);
      return { center: [activeDistrict.x / SCALE, activeDistrict.y / SCALE], dist };
    }
  }
  return { center: [0, 0], dist: colonyDist(layout) };
}

/** Lives inside the Canvas and lerps the real camera toward its current
 *  target every frame, calling lookAt each frame — the standard R3F rig
 *  pattern for a camera that must move after mount: changing the `camera`
 *  prop on <Canvas> never repositions an already-created camera (r3f only
 *  calls camera.lookAt(0,0,0) once, on initial creation). */
function CameraRig({
  layout,
  activeCompanyId,
  commandMode,
}: {
  layout: OfficeLayout;
  activeCompanyId: string | null;
  commandMode: boolean;
}) {
  const { camera } = useThree();
  const targetPosition = useRef(new THREE.Vector3());
  const targetLookAt = useRef(new THREE.Vector3());
  const currentLookAt = useRef(new THREE.Vector3(0, 0, 0));

  useFrame((_state, delta) => {
    const { center, dist } = cameraTargetFor(layout, activeCompanyId, commandMode);
    const [px, py, pz] = cameraPositionFor(center[0], center[1], dist);
    targetPosition.current.set(px, py, pz);
    targetLookAt.current.set(center[0], 0, center[1]);

    const t = Math.min(1, delta * CAMERA_LERP_SPEED);
    camera.position.lerp(targetPosition.current, t);
    currentLookAt.current.lerp(targetLookAt.current, t);
    camera.lookAt(currentLookAt.current);
  });

  return null;
}

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

/** A pulsing 3D line between two Operators mid-collaboration — the same
 *  raw `<line>`/`bufferGeometry` technique `GraphEdgeLine` in
 *  components/office3d/GraphScene.tsx already established for real
 *  relationships, tinted with the "collaborating" state color and pulsed
 *  the same `useFrame` sine pattern `ExecutingFX` already uses. */
function CollaborationBeam({
  from,
  to,
}: {
  from: [number, number, number];
  to: [number, number, number];
}) {
  const positions = useMemo(() => new Float32Array([...from, ...to]), [from, to]);
  const materialRef = useRef<THREE.LineBasicMaterial>(null);

  useFrame((frameState) => {
    if (!materialRef.current) return;
    materialRef.current.opacity = 0.4 + 0.35 * Math.sin(frameState.clock.elapsedTime * 4);
  });

  return (
    <line>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
      </bufferGeometry>
      <lineBasicMaterial ref={materialRef} color={STATE_COLOR.collaborating ?? "#c77dff"} transparent opacity={0.6} />
    </line>
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
          <div style={{ textAlign: "center" }}>
            <div>{district.isCentral ? `${district.label} — Central Command` : district.label}</div>
            {/* The real business this district represents (companies.industry)
                — visual differentiation grounded in real seeded data, not a
                synthetic per-company palette with nothing behind it. */}
            {district.industry && (
              <div style={{ fontSize: "9px", opacity: 0.75, marginTop: "1px" }}>{district.industry}</div>
            )}
          </div>
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
  isCollaborating,
  selected,
  now,
  onSelect,
}: {
  agent: OfficeAgentPosition;
  isWorking: boolean;
  isCollaborating: boolean;
  selected: boolean;
  now: number;
  onSelect: () => void;
}) {
  const colorIndex = hashToIndex(agent.agentId, CHARACTER_COLORS.length);
  const state: AgentVisualState = deriveAgentState(agent, isWorking, now, isCollaborating);
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

      {/* Character — a sleeker digital-operator chassis, not a Lego
          minifigure: a tapered, faceted (8-sided, not round) torso reads
          more mechanical than the old capsule, angular shoulder pauldrons
          broaden the silhouette, and a boxy visor head carries a thin
          emissive strip lit with the real state glow color instead of a
          separate decoration — the same signal, just built into the
          character instead of floating above it. Same y-anchors as
          before (0.62 torso center, 1.18 head, 1.42/1.45 label/glow) so
          the selection ring, point light, ExecutingFX, and label below
          don't need retuning. */}
      <group
        position={[0, 0, 0.35]}
        onClick={(e) => {
          e.stopPropagation();
          onSelect();
        }}
      >
        <mesh position={[0, 0.62, 0]}>
          <cylinderGeometry args={[0.16, 0.22, 0.62, 8]} />
          <meshStandardMaterial color={bodyColor} metalness={0.35} roughness={0.5} />
        </mesh>
        <mesh position={[0.19, 0.92, 0]}>
          <boxGeometry args={[0.14, 0.12, 0.18]} />
          <meshStandardMaterial color={bodyColor} metalness={0.35} roughness={0.5} />
        </mesh>
        <mesh position={[-0.19, 0.92, 0]}>
          <boxGeometry args={[0.14, 0.12, 0.18]} />
          <meshStandardMaterial color={bodyColor} metalness={0.35} roughness={0.5} />
        </mesh>
        <mesh position={[0, 1.18, 0]}>
          <boxGeometry args={[0.26, 0.24, 0.24]} />
          <meshStandardMaterial color={bodyColor} metalness={0.35} roughness={0.5} />
        </mesh>
        <mesh position={[0, 1.18, 0.125]}>
          <boxGeometry args={[0.18, 0.06, 0.01]} />
          <meshBasicMaterial color={glowColor ?? "#3a4560"} />
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

// How far a delegating Operator walks toward the Operator it's collaborating
// with — a fraction of the real distance between their two desks, not the
// full distance, so it reads as "stepping out to hand off work" rather than
// swapping desks. WALK_LERP_SPEED governs how quickly its position eases
// toward wherever it should be (out at the target, or back home) each
// frame — independent of the pacing oscillation below.
const WALK_REACH = 0.55;
const WALK_LERP_SPEED = 1.6;

/** Wraps AgentFigure in a group whose position actually moves — a real
 *  "moving around working" signal grounded in `collaborationEdges`, not a
 *  decorative walk cycle: an Operator only steps out from its desk while it
 *  is the genuine `sourceAgentId` of an active edge (a real
 *  request_from_agent/assign_task call within the recency window),
 *  partway toward the target Operator's own desk, easing back home the
 *  moment that edge ages out. The back-and-forth pacing while out there is
 *  the one purely decorative touch, same as ExecutingFX's swirl — it never
 *  runs unless the underlying edge is real. */
function AgentOperator({
  agent,
  home,
  walkTarget,
  isWorking,
  isCollaborating,
  selected,
  now,
  onSelect,
}: {
  agent: OfficeAgentPosition;
  home: [number, number, number];
  walkTarget: [number, number, number] | null;
  isWorking: boolean;
  isCollaborating: boolean;
  selected: boolean;
  now: number;
  onSelect: () => void;
}) {
  const groupRef = useRef<THREE.Group>(null);
  const current = useRef(new THREE.Vector3(home[0], home[1], home[2]));
  // Deterministic per-agent phase offset so multiple delegating Operators
  // don't all pace in lockstep — same seeded-hash approach as the chassis
  // color palette above, not Math.random().
  const seed = useMemo(() => hashToIndex(agent.agentId, 1000) / 1000, [agent.agentId]);

  useFrame((frameState, delta) => {
    if (!groupRef.current) return;
    let desired: THREE.Vector3;
    if (walkTarget) {
      const pace = 0.5 + 0.5 * Math.sin(frameState.clock.elapsedTime * 1.6 + seed * Math.PI * 2);
      desired = new THREE.Vector3(
        home[0] + (walkTarget[0] - home[0]) * WALK_REACH * pace,
        home[1],
        home[2] + (walkTarget[2] - home[2]) * WALK_REACH * pace,
      );
    } else {
      desired = new THREE.Vector3(home[0], home[1], home[2]);
    }
    current.current.lerp(desired, Math.min(1, delta * WALK_LERP_SPEED));
    groupRef.current.position.copy(current.current);

    if (walkTarget) {
      const dx = walkTarget[0] - home[0];
      const dz = walkTarget[2] - home[2];
      if (Math.hypot(dx, dz) > 0.001) groupRef.current.rotation.y = Math.atan2(dx, dz);
    }
  });

  return (
    <group ref={groupRef} position={home}>
      <AgentFigure
        agent={agent}
        isWorking={isWorking}
        isCollaborating={isCollaborating}
        selected={selected}
        now={now}
        onSelect={onSelect}
      />
    </group>
  );
}

function SceneContents({
  layout,
  workingAgentIds,
  selectedAgentId,
  activeCompanyId,
  now,
  collaborationEdges,
  onSelectAgent,
  onSelectCompany,
}: {
  layout: OfficeLayout;
  workingAgentIds: Set<string>;
  selectedAgentId: string | null;
  activeCompanyId: string | null;
  now: number;
  collaborationEdges: CollaborationEdge[];
  onSelectAgent: (agentId: string) => void;
  onSelectCompany: (companyId: string) => void;
}) {
  const sceneRadius = Math.max(layout.width, layout.height) / 2 / SCALE;

  // Matches real agents by their unprefixed id (agent_runs.agent_id has
  // no "agent:" prefix; layout.agents' own agentId does, same as every
  // other place in this file that strips it — see deriveAgentRank calls
  // above). Both the collaborating-state color and the connecting beam
  // below read from this same derived data, not two separate signals.
  const collaboratingIds = useMemo(() => {
    const ids = new Set<string>();
    for (const e of collaborationEdges) {
      ids.add(e.sourceAgentId);
      ids.add(e.targetAgentId);
    }
    return ids;
  }, [collaborationEdges]);

  // Absolute world position of each Operator's own glow orb (matches
  // AgentFigure's [0, 0, 0.35] inner-group offset + [0, 1.45, 0] glow
  // position below) — so a beam visually connects the two glows, not the
  // characters' feet.
  const glowPositionByRawId = useMemo(() => {
    const map = new Map<string, [number, number, number]>();
    for (const agent of layout.agents) {
      const rawId = agent.agentId.replace(/^agent:/, "");
      map.set(rawId, [agent.x / SCALE, 1.45, agent.y / SCALE + 0.35]);
    }
    return map;
  }, [layout.agents]);

  // Each Operator's own desk position (unprefixed id), reused both as the
  // AgentOperator's "home" to ease back toward and as the destination a
  // delegating Operator walks partway toward below.
  const groundPositionByRawId = useMemo(() => {
    const map = new Map<string, [number, number, number]>();
    for (const agent of layout.agents) {
      const rawId = agent.agentId.replace(/^agent:/, "");
      map.set(rawId, [agent.x / SCALE, 0, agent.y / SCALE]);
    }
    return map;
  }, [layout.agents]);

  // One real walk target per delegating Operator — the first active edge
  // it's the source of, resolved to the real target Operator's own desk
  // position. Deliberately not per-edge (an Operator can only walk toward
  // one place at a time); collaborationEdges is already recency-filtered,
  // so this only exists while the underlying request/delegation is live.
  const walkTargetByRawId = useMemo(() => {
    const map = new Map<string, [number, number, number]>();
    for (const e of collaborationEdges) {
      if (map.has(e.sourceAgentId)) continue;
      const target = groundPositionByRawId.get(e.targetAgentId);
      if (target) map.set(e.sourceAgentId, target);
    }
    return map;
  }, [collaborationEdges, groundPositionByRawId]);

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
        const rawId = agent.agentId.replace(/^agent:/, "");
        const home = groundPositionByRawId.get(rawId) ?? [agent.x / SCALE, 0, agent.y / SCALE];
        return (
          <AgentOperator
            key={agent.agentId}
            agent={agent}
            home={home}
            walkTarget={walkTargetByRawId.get(rawId) ?? null}
            isWorking={workingAgentIds.has(agent.agentId)}
            isCollaborating={collaboratingIds.has(rawId)}
            selected={selectedAgentId === agent.agentId}
            now={now}
            onSelect={() => onSelectAgent(agent.agentId)}
          />
        );
      })}

      {collaborationEdges.map((edge, i) => {
        const from = glowPositionByRawId.get(edge.sourceAgentId);
        const to = glowPositionByRawId.get(edge.targetAgentId);
        if (!from || !to) return null;
        return <CollaborationBeam key={`collab-${i}`} from={from} to={to} />;
      })}
    </>
  );
}

export function OfficeScene3D({
  layout,
  workingAgentIds,
  selectedAgentId,
  activeCompanyId,
  commandMode,
  collaborationEdges = [],
  onSelectAgent,
  onSelectCompany,
}: {
  layout: OfficeLayout;
  workingAgentIds: Set<string>;
  selectedAgentId: string | null;
  activeCompanyId: string | null;
  commandMode: boolean;
  collaborationEdges?: CollaborationEdge[];
  onSelectAgent: (agentId: string) => void;
  onSelectCompany: (companyId: string) => void;
}) {
  const dist = colonyDist(layout);

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
      // This is also exactly Command Mode's own framing (colonyDist over
      // the whole layout, centered on the origin) — the initial shot IS
      // the Command Mode shot; CameraRig below takes over from here and
      // moves it every frame based on the real active district / mode.
      camera={{ position: cameraPositionFor(0, 0, dist), fov: 42 }}
      gl={{ antialias: true }}
      role="img"
      aria-label="Colony scene"
    >
      <color attach="background" args={["#05060a"]} />
      <fog attach="fog" args={["#05060a", dist * 1.9, dist * 4.6]} />
      <ambientLight intensity={0.5} />
      <directionalLight position={[dist * 0.4, dist * 0.9, dist * 0.3]} intensity={0.65} />

      <CameraRig layout={layout} activeCompanyId={activeCompanyId} commandMode={commandMode} />

      <SceneContents
        layout={layout}
        workingAgentIds={workingAgentIds}
        selectedAgentId={selectedAgentId}
        activeCompanyId={activeCompanyId}
        now={now}
        collaborationEdges={collaborationEdges}
        onSelectAgent={onSelectAgent}
        onSelectCompany={onSelectCompany}
      />
    </Canvas>
  );
}
