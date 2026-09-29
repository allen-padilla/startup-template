import Stripe from "stripe";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { schema, type Database } from "@startup/db";

import { BillingConfigurationError } from "./stripe";
import { createTestDatabase, insertTestUser } from "./testing/database";
import {
  constructBillingWebhookEvent,
  handleBillingWebhookEvent,
  WebhookSignatureError,
  type StripeSubscriptionsClient,
} from "./webhooks";

const SECRET = "whsec_test_secret";

function signedEvent(type: string, object: Record<string, unknown>) {
  const payload = JSON.stringify({
    id: `evt_${type}`,
    object: "event",
    type,
    data: { object },
  });
  const signature = Stripe.webhooks.generateTestHeaderString({
    payload,
    secret: SECRET,
  });

  return { payload, signature };
}

function receive(type: string, object: Record<string, unknown>) {
  const { payload, signature } = signedEvent(type, object);

  return constructBillingWebhookEvent(payload, signature, SECRET);
}

function stripeSubscription(
  overrides: Partial<{
    status: Stripe.Subscription.Status;
    cancelAtPeriodEnd: boolean;
    cancelAt: number | null;
    customer: string;
  }> = {},
) {
  return {
    id: "sub_test_1",
    object: "subscription",
    customer: overrides.customer ?? "cus_test_1",
    status: overrides.status ?? "active",
    cancel_at_period_end: overrides.cancelAtPeriodEnd ?? false,
    cancel_at: overrides.cancelAt ?? null,
    items: {
      object: "list",
      data: [
        {
          price: { id: "price_test_pro_monthly" },
          current_period_end: 1_800_000_000,
        },
      ],
    },
  } as unknown as Stripe.Subscription;
}

/** Stripe fake whose retrieve() returns the subscription's current state. */
function fakeStripe(current: Stripe.Subscription) {
  const retrieve = vi.fn(async () => current);
  const stripe = {
    subscriptions: { retrieve },
  } as unknown as StripeSubscriptionsClient;

  return {
    stripe,
    retrieve,
    setCurrent(next: Stripe.Subscription) {
      current = next;
    },
  };
}

describe("webhook signature verification", () => {
  it("accepts a correctly signed payload", () => {
    const event = receive("customer.subscription.updated", { id: "sub_1" });

    expect(event.type).toBe("customer.subscription.updated");
  });

  it("rejects a missing signature", () => {
    const { payload } = signedEvent("customer.subscription.updated", {});

    expect(() => constructBillingWebhookEvent(payload, null, SECRET)).toThrow(
      WebhookSignatureError,
    );
  });

  it("rejects a signature made with a different secret", () => {
    const { payload, signature } = signedEvent(
      "customer.subscription.updated",
      {},
    );

    expect(() =>
      constructBillingWebhookEvent(payload, signature, "whsec_other"),
    ).toThrow(WebhookSignatureError);
  });

  it("rejects a payload modified after signing", () => {
    const { payload, signature } = signedEvent(
      "customer.subscription.updated",
      { id: "sub_1" },
    );
    const tampered = payload.replace("sub_1", "sub_2");

    expect(() =>
      constructBillingWebhookEvent(tampered, signature, SECRET),
    ).toThrow(WebhookSignatureError);
  });

  it("rejects a malformed signature header", () => {
    const { payload } = signedEvent("customer.subscription.updated", {});

    expect(() =>
      constructBillingWebhookEvent(payload, "not-a-signature", SECRET),
    ).toThrow(WebhookSignatureError);
  });

  it("fails with a configuration error when no webhook secret is set", () => {
    const { payload, signature } = signedEvent(
      "customer.subscription.updated",
      {},
    );

    expect(() => constructBillingWebhookEvent(payload, signature)).toThrow(
      BillingConfigurationError,
    );
  });
});

