import { test, expect } from "@playwright/test";

test.describe("Documents (demo mode)", () => {
  test("loads, shows the demo banner, and lists real fixture documents with type badges", async ({ page }) => {
    const response = await page.goto("/documents");
    expect(response?.status()).toBe(200);
    await expect(page.getByRole("heading", { name: /^Documents/ })).toBeVisible();
    await expect(page.getByText("Demo mode")).toBeVisible();

    // demoDocuments() (lib/demo-mode.ts) seeds two real fixture rows, one
    // text/markdown and one text/plain — their real mime_type must resolve
    // to the correct, distinct type badge, not a placeholder. Both titles
    // and both badges are unique on the page, so a plain text match is
    // enough to prove real data drove both.
    await expect(page.getByText("Q3 board update.md")).toBeVisible();
    await expect(page.getByText("MD", { exact: true })).toBeVisible();
    await expect(page.getByText("ODAX pricing notes.txt")).toBeVisible();
    await expect(page.getByText("TXT", { exact: true })).toBeVisible();
  });

  test("upload control is present and accepts the supported file types", async ({ page }) => {
    await page.goto("/documents");
    const input = page.locator('input[type="file"]');
    await expect(input).toHaveAttribute("accept", ".txt,.md,.csv,.pdf,.docx");
    await expect(page.getByRole("button", { name: "Upload" })).toBeVisible();
  });
});
