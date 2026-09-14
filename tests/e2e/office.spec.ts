import { test, expect } from "@playwright/test";

// This view's centerpiece is a real WebGL (@react-three/fiber) scene now,
// not a 2D canvas with hand-computed pixel coordinates — clicking a
// specific 3D character would mean duplicating the camera's projection
// math just to compute a screen point, which isn't worth it for what it'd
// buy. What's covered here is everything DOM-based: the scene mounting,
// the left nav / category row navigation, and the activity feed/terminal
// actually rendering real fixture data. The scene's own visual correctness
// (camera framing, character/room rendering, the state glow) is verified
// with a real headless-browser screenshot instead — see the session notes
// for this pass.
test.describe("Office (demo mode)", () => {
  test("loads, shows the demo banner, and mounts the 3D scene", async ({ page }) => {
    const response = await page.goto("/office");
    expect(response?.status()).toBe(200);
    await expect(page.getByRole("heading", { name: "Office" })).toBeVisible();
    await expect(page.getByText("Demo mode")).toBeVisible();
    await expect(page.getByRole("img", { name: "Office scene" })).toBeVisible({ timeout: 10_000 });
  });

  test("the category row links to the app's real surfaces", async ({ page }) => {
    await page.goto("/office");
    // Scoped to the "Categories" landmark — the desktop-only left nav also
    // links to Documents/Approvals/etc, so an unscoped role query is
    // ambiguous on wide viewports.
    const categories = page.getByRole("navigation", { name: "Categories" });
    await expect(categories.getByRole("link", { name: "Documents" })).toBeVisible();

    await categories.getByRole("link", { name: "Approvals" }).click();
    await expect(page).toHaveURL(/\/approvals/);
  });

  test("the terminal strip streams real activity/log lines", async ({ page }) => {
    await page.goto("/office");
    const terminal = page.locator("div.font-mono");
    // Demo fixture (lib/demo-mode.ts) seeds two agent_run rows (Sales
    // success, Marketing error) and three audit_log rows — both kinds
    // should show up as raw lines, never invented ones.
    await expect(terminal.getByText(/agent_run/).first()).toBeVisible();
    await expect(terminal.getByText(/audit/).first()).toBeVisible();
  });

  test("desktop: left nav and activity feed show real data", async ({ page }) => {
    await page.goto("/office");
    if ((page.viewportSize()?.width ?? 0) < 768) test.skip();

    await expect(page.getByText("Room")).toBeVisible();
    const surfaces = page.getByRole("navigation", { name: "Surfaces" });
    await expect(surfaces.getByRole("link", { name: "Graph" })).toBeVisible();
    await expect(surfaces.getByRole("link", { name: "Memories" })).toBeVisible();

    // The demo Sales Agent run has real output text (lib/demo-mode.ts) —
    // the feed must show it, attributed by name, not a placeholder. "Sales"
    // also appears in the terminal strip's raw log lines, so scope to the
    // feed itself.
    const feed = page.getByTestId("activity-feed");
    await expect(feed.getByText("Sales Agent")).toBeVisible();
    await expect(feed.getByText(/confirm the pricing tier/)).toBeVisible();
  });
});
