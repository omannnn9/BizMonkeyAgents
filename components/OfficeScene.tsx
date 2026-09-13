"use client";

import { useEffect, useRef } from "react";
import type { OfficeAgentPosition, OfficeLayout } from "@/lib/office-layout";

// Character sprite sheets: Pixel Agents (MIT) / Metro City character pack
// (JIK-A-4, itch.io) — see public/sprites/office/ATTRIBUTION.md. Each sheet
// is 112x96: 3 direction rows (down, up, right) x 7 frame columns (16x32
// each). Row 1 ("up") is a back-turned pose — used here as "seated at the
// desk, facing the monitor" — frames 0 and 1 are two idle bob frames.
const CHARACTER_COUNT = 6;
const CHAR_FRAME_W = 16;
const CHAR_FRAME_H = 32;
const CHAR_UP_ROW = 1;
const CHAR_BOB_FRAMES = [0, 1];
const CHAR_BOB_FRAME_MS = 550; // ambient bob only — never implies a real event, same as /map's idle "breathing"

const ASSET_BASE = "/sprites/office";

export type AgentVisualState = "working" | "error" | "needs-approval" | "delivering" | "idle";

const RECENT_DELIVERY_MS = 2 * 60 * 1000;

export function deriveAgentState(
  agent: Pick<OfficeAgentPosition, "lastRunAt" | "lastRunStatus" | "hasPendingApproval">,
  isWorking: boolean,
  now: number,
): AgentVisualState {
  if (isWorking) return "working";
  if (agent.lastRunStatus === "error") return "error";
  if (agent.hasPendingApproval) return "needs-approval";
  if (agent.lastRunAt && now - new Date(agent.lastRunAt).getTime() < RECENT_DELIVERY_MS) return "delivering";
  return "idle";
}

const STATE_TINT: Record<AgentVisualState, string | null> = {
  working: "#7c9cff",
  error: "#e05c5c",
  "needs-approval": "#e0b35c",
  delivering: "#8fd3a0",
  idle: null,
};

const FLOOR_COLOR = "#8a6a4a";
const FLOOR_PLANK_COLOR = "#7a5c40";
const WALL_COLOR = "#1c2333";
const WALL_BORDER = 6;

function hashToIndex(id: string, mod: number): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return h % mod;
}

interface OfficeAssets {
  characters: HTMLImageElement[];
  desk: HTMLImageElement;
  pcOn: HTMLImageElement;
  pcOff: HTMLImageElement;
  bookshelf: HTMLImageElement;
  clock: HTMLImageElement;
  plant: HTMLImageElement;
}

function loadImage(src: string): HTMLImageElement {
  const img = new Image();
  img.src = src;
  return img;
}

function loadOfficeAssets(): OfficeAssets {
  return {
    characters: Array.from({ length: CHARACTER_COUNT }, (_, i) => loadImage(`${ASSET_BASE}/char_${i}.png`)),
    desk: loadImage(`${ASSET_BASE}/desk.png`),
    pcOn: loadImage(`${ASSET_BASE}/pc_on.png`),
    pcOff: loadImage(`${ASSET_BASE}/pc_off.png`),
    bookshelf: loadImage(`${ASSET_BASE}/bookshelf.png`),
    clock: loadImage(`${ASSET_BASE}/clock.png`),
    plant: loadImage(`${ASSET_BASE}/plant.png`),
  };
}

function allLoaded(assets: OfficeAssets): boolean {
  const all = [assets.desk, assets.pcOn, assets.pcOff, assets.bookshelf, assets.clock, assets.plant, ...assets.characters];
  return all.every((img) => img.complete && img.naturalWidth > 0);
}

