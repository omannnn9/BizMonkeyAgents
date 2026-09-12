import { test, expect } from "@playwright/test";

test.describe("Memories (demo mode)", () => {
  test("loads, shows the demo banner, and lists group + company memories for ODAX", async ({ page }) => {
    const response = await page.goto("/memories");
    expect(response?.status()).toBe(200);
    await expect(page.getByRole("heading", { name: "Memories" })).toBeVisible();
    await expect(page.getByText("Demo mode")).toBeVisible();

    // Default active company is group-level (OD Holdings) — only the
    // already-promoted group memory shows there.
    await expect(page.getByText(/home-based producers/)).toBeVisible();
    // The demo group memory is also the "promoted" example, so its badge
    // reads "group · promoted" rather than bare "group".
    await expect(page.getByText("group · promoted")).toBeVisible();

    // Switch to ODAX: the original company-scope memory appears too, with
    // a "Promote to group" action the group one doesn't have.
    await page.locator("select:visible").first().selectOption({ label: "ODAX" });
    await expect(page.getByRole("button", { name: "Promote to group" })).toBeVisible();
  });

  test("promoting a memory round-trips without erroring", async ({ page }) => {
    await page.goto("/memories");
    await page.locator("select:visible").first().selectOption({ label: "ODAX" });
    await page.getByRole("button", { name: "Promote to group" }).click();
    await expect(page.getByText(/Demo mode — promotion not persisted/)).toBeVisible();
  });
});
