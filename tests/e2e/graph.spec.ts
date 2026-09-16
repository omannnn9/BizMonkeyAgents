import { test, expect } from "@playwright/test";

// Relationships is now a real WebGL (@react-three/fiber) scene — nodes
// spread across type-based depth bands, not a flat 2D force-graph — same
// trade-off as the Organization and Knowledge layers: clicking a specific
// node would mean duplicating the camera's projection math just to
// compute a screen point, which isn't worth it for what it'd buy. What's
// covered here is everything DOM-based: the scene mounting and real node
// labels, rendered as real text via drei's <Html> (never <Text>, which
// fetches a font over the network and breaks in this sandbox) — same
// technique the Organization layer's Operator labels already use. The
// click → detail-panel interaction was verified manually with a real
// headless-browser screenshot instead — see office.spec.ts's header
// comment for the same trade-off made the same way on the colony world.
test.describe("Relationships layer (demo mode)", () => {
  test("the retired /graph route redirects into the World shell's Relationships layer with real nodes", async ({
    page,
  }) => {
    const response = await page.goto("/graph");
    expect(response?.status()).toBe(200);
    await expect(page).toHaveURL(/\/office\?layer=relationships/);
    await expect(page.getByRole("heading", { name: "Colony" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Relationships" })).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByText("Demo mode")).toBeVisible();

    // demoGraph() seeds OD Holdings + ODAX/Tablo/NOVA + Sales Lead/Marketing
    // Lead agents — scoped to the scene container since "Sales Lead" also
    // appears in the right-hand ActivityFeed alongside every layer now.
    const scene = page.getByTestId("graph-scene");
    await expect(scene.getByRole("img", { name: "Knowledge graph" })).toBeVisible({ timeout: 10_000 });
    await expect(scene.getByText("OD Holdings")).toBeVisible();
    await expect(scene.getByText("Sales Lead")).toBeVisible();
  });
});
