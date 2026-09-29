import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { schema, type Database } from "@startup/db";

import {
  AlreadySubscribedError,
  createSubscriptionCheckout,
  type StripeCheckoutClient,
} from "./checkout";
import { getOrCreateStripeCustomer } from "./customers";
import {
  createTestDatabase,
  insertTestSubscription,
  insertTestUser,
} from "./testing/database";

function fakeStripe() {
  let created = 0;
  const createCustomer = vi.fn(async () => ({ id: `cus_test_${++created}` }));
  const createSession = vi.fn(async () => ({
    id: "cs_test_1",
    url: "https://checkout.stripe.com/c/pay/cs_test_1",
  }));
  const stripe = {
    customers: { create: createCustomer },
    checkout: { sessions: { create: createSession } },
  } as unknown as StripeCheckoutClient;

  return { stripe, createCustomer, createSession };
}

describe("billing customers", () => {
  let db: Database;
  let close: () => Promise<void>;

  beforeEach(async () => {
    ({ db, close } = await createTestDatabase());
  });

  afterEach(async () => {
    await close();
  });

  it("creates a Stripe customer keyed by the application user ID", async () => {
    const user = await insertTestUser(db);
    const { stripe, createCustomer } = fakeStripe();

    const customerId = await getOrCreateStripeCustomer(user, { db, stripe });

    expect(customerId).toBe("cus_test_1");
    expect(createCustomer).toHaveBeenCalledWith(
      expect.objectContaining({ metadata: { userId: user.id } }),
      { idempotencyKey: `billing-customer:${user.id}` },
    );
    expect(await db.select().from(schema.billingCustomers)).toEqual([
      expect.objectContaining({
        userId: user.id,
        stripeCustomerId: "cus_test_1",
      }),
    ]);
  });

  it("reuses the stored customer instead of creating another", async () => {
    const user = await insertTestUser(db);
    const { stripe, createCustomer } = fakeStripe();

    const first = await getOrCreateStripeCustomer(user, { db, stripe });
    const second = await getOrCreateStripeCustomer(user, { db, stripe });

    expect(second).toBe(first);
    expect(createCustomer).toHaveBeenCalledTimes(1);
  });

  it("rejects mapping one Stripe customer to two users", async () => {
    const first = await insertTestUser(db, "user_1");
    const second = await insertTestUser(db, "user_2");

    await db
      .insert(schema.billingCustomers)
      .values({ userId: first.id, stripeCustomerId: "cus_shared" });

    await expect(
      db
        .insert(schema.billingCustomers)
        .values({ userId: second.id, stripeCustomerId: "cus_shared" }),
    ).rejects.toThrow();
  });

  it("creates checkout for the configured price and the user's customer", async () => {
    const user = await insertTestUser(db);
    const { stripe, createSession } = fakeStripe();

    const checkout = await createSubscriptionCheckout(user, {
      db,
      stripe,
      priceId: "price_test_pro_monthly",
      appUrl: "http://localhost:3000",
    });

    expect(checkout).toEqual({
      id: "cs_test_1",
      url: "https://checkout.stripe.com/c/pay/cs_test_1",
    });
    expect(createSession).toHaveBeenCalledWith(
      expect.objectContaining({
        mode: "subscription",
        customer: "cus_test_1",
        client_reference_id: user.id,
        line_items: [{ price: "price_test_pro_monthly", quantity: 1 }],
        success_url: "http://localhost:3000/?checkout=success",
        cancel_url: "http://localhost:3000/?checkout=cancelled",
      }),
    );
  });

  it.each([
    "active",
    "trialing",
    "past_due",
    "incomplete",
    "unpaid",
    "paused",
    "some_future_status",
  ])(
    "blocks checkout for a user with a %s subscription",
    async (status) => {
      const user = await insertTestUser(db);
      await insertTestSubscription(db, user.id, { status });
      const { stripe, createCustomer, createSession } = fakeStripe();

      await expect(
        createSubscriptionCheckout(user, {
          db,
          stripe,
          priceId: "price_test_pro_monthly",
          appUrl: "http://localhost:3000",
        }),
      ).rejects.toThrow(AlreadySubscribedError);

      expect(createCustomer).not.toHaveBeenCalled();
      expect(createSession).not.toHaveBeenCalled();
    },
  );

  it.each(["canceled", "incomplete_expired"])(
    "allows checkout for a user whose subscription is %s",
    async (status) => {
      const user = await insertTestUser(db);
      await insertTestSubscription(db, user.id, { status });
      const { stripe, createSession } = fakeStripe();

      await expect(
        createSubscriptionCheckout(user, {
          db,
          stripe,
          priceId: "price_test_pro_monthly",
          appUrl: "http://localhost:3000",
        }),
      ).resolves.toMatchObject({ id: "cs_test_1" });

      expect(createSession).toHaveBeenCalledTimes(1);
    },
  );
});
