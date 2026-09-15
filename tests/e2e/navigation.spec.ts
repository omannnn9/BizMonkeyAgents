import { test, expect } from "@playwright/test";

const PAGES: Array<{ path: string; heading: RegExp }> = [
  { path: "/office", heading: /^colony$/i },
  { path: "/chat", heading: /^chat/i },
  { path: "/documents", heading: /^documents/i },
  { path: "/approvals", heading: /^approvals$/i },
];

// /graph, /hierarchy, and /brain are retired standalone routes — each is
// now a layer inside the World shell (/office), reached via
// WorldLayerSwitcher, not a page of its own. Kept as real redirects
// (rather than deleted outright) so an existing bookmark still lands
// somewhere real — this asserts each one actually does.
const RETIRED_ROUTE_REDIRECTS: Array<{ path: string; layer: string; layerLabel: string }> = [
  { path: "/graph", layer: "relationships", layerLabel: "Relationships" },
  { path: "/hierarchy", layer: "hierarchy", layerLabel: "Hierarchy" },
  { path: "/brain", layer: "knowledge", layerLabel: "Knowledge" },
];

test.describe("Navigation", () => {
  for (const { path, heading } of PAGES) {
    test(`${path} loads and renders its heading`, async ({ page }) => {
      const response = await page.goto(path);
      expect(response?.status()).toBe(200);
      await expect(page.getByRole("heading", { name: heading })).toBeVisible();
      // Every page must show the demo banner while no Supabase project exists.
      await expect(page.getByText("Demo mode")).toBeVisible();
    });
  }

  for (const { path, layer, layerLabel } of RETIRED_ROUTE_REDIRECTS) {
    test(`${path} redirects into the World shell's ${layerLabel} layer`, async ({ page }) => {
      const response = await page.goto(path);
      expect(response?.status()).toBe(200);
      await expect(page).toHaveURL(new RegExp(`/office\\?layer=${layer}`));
      await expect(page.getByRole("heading", { name: "Colony" })).toBeVisible();
      await expect(page.getByRole("button", { name: layerLabel })).toHaveAttribute("aria-pressed", "true");
    });
  }

  test("sidebar nav links navigate between the top-level and More pages", async ({ page }) => {
    // /office suppresses this sidebar in favor of its own left column (see
    // office.spec.ts) — every other page keeps it, so exercise it from one.
    // "Colony" is the nav label but the route path stays /office (a URL
    // slug is a technical detail, not brand-facing) — pathRegex is given
    // explicitly rather than derived from the label for that one entry.
    await page.goto("/chat");
    for (const { label, pathRegex } of [
      { label: "Documents", pathRegex: /\/documents/ },
      { label: "Approvals", pathRegex: /\/approvals/ },
      { label: "Colony", pathRegex: /\/office/ },
    ]) {
      const link = page.getByRole("link", { name: label, exact: true });
      // On mobile the nav (and each link) is hidden behind the hamburger
      // toggle, and re-closes itself after every navigation.
      if (!(await link.isVisible())) {
        await page.getByRole("button", { name: "Toggle navigation" }).click();
      }
      await link.click();
      await expect(page).toHaveURL(pathRegex);
    }
  });

  test("unknown route shows the styled not-found page, not a raw 404", async ({ page }) => {
    const response = await page.goto("/this-route-does-not-exist");
    expect(response?.status()).toBe(404);
    await expect(page.getByText("Page not found")).toBeVisible();
    await expect(page.getByRole("link", { name: /go to colony/i })).toBeVisible();
  });
});
