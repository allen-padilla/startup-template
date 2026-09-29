// tests/e2e/auth.spec.ts
import { expect, test } from "@playwright/test";

test("auth endpoint is available", async ({ request }) => {
  const response = await request.get("/api/auth/ok");

  expect(response.status()).toBe(200);
});