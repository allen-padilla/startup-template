// tests/e2e/billing.spec.ts
import { expect, test } from "@playwright/test";

test("checkout requires authentication", async ({ request }) => {
  const response = await request.post("/api/billing/checkout", {
    data: { priceId: "price_client_supplied" },
  });

  expect(response.status()).toBe(401);
});

test("webhook rejects requests without a Stripe signature", async ({
  request,
}) => {
  const response = await request.post("/api/billing/webhook", {
    data: { type: "customer.subscription.updated" },
  });

  expect(response.status()).toBe(400);
});

test("webhook rejects an invalid Stripe signature", async ({ request }) => {
  const response = await request.post("/api/billing/webhook", {
    headers: { "stripe-signature": "t=1,v1=invalid" },
    data: { type: "customer.subscription.updated" },
  });

  // 400 when a webhook secret is configured; 503 when billing is not
  // configured locally. Either way the event is never processed.
  expect([400, 503]).toContain(response.status());
});
