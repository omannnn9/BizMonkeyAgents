import { test, expect } from "@playwright/test";

test.describe("3D headquarters (demo mode)", () => {
  test("loads, shows the demo banner, and mounts the 3D canvas", async ({ page }) => {
    const response = await page.goto("/hq");
    expect(response?.status()).toBe(200);
    await expect(page.getByRole("heading", { name: /3d headquarters/i })).toBeVisible();
    await expect(page.getByText("Demo mode")).toBeVisible();

    // react-three-fiber always mounts a <canvas> once the dynamic import
    // resolves, regardless of whether WebGL rendering itself succeeds in
    // this environment — that's the scene's data/plumbing working, which
    // is what this check is for, not pixel-level rendering correctness.
    await expect(page.locator("canvas")).toBeVisible({ timeout: 10_000 });
  });
});
