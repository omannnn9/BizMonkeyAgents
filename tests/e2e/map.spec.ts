import { test, expect } from "@playwright/test";

test.describe("Living system map (demo mode)", () => {
  test("loads, shows the demo banner, and renders company + agent nodes", async ({ page }) => {
    const response = await page.goto("/map");
    expect(response?.status()).toBe(200);
    await expect(page.getByRole("heading", { name: /living system map/i })).toBeVisible();
    await expect(page.getByText("Demo mode")).toBeVisible();

    const svg = page.getByRole("img", { name: "Living system map" });
    await expect(svg).toBeVisible();
    await expect(svg.locator("text", { hasText: "OD Holdings" })).toBeVisible();
    await expect(svg.locator("text", { hasText: "Sales Agent" })).toBeVisible();
  });
});
