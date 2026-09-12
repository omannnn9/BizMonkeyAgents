import { test, expect } from "@playwright/test";

// The CockpitShell always renders two <select> company switchers (one for
// desktop, one for the mobile header row) and toggles which is visible via
// CSS — both exist in the DOM at every viewport. `:visible` picks the one
// actually shown at the current viewport.
const visibleSwitcher = (page: import("@playwright/test").Page) => page.locator("select:visible");

test.describe("Dashboard (demo mode)", () => {
  test("loads directly with no login redirect", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/dashboard$/);
    await expect(page.getByText("Demo mode")).toBeVisible();
  });

  test("shows the company switcher with all four companies", async ({ page }) => {
    await page.goto("/dashboard");
    const switcher = visibleSwitcher(page);
    await expect(switcher).toBeVisible();
    const options = await switcher.locator("option").allTextContents();
    expect(options.some((o) => o.includes("OD Holdings"))).toBe(true);
    expect(options).toContain("ODAX");
    expect(options).toContain("Tablo");
    expect(options).toContain("NOVA");
  });

  test("shows real-shaped stat cards, never blank/undefined", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page.getByText("Open tasks")).toBeVisible();
    await expect(page.getByText("Pending approvals")).toBeVisible();
    await expect(page.getByText("Last agent run")).toBeVisible();
    await expect(page.getByText("Recent decisions")).toBeVisible();
    // innerText (not textContent) — excludes the inline RSC payload <script>
    // tag content, which legitimately contains the literal string
    // "$undefined" as part of React's serialized framework internals.
    const visibleText = await page.locator("body").innerText();
    expect(visibleText).not.toContain("undefined");
    expect(visibleText).not.toContain("NaN");
  });

  test("switching companies re-fetches without a full page reload", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page.getByRole("heading", { name: /overview/i })).toBeVisible();
    const urlBefore = page.url();

    await visibleSwitcher(page).selectOption({ label: "ODAX" });
    await expect(page.getByRole("heading", { name: /ODAX overview/i })).toBeVisible();

    // A real navigation/reload would change the URL (or at minimum
    // round-trip through it); a client-state switch never does.
    expect(page.url()).toBe(urlBefore);
  });
});
