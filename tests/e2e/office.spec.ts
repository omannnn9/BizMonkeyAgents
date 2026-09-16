import { test, expect } from "@playwright/test";

// This view's centerpiece is a real WebGL (@react-three/fiber) scene now,
// not a 2D canvas with hand-computed pixel coordinates — clicking a
// specific 3D character would mean duplicating the camera's projection
// math just to compute a screen point, which isn't worth it for what it'd
// buy. What's covered here is everything DOM-based: the scene mounting,
// the left nav / category row navigation, the World layer switcher, and
// the activity feed/terminal actually rendering real fixture data. Each
// spatial layer's own visual correctness (camera framing, district/
// Operator rendering, the state glow) is verified with a real
// headless-browser screenshot instead — see the session notes for this
// pass.
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
    // Demo fixture (lib/demo-mode.ts) seeds agent_run rows (Sales Lead
    // success, Marketing Lead error) and three audit_log rows — both kinds
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
    // Sales Lead has hasPendingApproval: true and a successful last run ->
    // "awaiting approval"; Marketing Lead's last run errored -> "blocked";
    // the Group CFO has never run -> "sleeping". Real, distinct fixture
    // states, not invented ones.
    await expect(hud.getByText(/awaiting approval/)).toBeVisible();
    await expect(hud.getByText(/blocked/)).toBeVisible();
    await expect(hud.getByText(/sleeping/)).toBeVisible();
  });

  test("World layer switcher swaps the viewport without navigating away", async ({ page }) => {
    await page.goto("/office");
    const switcher = page.getByRole("navigation", { name: "World layers" });
    const orgButton = switcher.getByRole("button", { name: "Organization" });
    await expect(orgButton).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByRole("img", { name: "Colony scene" })).toBeVisible({ timeout: 10_000 });

    await switcher.getByRole("button", { name: "Relationships" }).click();
    await expect(page).toHaveURL(/\/office\?layer=relationships/);
    await expect(page.getByRole("img", { name: "Knowledge graph" })).toBeVisible();
    await expect(orgButton).toHaveAttribute("aria-pressed", "false");

    await switcher.getByRole("button", { name: "Hierarchy" }).click();
    await expect(page).toHaveURL(/\/office\?layer=hierarchy/);
    await expect(page.getByRole("img", { name: "Hierarchy map" })).toBeVisible();

    await switcher.getByRole("button", { name: "Knowledge" }).click();
    await expect(page).toHaveURL(/\/office\?layer=knowledge/);
    await expect(page.getByRole("img", { name: "AI Brain" })).toBeVisible({ timeout: 10_000 });

    // Back to Organization: the URL loses its ?layer= param entirely
    // rather than carrying an explicit "?layer=organization".
    await switcher.getByRole("button", { name: "Organization" }).click();
    await expect(page).toHaveURL(/\/office$/);
    await expect(page.getByRole("img", { name: "Colony scene" })).toBeVisible();

    // The World shell's chrome — the header, the layer switcher itself —
    // never unmounted across any of those switches, unlike a real
    // navigation. LeftNav is desktop-only, so this part only applies there.
    // Exact match: "District" is also a substring of the Organization
    // layer's own "Districts are companies..." description text.
    if ((page.viewportSize()?.width ?? 0) >= 768) {
      await expect(page.getByText("District", { exact: true })).toBeVisible();
    }
  });

  test("desktop: left nav and activity feed show real data", async ({ page }) => {
    await page.goto("/office");
    if ((page.viewportSize()?.width ?? 0) < 768) test.skip();

    // Exact match: "District" is also a substring of the Organization
    // layer's own "Districts are companies..." description text (same
    // pre-existing strict-mode trap fixed above for the layer-switcher test).
    await expect(page.getByText("District", { exact: true })).toBeVisible();
    const surfaces = page.getByRole("navigation", { name: "Surfaces" });
    await expect(surfaces.getByRole("link", { name: "Documents" })).toBeVisible();
    await expect(surfaces.getByRole("link", { name: "Memories" })).toBeVisible();

    // The demo Sales Lead run has real output text (lib/demo-mode.ts) — the
    // feed must show it, attributed by name and rank, not a placeholder.
    // "Sales" also appears in the terminal strip's raw log lines, so scope
    // to the feed itself. Sales Lead now has two demo runs (its original
    // task-status reply, and the more recent request_from_agent
    // collaboration with Marketing Lead) — .first() since both are real,
    // not a strict-mode bug.
    const feed = page.getByTestId("activity-feed");
    await expect(feed.getByText("Sales Lead").first()).toBeVisible();
    await expect(feed.getByText("Department Lead").first()).toBeVisible();
    await expect(feed.getByText(/confirm the pricing tier/)).toBeVisible();
  });

  test("a recent request_from_agent collaboration shows up in the activity feed", async ({ page }) => {
    await page.goto("/office");
    if ((page.viewportSize()?.width ?? 0) < 768) test.skip();

    // demoActivity()'s third fixture run (lib/demo-mode.ts) is a real,
    // recent Sales Lead -> Marketing Lead request_from_agent call — the
    // same shape a live agent_runs.tool_calls row would carry, and the
    // source for the Colony's collaboration beam (see lib/collaboration.ts).
    // The beam itself is inside the WebGL canvas and not asserted here
    // (same 3D-click trade-off documented at the top of this file) —
    // what's testable is the real reply text surfacing in the DOM-based
    // feed.
    const feed = page.getByTestId("activity-feed");
    await expect(feed.getByText(/Marketing Lead replied/)).toBeVisible();
  });
});
