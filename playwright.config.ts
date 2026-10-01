import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",

  use: {
    baseURL: "http://127.0.0.1:3000",
    trace: "on-first-retry",
  },

  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],

  webServer: [
    {
      // Stands in for Sentry. `pnpm test:e2e` builds with a DSN that points here.
      command: "node tests/e2e/support/sentry-stub.ts",
      url: "http://127.0.0.1:9999",
      reuseExistingServer: false,
    },
    {
      command: "./scripts/start-e2e-server.sh",
      url: "http://127.0.0.1:3000",
      reuseExistingServer: false,
      timeout: 180_000,
    },
  ],
});
