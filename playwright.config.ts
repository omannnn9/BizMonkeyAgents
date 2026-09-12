import { defineConfig, devices } from "@playwright/test";

/**
 * Runs against demo mode (lib/demo-mode.ts) by design — no Supabase project
 * is required for these to pass. They verify the UI shell, navigation, and
 * demo-data rendering; they do NOT verify real data flows (RLS isolation,
 * real agent responses, real approvals) — those need scripts/test-rls-isolation.ts
 * etc. against a live project instead.
 */
export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: "list",
  use: {
    baseURL: "http://localhost:3000",
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        launchOptions: { executablePath: "/opt/pw-browsers/chromium" },
      },
    },
    {
      name: "mobile-chromium",
      use: {
        ...devices["Pixel 7"],
        launchOptions: { executablePath: "/opt/pw-browsers/chromium" },
      },
    },
  ],
  webServer: {
    command: "npm run dev",
    url: "http://localhost:3000/dashboard",
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
    env: {
      // Deliberately empty/unset Supabase config forces demo mode.
      NEXT_PUBLIC_SUPABASE_URL: "",
      SUPABASE_SERVICE_ROLE_KEY: "",
    },
  },
});
