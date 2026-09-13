import { test, expect } from "@playwright/test";

// Coordinates below are derived from lib/office-layout.ts's deterministic
// grid (ROOM_GAP=24, ROOM_PADDING=20, ROOM_HEADER=30, AGENT_SLOT=54) applied
// to demoMap()'s fixture in lib/demo-mode.ts: OD Holdings (with the Group
// CFO agent) is always the first room at (24,24), and the sole agent sits
// at its room's first grid slot, (71, 81).
const HOLDINGS_ROOM = { x: 24, y: 24 };
const GROUP_CFO_AGENT = { x: 71, y: 81 };

test.describe("Office (demo mode)", () => {
  test("loads, shows the demo banner, and mounts the office canvas", async ({ page }) => {
    const response = await page.goto("/office");
    expect(response?.status()).toBe(200);
    await expect(page.getByRole("heading", { name: "Office" })).toBeVisible();
    await expect(page.getByText("Demo mode")).toBeVisible();
    await expect(page.getByRole("img", { name: "Office scene" })).toBeVisible();
  });

  test("clicking a company's room focuses that company", async ({ page }) => {
    await page.goto("/office");
    const scene = page.getByRole("img", { name: "Office scene" });
    await expect(scene).toBeVisible();

    // Click inside the OD Holdings room but away from its agent sprite —
    // any point inside the room rect, outside the agent hit radius, filters
    // the scene to that company via the same setActiveCompanyId() the
    // header's CompanySwitcher already uses.
    await scene.click({ position: { x: HOLDINGS_ROOM.x + 5, y: HOLDINGS_ROOM.y + 5 } });
    await expect(page.getByRole("heading", { name: "OD Holdings" })).toBeVisible();
  });

  test("clicking an agent sprite opens its chat/runs/approvals overlay", async ({ page }) => {
    await page.goto("/office");
    const scene = page.getByRole("img", { name: "Office scene" });
    await expect(scene).toBeVisible();

    await scene.click({ position: GROUP_CFO_AGENT });

    await expect(page.getByRole("heading", { name: "Group CFO" })).toBeVisible();
    await expect(page.getByPlaceholder("Message the Group CFO…")).toBeVisible();
    await expect(page.getByRole("heading", { name: /Pending approvals/ })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Recent runs" })).toBeVisible();

    await page.getByRole("button", { name: "Close" }).click();
    await expect(page.getByPlaceholder("Message the Group CFO…")).not.toBeVisible();
  });
});
