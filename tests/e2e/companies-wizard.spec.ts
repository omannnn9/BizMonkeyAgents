import { test, expect } from "@playwright/test";

test.describe("Creator wizards (demo mode)", () => {
  test("new company form round-trips and redirects to the dashboard", async ({ page }) => {
    await page.goto("/companies/new");
    await expect(page.getByRole("heading", { name: "New company" })).toBeVisible();

    await page.getByLabel("Name").fill("Test Co");
    await expect(page.getByLabel("Slug")).toHaveValue("test-co");
    await page.getByRole("button", { name: "Create company" }).click();

    await expect(page).toHaveURL(/\/dashboard$/);
  });

  test("new agent form round-trips and redirects to chat", async ({ page }) => {
    await page.goto("/agents/new");
    await expect(page.getByRole("heading", { name: "New agent" })).toBeVisible();

    await page.getByLabel("Name").fill("Support Agent");
    await page.getByLabel("Persona / system prompt").fill("You help with customer support.");
    await page.getByRole("button", { name: "Create agent" }).click();

    await expect(page).toHaveURL(/\/chat$/);
  });
});