describe("subscription synchronization", () => {
  let db: Database;
  let close: () => Promise<void>;
  let userId: string;

  beforeEach(async () => {
    ({ db, close } = await createTestDatabase());
    ({ id: userId } = await insertTestUser(db));
    await db
      .insert(schema.billingCustomers)
      .values({ userId, stripeCustomerId: "cus_test_1" });
  });

  afterEach(async () => {
    await close();
  });

  const subscriptionRows = () => db.select().from(schema.subscriptions);

  it("stores the subscription for the mapped user", async () => {
    const { stripe } = fakeStripe(stripeSubscription());

    await handleBillingWebhookEvent(
      receive("customer.subscription.created", { id: "sub_test_1" }),
      { db, stripe },
    );

    expect(await subscriptionRows()).toEqual([
      expect.objectContaining({
        userId,
        stripeSubscriptionId: "sub_test_1",
        stripePriceId: "price_test_pro_monthly",
        status: "active",
        currentPeriodEnd: new Date(1_800_000_000 * 1000),
        cancelAtPeriodEnd: false,
        cancelAt: null,
      }),
    ]);
  });

  it("is idempotent under duplicate delivery", async () => {
    const { stripe } = fakeStripe(stripeSubscription());
    const event = receive("customer.subscription.updated", {
      id: "sub_test_1",
    });

    await handleBillingWebhookEvent(event, { db, stripe });
    const [first] = await subscriptionRows();
    await handleBillingWebhookEvent(event, { db, stripe });
    await handleBillingWebhookEvent(event, { db, stripe });
    const rows = await subscriptionRows();

    expect(rows).toHaveLength(1);
    expect(rows[0]).toEqual({ ...first, updatedAt: expect.any(Date) });
  });

  it("records cancellation and deletion without removing the row", async () => {
    const { stripe, setCurrent } = fakeStripe(stripeSubscription());

    await handleBillingWebhookEvent(
      receive("customer.subscription.created", { id: "sub_test_1" }),
      { db, stripe },
    );

    setCurrent(stripeSubscription({ cancelAtPeriodEnd: true }));
    await handleBillingWebhookEvent(
      receive("customer.subscription.updated", { id: "sub_test_1" }),
      { db, stripe },
    );
    expect(await subscriptionRows()).toEqual([
      expect.objectContaining({ status: "active", cancelAtPeriodEnd: true }),
    ]);

    setCurrent(stripeSubscription({ status: "canceled" }));
    await handleBillingWebhookEvent(
      receive("customer.subscription.deleted", { id: "sub_test_1" }),
      { db, stripe },
    );
    expect(await subscriptionRows()).toEqual([
      expect.objectContaining({ status: "canceled" }),
    ]);
  });

  it("does not regress state when an older event arrives late", async () => {
    const { stripe } = fakeStripe(stripeSubscription({ status: "canceled" }));

    await handleBillingWebhookEvent(
      receive("customer.subscription.deleted", { id: "sub_test_1" }),
      { db, stripe },
    );
    await handleBillingWebhookEvent(
      receive("customer.subscription.created", {
        id: "sub_test_1",
        status: "active",
      }),
      { db, stripe },
    );

    expect(await subscriptionRows()).toEqual([
      expect.objectContaining({ status: "canceled" }),
    ]);
  });

  it("records Stripe's subscription status, not the checkout outcome", async () => {
    const { stripe, retrieve } = fakeStripe(
      stripeSubscription({ status: "incomplete" }),
    );

    await handleBillingWebhookEvent(
      receive("checkout.session.completed", {
        id: "cs_test_1",
        mode: "subscription",
        subscription: "sub_test_1",
      }),
      { db, stripe },
    );

    expect(retrieve).toHaveBeenCalledWith("sub_test_1");
    expect(await subscriptionRows()).toEqual([
      expect.objectContaining({ status: "incomplete" }),
    ]);
  });

  it("ignores events outside the handled set", async () => {
    const { stripe, retrieve } = fakeStripe(stripeSubscription());

    const results = await Promise.all([
      handleBillingWebhookEvent(
        receive("checkout.session.completed", {
          id: "cs_test_1",
          mode: "payment",
          subscription: null,
        }),
        { db, stripe },
      ),
      handleBillingWebhookEvent(
        receive("invoice.paid", { id: "in_test_1" }),
        { db, stripe },
      ),
    ]);

    expect(results).toEqual([{ outcome: "ignored" }, { outcome: "ignored" }]);
    expect(retrieve).not.toHaveBeenCalled();
    expect(await subscriptionRows()).toEqual([]);
  });

  it("stores and clears a scheduled cancellation date", async () => {
    const cancelAt = 1_790_000_000;
    const { stripe, setCurrent } = fakeStripe(stripeSubscription({ cancelAt }));
    const event = receive("customer.subscription.updated", {
      id: "sub_test_1",
    });

    await handleBillingWebhookEvent(event, { db, stripe });
    await handleBillingWebhookEvent(event, { db, stripe });
    expect(await subscriptionRows()).toEqual([
      expect.objectContaining({ cancelAt: new Date(cancelAt * 1000) }),
    ]);

    setCurrent(stripeSubscription({ cancelAt: null }));
    await handleBillingWebhookEvent(event, { db, stripe });
    expect(await subscriptionRows()).toEqual([
      expect.objectContaining({ cancelAt: null }),
    ]);
  });

  it("acknowledges subscriptions for customers unknown to this app", async () => {
    const { stripe } = fakeStripe(
      stripeSubscription({ customer: "cus_unknown" }),
    );

    await expect(
      handleBillingWebhookEvent(
        receive("customer.subscription.created", { id: "sub_test_1" }),
        { db, stripe },
      ),
    ).resolves.toEqual({
      outcome: "unknown_customer",
      stripeCustomerId: "cus_unknown",
    });
    expect(await subscriptionRows()).toEqual([]);
  });

  it("fails when Stripe cannot be reached, so the delivery is retried", async () => {
    const stripe = {
      subscriptions: {
        retrieve: vi.fn(async () => {
          throw new Stripe.errors.StripeConnectionError({
            message: "connection failed",
          });
        }),
      },
    } as unknown as StripeSubscriptionsClient;

    await expect(
      handleBillingWebhookEvent(
        receive("customer.subscription.updated", { id: "sub_test_1" }),
        { db, stripe },
      ),
    ).rejects.toThrow("connection failed");
    expect(await subscriptionRows()).toEqual([]);
  });

  it("fails when the database is unavailable, so the delivery is retried", async () => {
    const unavailable = await createTestDatabase();
    await unavailable.close();
    const { stripe } = fakeStripe(stripeSubscription());

    await expect(
      handleBillingWebhookEvent(
        receive("customer.subscription.updated", { id: "sub_test_1" }),
        { db: unavailable.db, stripe },
      ),
    ).rejects.toThrow();
  });

  it("fails on a subscription it cannot interpret", async () => {
    const malformed = {
      ...stripeSubscription(),
      items: { object: "list", data: [] },
    } as unknown as Stripe.Subscription;
    const { stripe } = fakeStripe(malformed);

    await expect(
      handleBillingWebhookEvent(
        receive("customer.subscription.updated", { id: "sub_test_1" }),
        { db, stripe },
      ),
    ).rejects.toThrow("has no items");
  });
});
