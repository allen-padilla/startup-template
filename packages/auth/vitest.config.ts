import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Deterministic environment: @startup/env validates on import, and email
    // is deliberately unconfigured. Tests run Better Auth against in-memory
    // PGlite with an injected sender and cannot open network connections.
    env: {
      DATABASE_URL: "postgresql://unused@127.0.0.1:5432/unused",
      BETTER_AUTH_SECRET: "test-only-secret-that-is-at-least-32-chars",
      BETTER_AUTH_URL: "http://localhost:3000",
      SMTP_URL: "",
      EMAIL_FROM: "",
    },
    setupFiles: ["./src/testing/no-network.ts"],
    // Each test starts PGlite, applies the migrations, and hashes passwords.
    // That takes 1-2 s locally and up to about 8 s on CI runners, beyond
    // Vitest's 5 s default.
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
