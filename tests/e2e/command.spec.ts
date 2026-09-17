import { test, expect } from "@playwright/test";

// The Founder Command Center (Phase 4) — every section traces to a real
// demo-mode fixture (lib/demo-mode.ts's demoCommand()), reusing the exact
// same approvals/activity/synergy data every other page already asserts
// against, not a separate invented story just for this page.
test.describe("Command Center (demo mode)", () => {
  test("loads and shows the demo banner", async ({ page }) => {
    const response = await page.goto("/command");
    expect(response?.status()).toBe(200);
    await expect(page.getByRole("heading", { name: "Command Center" })).toBeVisible();
    await expect(page.getByText("Demo mode")).toBeVisible();
  });

  test("Attention Center totals the real pending approval, blocked task, overdue task, and at-risk goal", async ({
    page,
  }) => {
    await page.goto("/command");
    const attention = page.getByTestId("attention-center");
    await expect(attention.getByText("Attention Center (4)")).toBeVisible();
    await expect(attention.getByText(/send_email/)).toBeVisible();
    await expect(attention.getByText(/QR scan flow fix blocked/)).toBeVisible();
    await expect(attention.getByText(/Confirm ODAX pricing tier/)).toBeVisible();
    await expect(attention.getByText(/Grow Tablo restaurant partners/)).toBeVisible();
  });

  test("Opportunities shows the real cross-company synergy candidate", async ({ page }) => {
    await page.goto("/command");
    const opportunities = page.getByTestId("opportunities");
    await expect(opportunities.getByText(/ODAX ↔ Tablo/)).toBeVisible();
    await expect(opportunities.getByText(/home-based producers/)).toBeVisible();
  });

  test("Company Health shows real per-company counts", async ({ page }) => {
    await page.goto("/command");
    const odaxHealth = page.getByTestId("company-health-00000000-0000-0000-0000-000000000002");
    await expect(odaxHealth.getByText("ODAX")).toBeVisible();
    // demoCommand()'s ODAX fixture: 4 open tasks, 1 pending approval.
    const dd = odaxHealth.locator("dd");
    await expect(dd.first()).toHaveText("4");
  });

  test("Company Health surfaces real industry/ownership/market data from companies.config (Phase 6)", async ({
    page,
  }) => {
    await page.goto("/command");
    const odaxHealth = page.getByTestId("company-health-00000000-0000-0000-0000-000000000002");
    // Mirrors 0002_seed_companies.sql's real seeded config for ODAX —
    // previously seeded but invisible anywhere in the UI.
    await expect(odaxHealth.getByText(/bookings SaaS/)).toBeVisible();
    await expect(odaxHealth.getByText(/60% Founder/)).toBeVisible();
    await expect(odaxHealth.getByText(/Mauritius/)).toBeVisible();
  });

  test("Weekly Executive Briefing generates a real, labeled demo reply on demand", async ({ page }) => {
    await page.goto("/command");
    const briefingPanel = page.getByTestId("weekly-briefing");
    await briefingPanel.getByRole("button", { name: "Generate" }).click();
    await expect(briefingPanel.getByText("Demo mode", { exact: false })).toBeVisible();
    await expect(briefingPanel.getByText(/Chief of Staff/)).toBeVisible();
  });

  test("Daily Briefings shows the real not-yet-deployed example, honestly labeled", async ({ page }) => {
    await page.goto("/command");
    const briefings = page.getByTestId("daily-briefings");
    await expect(briefings.getByText(/Example only — the daily briefing isn't deployed yet/)).toBeVisible();
  });

  test("Agent Activity shows real run output from the demo fixture", async ({ page }) => {
    await page.goto("/command");
    const activity = page.getByTestId("agent-activity");
    await expect(activity.getByText(/confirm the pricing tier/)).toBeVisible();
  });
});