export function OfficeScene({
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
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const assetsRef = useRef<OfficeAssets | null>(null);
  const rafRef = useRef<number | null>(null);
  // Refs so the draw loop always sees the latest props without re-creating
  // the rAF loop (and its asset-load effect) on every change. Written from
  // an effect, not during render, per the rules-of-hooks ref-mutation rule.
  const layoutRef = useRef(layout);
  const workingRef = useRef(workingAgentIds);
  const selectedRef = useRef(selectedAgentId);
  const activeCompanyRef = useRef(activeCompanyId);
  useEffect(() => {
    layoutRef.current = layout;
    workingRef.current = workingAgentIds;
    selectedRef.current = selectedAgentId;
    activeCompanyRef.current = activeCompanyId;
  }, [layout, workingAgentIds, selectedAgentId, activeCompanyId]);

  useEffect(() => {
    assetsRef.current = loadOfficeAssets();
    return () => {
      assetsRef.current = null;
    };
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    function draw() {
      const assets = assetsRef.current;
      const layout = layoutRef.current;
      const dpr = window.devicePixelRatio || 1;
      const cssWidth = layout.width;
      const cssHeight = layout.height;
      if (canvas!.width !== Math.round(cssWidth * dpr) || canvas!.height !== Math.round(cssHeight * dpr)) {
        canvas!.width = Math.round(cssWidth * dpr);
        canvas!.height = Math.round(cssHeight * dpr);
        canvas!.style.width = `${cssWidth}px`;
        canvas!.style.height = `${cssHeight}px`;
      }
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx!.imageSmoothingEnabled = false;
      ctx!.fillStyle = "#0b0d12";
      ctx!.fillRect(0, 0, cssWidth, cssHeight);

      if (!assets || !allLoaded(assets)) {
        rafRef.current = requestAnimationFrame(draw);
        return;
      }

      const now = Date.now();
      const bobFrame = CHAR_BOB_FRAMES[Math.floor(now / CHAR_BOB_FRAME_MS) % CHAR_BOB_FRAMES.length];

      for (const room of layout.rooms) {
        const isActive = activeCompanyRef.current !== null && room.companyId === `company:${activeCompanyRef.current}`;
        drawRoom(ctx!, assets, room);
        if (isActive) {
          ctx!.strokeStyle = "#ffffff";
          ctx!.lineWidth = 2;
          ctx!.strokeRect(room.x + 1, room.y + 1, room.width - 2, room.height - 2);
        }
      }

      for (const agent of layout.agents) {
        const isWorking = workingRef.current.has(agent.agentId);
        const state = deriveAgentState(agent, isWorking, now);
        const charImg = assets.characters[hashToIndex(agent.agentId, assets.characters.length)];
        const selected = selectedRef.current === agent.agentId;
        drawAgentSeat(ctx!, assets, charImg, agent, bobFrame, state, selected);
      }

      rafRef.current = requestAnimationFrame(draw);
    }

    rafRef.current = requestAnimationFrame(draw);
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  function handleClick(e: React.MouseEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const AGENT_HIT_RADIUS = 20;
    for (const agent of layout.agents) {
      const dx = agent.x - x;
      const dy = agent.y - y;
      if (dx * dx + dy * dy <= AGENT_HIT_RADIUS * AGENT_HIT_RADIUS) {
        onSelectAgent(agent.agentId);
        return;
      }
    }

    for (const room of layout.rooms) {
      if (x >= room.x && x <= room.x + room.width && y >= room.y && y <= room.y + room.height) {
        onSelectCompany(room.companyId.replace(/^company:/, ""));
        return;
      }
    }
  }

  return (
    <canvas
      ref={canvasRef}
      onClick={handleClick}
      role="img"
      aria-label="Office scene"
      className="cursor-pointer rounded-lg border border-border bg-[#0b0d12]"
    />
  );
}

function drawRoom(
  ctx: CanvasRenderingContext2D,
  assets: OfficeAssets,
  room: { x: number; y: number; width: number; height: number; label: string },
) {
  const ROOM_HEADER = 54;

  // Walls (flat fill — the actual pixel-agents wall PNGs are uncolored
  // bitmask templates meant for a runtime HSL tinting pipeline we don't
  // have; a solid color reads just as well for a room border here).
  ctx.fillStyle = WALL_COLOR;
  ctx.fillRect(room.x, room.y, room.width, room.height);

  // Floor
  const floorX = room.x + WALL_BORDER;
  const floorY = room.y + ROOM_HEADER;
  const floorW = room.width - WALL_BORDER * 2;
  const floorH = room.height - ROOM_HEADER - WALL_BORDER;
  ctx.fillStyle = FLOOR_COLOR;
  ctx.fillRect(floorX, floorY, floorW, floorH);
  ctx.fillStyle = FLOOR_PLANK_COLOR;
  for (let ly = floorY + 16; ly < floorY + floorH; ly += 16) {
    ctx.fillRect(floorX, ly, floorW, 1);
  }

  // Decor mounted on the back wall — static ambiance, same category as the
  // room label itself, never a signal.
  const bsW = assets.bookshelf.naturalWidth;
  const bsH = assets.bookshelf.naturalHeight;
  ctx.drawImage(assets.bookshelf, room.x + 10, floorY - bsH - 2, bsW, bsH);
  const clockW = assets.clock.naturalWidth;
  const clockH = assets.clock.naturalHeight;
  ctx.drawImage(assets.clock, room.x + 10 + bsW + 10, floorY - clockH - 2, clockW, clockH);

  // A corner plant, if the room is wide enough for the reserved column.
  const plantW = assets.plant.naturalWidth;
  const plantH = assets.plant.naturalHeight;
  if (room.width > plantW + 40) {
    ctx.drawImage(
      assets.plant,
      room.x + room.width - WALL_BORDER - plantW - 4,
      room.y + room.height - WALL_BORDER - plantH,
      plantW,
      plantH,
    );
  }

  ctx.fillStyle = "#e8eaf0";
  ctx.font = "11px monospace";
  ctx.textBaseline = "top";
  ctx.fillText(room.label, room.x + 6, room.y + 6);
}

function drawAgentSeat(
  ctx: CanvasRenderingContext2D,
  assets: OfficeAssets,
  charImg: HTMLImageElement,
  agent: OfficeAgentPosition,
  bobFrame: number,
  state: AgentVisualState,
  selected: boolean,
) {
  // agent.x/y is the character sprite's vertical center — the desk/monitor
  // stack directly above it, the state ring and label sit below it.
  const charTop = agent.y - CHAR_FRAME_H / 2;
  const charLeft = agent.x - CHAR_FRAME_W / 2;

  const desk = assets.desk;
  const deskBottom = charTop - 2;
  const deskLeft = agent.x - desk.naturalWidth / 2;
  ctx.drawImage(desk, deskLeft, deskBottom - desk.naturalHeight, desk.naturalWidth, desk.naturalHeight);

  // The monitor's on/off state is real, not decorative: on once this agent
  // has ever produced a run, off otherwise.
  const monitor = agent.lastRunAt ? assets.pcOn : assets.pcOff;
  const monitorBottom = deskBottom - desk.naturalHeight * 0.45;
  ctx.drawImage(
    monitor,
    agent.x - monitor.naturalWidth / 2,
    monitorBottom - monitor.naturalHeight,
    monitor.naturalWidth,
    monitor.naturalHeight,
  );

  const tint = STATE_TINT[state];
  if (tint) {
    ctx.beginPath();
    ctx.fillStyle = tint;
    ctx.globalAlpha = state === "working" ? 0.55 + 0.25 * Math.sin(Date.now() / 200) : 0.6;
    ctx.ellipse(agent.x, agent.y + CHAR_FRAME_H / 2 - 2, 13, 6, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  if (selected) {
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 1.5;
    ctx.strokeRect(charLeft - 2, charTop - 2, CHAR_FRAME_W + 4, CHAR_FRAME_H + 4);
  }

  ctx.drawImage(
    charImg,
    bobFrame * CHAR_FRAME_W,
    CHAR_UP_ROW * CHAR_FRAME_H,
    CHAR_FRAME_W,
    CHAR_FRAME_H,
    charLeft,
    charTop,
    CHAR_FRAME_W,
    CHAR_FRAME_H,
  );

  // Full names ("Marketing Agent") overlap a neighboring seat's label at
  // this slot spacing — the first word is enough to identify who's who,
  // and the overlay panel (opened on click) always has the full name.
  const shortLabel = agent.label.split(" ")[0];
  ctx.fillStyle = "#cfd3da";
  ctx.font = "9px monospace";
  ctx.textAlign = "center";
  ctx.fillText(shortLabel, agent.x, agent.y + CHAR_FRAME_H / 2 + 6);
  ctx.textAlign = "left";
}
