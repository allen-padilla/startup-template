import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { schema, type Database } from "@startup/db";

import { createSubscriptionCheckout } from "./checkout";
import {
  BillingConfigurationError,
  getProMonthlyPriceId,
  getStripe,
  getWebhookSecret,
} from "./stripe";
import { createTestDatabase, insertTestUser } from "./testing/database";

describe("billing configuration", () => {
  it.each([
    ["STRIPE_SECRET_KEY", getStripe],
    ["STRIPE_WEBHOOK_SECRET", getWebhookSecret],
    ["STRIPE_PRICE_PRO_MONTHLY", getProMonthlyPriceId],
  ])("fails with a configuration error when %s is unset", (name, get) => {
    expect(get).toThrow(BillingConfigurationError);
    expect(get).toThrow(`Billing is not configured: ${name} is not set.`);
  });

  describe("checkout without Stripe configured", () => {
    let db: Database;
    let close: () => Promise<void>;

    beforeEach(async () => {
      ({ db, close } = await createTestDatabase());
    });

    afterEach(async () => {
      await close();
    });

    it("fails before creating any customer state", async () => {
      const user = await insertTestUser(db);
      const stripe = {
        customers: { create: vi.fn() },
        checkout: { sessions: { create: vi.fn() } },
      };

      await expect(
        createSubscriptionCheckout(user, { db, stripe }),
      ).rejects.toThrow(BillingConfigurationError);

      expect(stripe.customers.create).not.toHaveBeenCalled();
      expect(await db.select().from(schema.billingCustomers)).toEqual([]);
    });
  });
});
