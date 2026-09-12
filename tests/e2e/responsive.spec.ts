import { test, expect, devices } from "@playwright/test";

test.describe("Responsive layout", () => {
  // Viewport-only override (not the full device preset) — a preset also sets
  // browserName/defaultBrowserType, which can't merge with the project-level
  // launchOptions override and forces an unsupported extra worker config.
  test.use({ viewport: devices["iPhone 13"].viewport });

  test("mobile: nav is hidden behind a hamburger toggle", async ({ page }) => {
    await page.goto("/dashboard");
    const nav = page.getByRole("link", { name: "Chat", exact: true });
    await expect(nav).toBeHidden();

    await page.getByRole("button", { name: "Toggle navigation" }).click();
    await expect(nav).toBeVisible();

    await nav.click();
    await expect(page).toHaveURL(/\/chat/);
  });

  test("mobile: company switcher moves below the header", async ({ page }) => {
    await page.goto("/dashboard");
    // Both a desktop and mobile <select> exist in the DOM at all times
    // (CSS toggles which is shown) — :visible picks the active one.
    await expect(page.locator("select:visible")).toBeVisible();
  });

  test("no horizontal overflow at phone width", async ({ page }) => {
    await page.goto("/dashboard");
    const hasOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    );
    expect(hasOverflow).toBe(false);
  });
});
