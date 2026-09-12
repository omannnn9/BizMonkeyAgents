import { test, expect } from "@playwright/test";

const PAGES: Array<{ path: string; heading: RegExp }> = [
  { path: "/dashboard", heading: /overview/i },
  { path: "/chat", heading: /^chat/i },
  { path: "/documents", heading: /^documents/i },
  { path: "/activity", heading: /^activity$/i },
  { path: "/approvals", heading: /^approvals$/i },
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

  test("sidebar links navigate between all five pages", async ({ page }) => {
    await page.goto("/dashboard");
    for (const label of ["Chat", "Documents", "Activity", "Approvals", "Dashboard"]) {
      const link = page.getByRole("link", { name: label, exact: true });
      // On mobile the nav (and each link) is hidden behind the hamburger
      // toggle, and re-closes itself after every navigation.
      if (!(await link.isVisible())) {
        await page.getByRole("button", { name: "Toggle navigation" }).click();
      }
      await link.click();
      await expect(page).toHaveURL(new RegExp(`/${label.toLowerCase()}`));
    }
  });

  test("unknown route shows the styled not-found page, not a raw 404", async ({ page }) => {
    const response = await page.goto("/this-route-does-not-exist");
    expect(response?.status()).toBe(404);
    await expect(page.getByText("Page not found")).toBeVisible();
    await expect(page.getByRole("link", { name: /go to dashboard/i })).toBeVisible();
  });
});
