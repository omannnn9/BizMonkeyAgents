import { test, expect } from "@playwright/test";

test.describe("Hierarchy (demo mode)", () => {
  test("loads, shows the demo banner, and renders the tree", async ({ page }) => {
    const response = await page.goto("/hierarchy");
    expect(response?.status()).toBe(200);
    await expect(page.getByRole("heading", { name: "Hierarchy" })).toBeVisible();
    await expect(page.getByText("Demo mode")).toBeVisible();

    // demoMap() seeds OD Holdings + ODAX/Tablo/NOVA + Sales/Marketing agents
    // (+ Group CFO) — the tree should show the founder, the real company
    // ownership, and real Operator rank labels, never placeholders.
    const svg = page.getByRole("img", { name: "Hierarchy map" });
    await expect(svg).toBeVisible();
    await expect(svg.locator("text", { hasText: "Founder" })).toBeVisible();
    await expect(svg.locator("text", { hasText: "OD Holdings" })).toBeVisible();
    await expect(svg.locator("text", { hasText: "Sales Agent" })).toBeVisible();
    await expect(svg.locator("text", { hasText: "Sales Lead" })).toBeVisible();
  });

  test("clicking an Operator opens its overlay with real data", async ({ page }) => {
    await page.goto("/hierarchy");
    await page.getByRole("button", { name: /Sales Agent — Sales Lead/ }).click();

    // "Sales Lead" also appears in the tree node behind the overlay, so
    // scope to the last match — the overlay renders after the tree in the
    // DOM, same "duplicate label across two zones" situation navigation.spec.ts
    // already handles for the office/colony page.
    await expect(page.getByRole("heading", { name: "Sales Agent" })).toBeVisible();
    await expect(page.getByText("Sales Lead").last()).toBeVisible();
    await expect(page.getByText("Pending approvals (1)")).toBeVisible();
    await expect(page.getByText("send_email")).toBeVisible();
  });

  test("clicking a company node switches the active company", async ({ page }) => {
    await page.goto("/hierarchy");
    await page.getByRole("button", { name: "ODAX" }).click();

    const selectedOption = page.locator("select:visible").first().locator("option:checked");
    await expect(selectedOption).toHaveText("ODAX");
  });
});
