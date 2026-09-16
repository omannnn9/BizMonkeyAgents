import { test, expect } from "@playwright/test";

// Hierarchy is now a layer inside the World shell (/office), not a
// standalone route — /hierarchy redirects into it. See office.spec.ts's
// header comment for the layer-switching coverage and the 3D-click
// trade-off shared across every spatial layer.
test.describe("Hierarchy layer (demo mode)", () => {
  test("the retired /hierarchy route redirects into the World shell's Hierarchy layer with the real tree", async ({
    page,
  }) => {
    const response = await page.goto("/hierarchy");
    expect(response?.status()).toBe(200);
    await expect(page).toHaveURL(/\/office\?layer=hierarchy/);
    await expect(page.getByRole("heading", { name: "Colony" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Hierarchy" })).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByText("Demo mode")).toBeVisible();

    // demoMap() seeds OD Holdings + ODAX/Tablo/NOVA + Sales Lead/Marketing
    // Lead agents (+ Group CFO) — the tree should show the founder, the real
    // company ownership, and real Operator rank labels, never placeholders.
    const svg = page.getByRole("img", { name: "Hierarchy map" });
    await expect(svg).toBeVisible();
    await expect(svg.locator("text", { hasText: "Founder" })).toBeVisible();
    await expect(svg.locator("text", { hasText: "OD Holdings" })).toBeVisible();
    await expect(svg.locator("text", { hasText: "Sales Lead" })).toBeVisible();
    await expect(svg.locator("text", { hasText: "Department Lead" }).first()).toBeVisible();
  });

  test("clicking an Operator opens its overlay with real data", async ({ page }) => {
    await page.goto("/office?layer=hierarchy");
    await page.getByRole("button", { name: /Sales Lead — Department Lead/ }).click();

    // Now that Hierarchy is a layer inside the World shell, the right-hand
    // ActivityFeed is visible at the same time and shows "Sales Lead"/
    // "Department Lead" too — scope to the overlay itself (a real
    // data-testid, not a DOM-order guess) rather than the old page's "just
    // grab the last match" trick, which the shell's extra chrome would now
    // break.
    const panel = page.getByTestId("office-agent-panel");
    await expect(panel.getByRole("heading", { name: "Sales Lead" })).toBeVisible();
    await expect(panel.getByText("Department Lead")).toBeVisible();
    await expect(panel.getByText("Pending approvals (1)")).toBeVisible();
    await expect(panel.getByText("send_email")).toBeVisible();
  });

  test("clicking a company node switches the active company", async ({ page }) => {
    await page.goto("/office?layer=hierarchy");
    await page.getByRole("button", { name: "ODAX" }).click();

    const selectedOption = page.locator("select:visible").first().locator("option:checked");
    await expect(selectedOption).toHaveText("ODAX");
  });
});
