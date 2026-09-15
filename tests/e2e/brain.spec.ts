import { test, expect } from "@playwright/test";

// The core and memory nodes are a real WebGL (@react-three/fiber) scene,
// same trade-off as the colony world: clicking a specific memory node
// would mean duplicating the camera's projection math just to compute a
// screen point, which isn't worth it for what it'd buy. What's covered
// here is everything DOM-based (the scene mounting, the real stat counts,
// the empty-synergy honesty message). The click → detail-panel
// interaction was verified manually with a real headless-browser
// screenshot instead — see office.spec.ts's header comment for the same
// trade-off made the same way on the colony world.
test.describe("AI Brain (demo mode)", () => {
  test("loads, shows the demo banner, and mounts the scene with real counts", async ({ page }) => {
    const response = await page.goto("/brain");
    expect(response?.status()).toBe(200);
    await expect(page.getByRole("heading", { name: "AI Brain" })).toBeVisible();
    await expect(page.getByText("Demo mode")).toBeVisible();

    // demoBrain() seeds 3 real memories (1 group, 2 company) and 2 fixture
    // documents — the stat row must reflect those exact counts, never a
    // placeholder.
    await expect(page.getByText("3 memories retained")).toBeVisible();
    await expect(page.getByText("2 documents indexed")).toBeVisible();
    await expect(page.getByText("1 cross-company connection")).toBeVisible();

    await expect(page.getByRole("img", { name: "AI Brain" })).toBeVisible({ timeout: 10_000 });
  });
});
