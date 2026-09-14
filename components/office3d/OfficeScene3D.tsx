"use client";

import { useEffect, useRef, useState } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import type * as THREE from "three";
import type { OfficeAgentPosition, OfficeLayout, OfficeRoom } from "@/lib/office-layout";
import { deriveAgentState, STATE_COLOR, type AgentVisualState } from "@/lib/agent-visual-state";

// World units per layout pixel — lib/office-layout.ts's deterministic grid
// stays the single source of truth for where every room/agent sits; this
// view just re-reads those same x/y numbers as a floor plan instead of
// canvas pixels. No change to office-layout.ts itself. Chosen so a room
// (~180px) lands around 4-5 world units — proportionate to a ~1-unit-tall
// character, the same relative sizing the old 2D view had (a 16px sprite
// in a ~150px room). A smaller divisor here looked "correct" on paper but
// put the whole multi-room layout so far from a camera that could still
// see all of it that every character shrank to an invisible sliver —
// caught by actually looking at a screenshot, not by the math.
const SCALE = 40;

// Lego-minifigure palette: one flat, saturated color per character, hashed
// from the agent id the same way the retired 2D view picked a sprite.
const CHARACTER_COLORS = ["#f2c14e", "#4d96ff", "#6bcb77", "#b57edc", "#ff8c5a", "#ff6b9d"];

function hashToIndex(id: string, mod: number): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return h % mod;
}

/**
 * The actual extent of the rooms that exist, in layout pixels — not
 * `layout.width`/`height`, which pad out to a minimum canvas width sized
 * for the old 2D view (900px) regardless of how few companies are
 * populated. Framing the 3D camera against that padding, instead of what's
 * really there, put everything a full room's width past the lens on a
 * small demo scene — this is what both the camera and the room/agent
 * centering below are framed against instead.
 */
function contentBounds(layout: OfficeLayout): { width: number; height: number } {
  if (layout.rooms.length === 0) return { width: layout.width, height: layout.height };
  const maxX = Math.max(...layout.rooms.map((r) => r.x + r.width));
  const maxY = Math.max(...layout.rooms.map((r) => r.y + r.height));
  return { width: maxX, height: maxY };
}

function Label({ children, color = "#cfd3da" }: { children: React.ReactNode; color?: string }) {
  // A DOM overlay (the app's own CSS/fonts), not drei's <Text> — <Text>
  // (troika-three-text) fetches a font file over the network by default,
  // which silently breaks the scene in this network-restricted sandbox.
  // Learned the hard way building the retired /hq scene; not relearning it.
  return (
    <Html center style={{ color, fontSize: "11px", whiteSpace: "nowrap", pointerEvents: "none" }}>
      {children}
    </Html>
  );
}

