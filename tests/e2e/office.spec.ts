import { test, expect } from "@playwright/test";

// This view's centerpiece is a real WebGL (@react-three/fiber) scene now,
// not a 2D canvas with hand-computed pixel coordinates — clicking a
// specific 3D character would mean duplicating the camera's projection
// math just to compute a screen point, which isn't worth it for what it'd
// buy. What's covered here is everything DOM-based: the scene mounting,
// the left nav / category row navigation, and the activity feed/terminal
// actually rendering real fixture data. The scene's own visual correctness
// (camera framing, district/Operator rendering, the state glow) is verified
// with a real headless-browser screenshot instead — see the session notes
// for this pass.
test.describe("Colony (demo mode)", () => {
  test("loads, shows the demo banner, and mounts the 3D scene", async ({ page }) => {
    const response = await page.goto("/office");
    expect(response?.status()).toBe(200);
    await expect(page.getByRole("heading", { name: "Colony" })).toBeVisible();
    await expect(page.getByText("Demo mode")).toBeVisible();
    await expect(page.getByRole("img", { name: "Colony scene" })).toBeVisible({ timeout: 10_000 });
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

  test("Command Mode HUD shows real org-wide counts", async ({ page }) => {
    await page.goto("/office");
    const toggle = page.getByRole("button", { name: "Command Mode" });
    await expect(toggle).toHaveAttribute("aria-pressed", "false");
    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-pressed", "true");

    // demoMap() (lib/demo-mode.ts) seeds 4 companies and 3 agents, unscoped
    // by whichever company happens to be active in the switcher — the HUD
    // reads the same org-wide /api/map data the whole scene already loads.
    const hud = page.getByTestId("command-hud");
    await expect(hud.getByText("4", { exact: true })).toBeVisible();
    await expect(hud.getByText("3", { exact: true })).toBeVisible();
    // Sales Agent has hasPendingApproval: true and a successful last run ->
    // "awaiting approval"; Marketing Agent's last run errored -> "blocked";
    // the Group CFO has never run -> "sleeping". Real, distinct fixture
    // states, not invented ones.
    await expect(hud.getByText(/awaiting approval/)).toBeVisible();
    await expect(hud.getByText(/blocked/)).toBeVisible();
    await expect(hud.getByText(/sleeping/)).toBeVisible();
  });

  test("desktop: left nav and activity feed show real data", async ({ page }) => {
    await page.goto("/office");
    if ((page.viewportSize()?.width ?? 0) < 768) test.skip();

    await expect(page.getByText("District")).toBeVisible();
    const surfaces = page.getByRole("navigation", { name: "Surfaces" });
    await expect(surfaces.getByRole("link", { name: "Graph" })).toBeVisible();
    await expect(surfaces.getByRole("link", { name: "Memories" })).toBeVisible();

    // The demo Sales Agent run has real output text (lib/demo-mode.ts) —
    // the feed must show it, attributed by name and rank, not a
    // placeholder. "Sales" also appears in the terminal strip's raw log
    // lines, so scope to the feed itself.
    const feed = page.getByTestId("activity-feed");
    await expect(feed.getByText("Sales Agent")).toBeVisible();
    await expect(feed.getByText("Sales Lead")).toBeVisible();
    await expect(feed.getByText(/confirm the pricing tier/)).toBeVisible();
  });
});
