import { defineConfig, devices } from "@playwright/test";

/**
 * Runs against the real app (real Supabase/Groq/Voyage credentials from the
 * environment — see .env.local) now that demo mode has been removed. There
 * are no spec files checked in yet (tests/e2e/ was entirely built around the
 * old demo-mode fixtures and was retired along with it — see docs/TESTING.md);
 * this config exists for whoever writes real specs next, from an environment
 * that can actually reach those services.
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
    url: "http://localhost:3000/office",
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
  },
});
