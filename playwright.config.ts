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
      // Stands in for Sentry and PostHog. `scripts/build-e2e.sh` points both here.
      command: "node tests/e2e/support/observability-stub.ts",
      url: "http://127.0.0.1:9999",
      reuseExistingServer: false,
    },
    {
      command: "./scripts/start-e2e-server.sh",
      url: "http://127.0.0.1:3000",
      // Better Auth checks that browser requests come from BETTER_AUTH_URL's
      // origin, which must match the origin the tests use. CI already sets
      // it; locally, .env.local usually says localhost. next.config.ts does
      // not override variables that are already set.
      env: { ...process.env, BETTER_AUTH_URL: "http://127.0.0.1:3000" },
      reuseExistingServer: false,
      timeout: 180_000,
    },
  ],
});
