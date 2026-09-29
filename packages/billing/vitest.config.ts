import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Deterministic environment: @startup/env validates on import, and Stripe
    // is deliberately unconfigured. Tests never contact Stripe or a real
    // database; they use in-memory PGlite and injected Stripe fakes.
    env: {
      DATABASE_URL: "postgresql://unused@127.0.0.1:5432/unused",
      BETTER_AUTH_SECRET: "test-only-secret-that-is-at-least-32-chars",
      BETTER_AUTH_URL: "http://localhost:3000",
      STRIPE_SECRET_KEY: "",
      STRIPE_WEBHOOK_SECRET: "",
      STRIPE_PRICE_PRO_MONTHLY: "",
    },
  },
});
