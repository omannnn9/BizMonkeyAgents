import { test, expect } from "@playwright/test";

// Knowledge is now a layer inside the World shell (/office), not a
// standalone route — /brain redirects into it. The core and memory/
// document nodes are a real WebGL (@react-three/fiber) scene, same
// trade-off as the colony world: clicking a specific node would mean
// duplicating the camera's projection math just to compute a screen
// point, which isn't worth it for what it'd buy. What's covered here is
// everything DOM-based (the scene mounting, the real stat counts). The
// click → detail-panel interaction was verified manually with a real
// headless-browser screenshot instead — see office.spec.ts's header
// comment for the same trade-off made the same way on the colony world.
test.describe("Knowledge layer (demo mode)", () => {
  test("the retired /brain route redirects into the World shell's Knowledge layer with real counts", async ({
    page,
  }) => {
    const response = await page.goto("/brain");
    expect(response?.status()).toBe(200);
    await expect(page).toHaveURL(/\/office\?layer=knowledge/);
    await expect(page.getByRole("heading", { name: "Colony" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Knowledge" })).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByText("Demo mode")).toBeVisible();

    // demoBrain() seeds 3 real memories (1 group, 2 company) and 2 fixture
    // documents (matching demoDocuments()) — the stat row and the scene's
    // own document node count must reflect those exact counts, never a
    // placeholder.
    await expect(page.getByText("3 memories retained")).toBeVisible();
    await expect(page.getByText("2 documents indexed")).toBeVisible();
    await expect(page.getByText("1 cross-company connection")).toBeVisible();

    await expect(page.getByRole("img", { name: "AI Brain" })).toBeVisible({ timeout: 10_000 });
  });
});
