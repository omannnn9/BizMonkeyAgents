"use client";

import { useEffect, useRef } from "react";
import type { OfficeAgentPosition, OfficeLayout } from "@/lib/office-layout";

const TILESET_SRC = "/sprites/office-tilemap.png";
const TILE_PITCH = 17;
const TILE_SIZE = 16;

// Kenney "RPG Urban Pack" (CC0, see public/sprites/office-tilemap.LICENSE.md)
// — coordinates below were located by inspecting the sheet directly (it
// ships with no metadata/atlas). FLOOR/WALL are plain, undecorated filler
// tiles picked from the office-floor cluster; CHARACTER_ROWS are the first
// row of each of the sheet's 6 palette-swapped character blocks (down-
// facing pose), 4 animation-frame columns wide.
const FLOOR_TILE = { col: 8, row: 0 };
const WALL_TILE = { col: 18, row: 2 };
const CHARACTER_COL_START = 23;
const CHARACTER_ROWS = [0, 3, 6, 9, 12, 15];
const CHARACTER_FRAME_COUNT = 4;
const CHARACTER_FRAME_MS = 550; // ambient bob only — never implies a real event, same as /map's idle "breathing"

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

function hashToIndex(id: string, mod: number): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return h % mod;
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
  const tilesetRef = useRef<HTMLImageElement | null>(null);
  const rafRef = useRef<number | null>(null);
  // Refs so the draw loop always sees the latest props without re-creating
  // the rAF loop (and its tileset-load effect) on every change. Written from
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
    const img = new Image();
    img.src = TILESET_SRC;
    img.onload = () => {
      tilesetRef.current = img;
    };
    return () => {
      tilesetRef.current = null;
    };
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    function draw() {
      const tileset = tilesetRef.current;
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

      if (!tileset) {
        rafRef.current = requestAnimationFrame(draw);
        return;
      }

      const now = Date.now();
      const bobFrame = Math.floor(now / CHARACTER_FRAME_MS) % CHARACTER_FRAME_COUNT;

      for (const room of layout.rooms) {
        const isActive = activeCompanyRef.current !== null && room.companyId === `company:${activeCompanyRef.current}`;
        drawTiledRect(ctx!, tileset, room.x, room.y, room.width, room.height, FLOOR_TILE);
        drawWallBorder(ctx!, tileset, room.x, room.y, room.width, room.height);
        if (isActive) {
          ctx!.strokeStyle = "#ffffff";
          ctx!.lineWidth = 2;
          ctx!.strokeRect(room.x + 1, room.y + 1, room.width - 2, room.height - 2);
        }
        ctx!.fillStyle = "#e8eaf0";
        ctx!.font = "11px monospace";
        ctx!.textBaseline = "top";
        ctx!.fillText(room.label, room.x + 6, room.y + 6);
      }

      for (const agent of layout.agents) {
        const isWorking = workingRef.current.has(agent.agentId);
        const state = deriveAgentState(agent, isWorking, now);
        const charGroup = CHARACTER_ROWS[hashToIndex(agent.agentId, CHARACTER_ROWS.length)];
        const selected = selectedRef.current === agent.agentId;
        drawAgentSprite(ctx!, tileset, agent, charGroup, bobFrame, state, selected);
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

    const AGENT_HIT_RADIUS = 14;
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

function drawTiledRect(
  ctx: CanvasRenderingContext2D,
  tileset: HTMLImageElement,
  x: number,
  y: number,
  width: number,
  height: number,
  tile: { col: number; row: number },
) {
  const sx = tile.col * TILE_PITCH;
  const sy = tile.row * TILE_PITCH;
  for (let ty = y; ty < y + height; ty += TILE_SIZE) {
    for (let tx = x; tx < x + width; tx += TILE_SIZE) {
      const w = Math.min(TILE_SIZE, x + width - tx);
      const h = Math.min(TILE_SIZE, y + height - ty);
      ctx.drawImage(tileset, sx, sy, w, h, tx, ty, w, h);
    }
  }
}

function drawWallBorder(
  ctx: CanvasRenderingContext2D,
  tileset: HTMLImageElement,
  x: number,
  y: number,
  width: number,
  height: number,
) {
  const sx = WALL_TILE.col * TILE_PITCH;
  const sy = WALL_TILE.row * TILE_PITCH;
  for (let tx = x; tx < x + width; tx += TILE_SIZE) {
    const w = Math.min(TILE_SIZE, x + width - tx);
    ctx.drawImage(tileset, sx, sy, w, TILE_SIZE, tx, y, w, TILE_SIZE);
    ctx.drawImage(tileset, sx, sy, w, TILE_SIZE, tx, y + height - TILE_SIZE, w, TILE_SIZE);
  }
  for (let ty = y; ty < y + height; ty += TILE_SIZE) {
    const h = Math.min(TILE_SIZE, y + height - ty);
    ctx.drawImage(tileset, sx, sy, TILE_SIZE, h, x, ty, TILE_SIZE, h);
    ctx.drawImage(tileset, sx, sy, TILE_SIZE, h, x + width - TILE_SIZE, ty, TILE_SIZE, h);
  }
}

function drawAgentSprite(
  ctx: CanvasRenderingContext2D,
  tileset: HTMLImageElement,
  agent: OfficeAgentPosition,
  charRow: number,
  frame: number,
  state: AgentVisualState,
  selected: boolean,
) {
  const sx = (CHARACTER_COL_START + frame) * TILE_PITCH;
  const sy = charRow * TILE_PITCH;
  const drawX = Math.round(agent.x - TILE_SIZE / 2);
  const drawY = Math.round(agent.y - TILE_SIZE / 2);

  const tint = STATE_TINT[state];
  if (tint) {
    ctx.beginPath();
    ctx.fillStyle = tint;
    ctx.globalAlpha = state === "working" ? 0.55 + 0.25 * Math.sin(Date.now() / 200) : 0.6;
    ctx.arc(agent.x, agent.y + TILE_SIZE / 2 - 1, 9, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  if (selected) {
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 1.5;
    ctx.strokeRect(drawX - 2, drawY - 2, TILE_SIZE + 4, TILE_SIZE + 4);
  }

  ctx.drawImage(tileset, sx, sy, TILE_SIZE, TILE_SIZE, drawX, drawY, TILE_SIZE, TILE_SIZE);

  // Full names ("Marketing Agent") overlap a neighboring sprite's label at
  // this slot spacing — the first word is enough to identify who's who,
  // and the overlay panel (opened on click) always has the full name.
  const shortLabel = agent.label.split(" ")[0];
  ctx.fillStyle = "#cfd3da";
  ctx.font = "9px monospace";
  ctx.textAlign = "center";
  ctx.fillText(shortLabel, agent.x, drawY + TILE_SIZE + 3);
  ctx.textAlign = "left";
}
