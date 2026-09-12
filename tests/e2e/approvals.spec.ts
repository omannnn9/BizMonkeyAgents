import { test, expect } from "@playwright/test";

test.describe("Approvals (demo mode)", () => {
  test("shows the pending send_email approval with a readable payload", async ({ page }) => {
    await page.goto("/approvals");
    await expect(page.getByText("send_email").first()).toBeVisible();
    await expect(page.getByText("md@example.com")).toBeVisible();
    await expect(page.getByText("Q3 numbers follow-up")).toBeVisible();
    await expect(page.getByRole("button", { name: "Approve" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Reject" })).toBeVisible();
  });

  test("approve button round-trips without erroring", async ({ page }) => {
    await page.goto("/approvals");
    await page.getByRole("button", { name: "Approve" }).click();
    await expect(page.getByText(/Action (executed|approved)/)).toBeVisible();
  });

  test("shows decided approvals under History", async ({ page }) => {
    await page.goto("/approvals");
    await expect(page.getByText("History")).toBeVisible();
    await expect(page.getByText("executed")).toBeVisible();
  });
});
