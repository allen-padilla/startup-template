import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Deterministic environment: @startup/env validates on import, and
    // TypeSafe is deliberately unconfigured so values from a developer's shell
    // never reach the tests. Tests inject a fake fetch and never contact
    // TypeSafe.
    env: {
      DATABASE_URL: "postgresql://unused@127.0.0.1:5432/unused",
      BETTER_AUTH_SECRET: "test-only-secret-that-is-at-least-32-chars",
      BETTER_AUTH_URL: "http://localhost:3000",
      TYPESAFE_API_KEY: "",
      TYPESAFE_MODEL: "",
    },
  },
});