function Room({ room, isActive, onSelect }: { room: OfficeRoom; isActive: boolean; onSelect: () => void }) {
  const w = room.width / SCALE;
  const d = room.height / SCALE;
  const wallH = 2.4;

  return (
    <group>
      <mesh
        position={[0, -0.05, 0]}
        rotation={[-Math.PI / 2, 0, 0]}
        onClick={(e) => {
          e.stopPropagation();
          onSelect();
        }}
      >
        <planeGeometry args={[w, d]} />
        <meshStandardMaterial color={isActive ? "#1c2440" : "#12151f"} />
      </mesh>

      {isActive && (
        <mesh position={[0, -0.04, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[Math.max(w, d) / 2 - 0.05, Math.max(w, d) / 2, 48]} />
          <meshBasicMaterial color="#5aa9ff" transparent opacity={0.5} />
        </mesh>
      )}

      {/* Back and left walls only — open toward the camera so nothing inside is hidden. */}
      <mesh position={[0, wallH / 2, -d / 2]}>
        <boxGeometry args={[w, wallH, 0.15]} />
        <meshStandardMaterial color="#0c0e16" />
      </mesh>
      <mesh position={[-w / 2, wallH / 2, 0]}>
        <boxGeometry args={[0.15, wallH, d]} />
        <meshStandardMaterial color="#0c0e16" />
      </mesh>

      {/* A whiteboard with a couple of sticky notes and a tiny bar chart —
          real props, same "dense not sparse" note as the reference; purely
          decorative, built from primitives, never a data signal. Sized
          against the desk (0.9 wide) and character (~0.4 wide), not the
          room itself — a first pass sized this against the room and it
          rendered as a wall-sized diamond once the room shrank to a
          believable scale (see the SCALE comment above). */}
      <group position={[-w / 2 + 0.03, wallH * 0.55, -d / 2 + 0.4]} rotation={[0, Math.PI / 2, 0]}>
        <mesh>
          <planeGeometry args={[0.55, 0.34]} />
          <meshStandardMaterial color="#e9ecf1" />
        </mesh>
        <mesh position={[-0.17, 0.05, 0.005]}>
          <planeGeometry args={[0.075, 0.075]} />
          <meshStandardMaterial color="#ffd166" />
        </mesh>
        <mesh position={[-0.07, 0.05, 0.005]}>
          <planeGeometry args={[0.075, 0.075]} />
          <meshStandardMaterial color="#ef476f" />
        </mesh>
        {[0.06, 0.1, 0.075].map((h, i) => (
          <mesh key={i} position={[0.05 + i * 0.075, -0.12 + h / 2, 0.005]}>
            <planeGeometry args={[0.055, h]} />
            <meshStandardMaterial color={["#5aa9ff", "#6bcb77", "#ffd166"][i]} />
          </mesh>
        ))}
      </group>

      <group position={[0, wallH, -d / 2 + 0.05]}>
        <Label color={isActive ? "#cfe4ff" : "#7c88ad"}>{room.label}</Label>
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
  const color = CHARACTER_COLORS[hashToIndex(agent.agentId, CHARACTER_COLORS.length)];
  const state: AgentVisualState = deriveAgentState(agent, isWorking, now);
  const glowColor = STATE_COLOR[state];
  const glowRef = useRef<THREE.Mesh>(null);
  const lightRef = useRef<THREE.PointLight>(null);

  useFrame((frameState) => {
    if (!glowRef.current || !lightRef.current) return;
    const pulse = state === "working" ? 0.6 + 0.4 * Math.sin(frameState.clock.elapsedTime * 4) : 1;
    const scale = glowColor ? 0.14 * pulse : 0;
    glowRef.current.scale.setScalar(scale > 0 ? scale : 0.0001);
    lightRef.current.intensity = glowColor ? 1.1 * pulse : 0;
  });

  return (
    <group>
      {/* Desk */}
      <mesh position={[0, 0.4, -0.5]}>
        <boxGeometry args={[0.9, 0.05, 0.55]} />
        <meshStandardMaterial color="#7a5230" />
      </mesh>
      <mesh position={[0, 0.2, -0.7]}>
        <boxGeometry args={[0.06, 0.4, 0.06]} />
        <meshStandardMaterial color="#5a3c22" />
      </mesh>
      <mesh position={[0, 0.2, -0.3]}>
        <boxGeometry args={[0.06, 0.4, 0.06]} />
        <meshStandardMaterial color="#5a3c22" />
      </mesh>

      {/* Monitor — real state, not decorative: lit once this agent has ever run. */}
      <mesh position={[0, 0.62, -0.7]}>
        <boxGeometry args={[0.32, 0.22, 0.03]} />
        <meshStandardMaterial
          color={agent.lastRunAt ? "#0a2a1a" : "#1a1c22"}
          emissive={agent.lastRunAt ? "#3ddc84" : "#000000"}
          emissiveIntensity={agent.lastRunAt ? 0.8 : 0}
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
        <mesh position={[0, 0.55, 0]}>
          <capsuleGeometry args={[0.22, 0.5, 4, 12]} />
          <meshStandardMaterial color={color} />
        </mesh>
        <mesh position={[0, 1.05, 0]}>
          <sphereGeometry args={[0.2, 16, 16]} />
          <meshStandardMaterial color={color} />
        </mesh>

        {selected && (
          <mesh position={[0, 0.55, 0]} rotation={[Math.PI / 2, 0, 0]}>
            <torusGeometry args={[0.4, 0.02, 8, 32]} />
            <meshBasicMaterial color="#ffffff" />
          </mesh>
        )}

        <pointLight ref={lightRef} position={[0, 1.4, 0]} color={glowColor ?? "#ffffff"} distance={1.8} />
        <mesh ref={glowRef} position={[0, 1.4, 0]}>
          <sphereGeometry args={[1, 12, 12]} />
          <meshBasicMaterial color={glowColor ?? "#000000"} transparent opacity={0.85} />
        </mesh>

        <group position={[0, 1.35, 0]}>
          <Label>{agent.label.split(" ")[0]}</Label>
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
  const bounds = contentBounds(layout);
  const originX = bounds.width / 2;
  const originZ = bounds.height / 2;

  return (
    <>
      {layout.rooms.map((room) => {
        const isActive = activeCompanyId !== null && room.companyId === `company:${activeCompanyId}`;
        const cx = (room.x + room.width / 2 - originX) / SCALE;
        const cz = (room.y + room.height / 2 - originZ) / SCALE;
        return (
          <group key={room.companyId} position={[cx, 0, cz]}>
            <Room room={room} isActive={isActive} onSelect={() => onSelectCompany(room.companyId.replace(/^company:/, ""))} />
          </group>
        );
      })}

      {layout.agents.map((agent) => {
        const x = (agent.x - originX) / SCALE;
        const z = (agent.y - originZ) / SCALE;
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
  const bounds = contentBounds(layout);
  const sceneW = Math.max(bounds.width / SCALE, 8);
  const sceneD = Math.max(bounds.height / SCALE, 8);
  const dist = Math.max(sceneW, sceneD);

  // A ticking clock in state, not a direct Date.now() read during render —
  // only needs to be fresh enough to flip the "delivering" 2-minute window,
  // same pattern the old 2D scene and /map used.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const tick = setInterval(() => setNow(Date.now()), 5_000);
    return () => clearInterval(tick);
  }, []);

  return (
    <Canvas
      camera={{ position: [0, dist * 0.62, dist * 0.82], fov: 42 }}
      gl={{ antialias: true }}
      role="img"
      aria-label="Office scene"
    >
      <color attach="background" args={["#070912"]} />
      <fog attach="fog" args={["#070912", dist * 1.2, dist * 3.2]} />
      <ambientLight intensity={0.55} />
      <directionalLight position={[dist * 0.4, dist * 0.9, dist * 0.3]} intensity={0.7} />

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
