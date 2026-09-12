import { test, expect } from "@playwright/test";

test.describe("Knowledge graph (demo mode)", () => {
  test("loads, shows the demo banner, and renders nodes", async ({ page }) => {
    const response = await page.goto("/graph");
    expect(response?.status()).toBe(200);
    await expect(page.getByRole("heading", { name: /knowledge graph/i })).toBeVisible();
    await expect(page.getByText("Demo mode")).toBeVisible();

    // demoGraph() seeds OD Holdings + ODAX/Tablo/NOVA + Sales/Marketing agents.
    const svg = page.getByRole("img", { name: "Knowledge graph" });
    await expect(svg).toBeVisible();
    await expect(svg.locator("text", { hasText: "OD Holdings" })).toBeVisible();
    await expect(svg.locator("text", { hasText: "Sales Agent" })).toBeVisible();
  });

  test("clicking a node shows its detail panel with connections", async ({ page }) => {
    await page.goto("/graph");
    await expect(page.getByText("Click a node to see its details.")).toBeVisible();

    await page.getByRole("button", { name: "OD Holdings" }).click();

    const panel = page.getByTestId("graph-detail-panel");
    await expect(page.getByText("Click a node to see its details.")).toBeHidden();
    await expect(panel.getByText("OD Holdings", { exact: true })).toBeVisible();
    await expect(panel.getByText("Connections")).toBeVisible();
    // OD Holdings owns ODAX, Tablo, and NOVA.
    await expect(panel.getByText("— owns → ODAX")).toBeVisible();
  });
});
