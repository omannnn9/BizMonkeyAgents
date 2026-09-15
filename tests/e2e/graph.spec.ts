import { test, expect } from "@playwright/test";

// Relationships is now a layer inside the World shell (/office), not a
// standalone route — /graph redirects into it. See office.spec.ts's
// header comment for the layer-switching coverage and the 3D-click
// trade-off shared across every spatial layer.
test.describe("Relationships layer (demo mode)", () => {
  test("the retired /graph route redirects into the World shell's Relationships layer with real nodes", async ({
    page,
  }) => {
    const response = await page.goto("/graph");
    expect(response?.status()).toBe(200);
    await expect(page).toHaveURL(/\/office\?layer=relationships/);
    await expect(page.getByRole("heading", { name: "Colony" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Relationships" })).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByText("Demo mode")).toBeVisible();

    // demoGraph() seeds OD Holdings + ODAX/Tablo/NOVA + Sales/Marketing agents.
    const svg = page.getByRole("img", { name: "Knowledge graph" });
    await expect(svg).toBeVisible();
    await expect(svg.locator("text", { hasText: "OD Holdings" })).toBeVisible();
    await expect(svg.locator("text", { hasText: "Sales Agent" })).toBeVisible();
  });

  test("clicking a node shows its detail panel with connections", async ({ page }) => {
    await page.goto("/office?layer=relationships");
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
