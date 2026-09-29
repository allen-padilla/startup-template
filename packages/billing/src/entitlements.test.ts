import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { Database } from "@startup/db";

import {
  blocksNewCheckout,
  getCheckoutEligibility,
  getUserEntitlement,
  isEntitledStatus,
} from "./entitlements";
import {
  createTestDatabase,
  insertTestSubscription,
  insertTestUser,
} from "./testing/database";

const NOT_ENTITLED = [
  "past_due",
  "unpaid",
  "paused",
  "incomplete",
  "incomplete_expired",
  "canceled",
  "some_future_status",
];

describe("isEntitledStatus", () => {
  it.each(["active", "trialing"])("treats %s as entitled", (status) => {
    expect(isEntitledStatus(status)).toBe(true);
  });

  it.each(NOT_ENTITLED)("treats %s as not entitled", (status) => {
    expect(isEntitledStatus(status)).toBe(false);
  });
});

const CHECKOUT_BLOCKING = [
  "active",
  "trialing",
  "past_due",
  "incomplete",
  "unpaid",
  "paused",
  "some_future_status",
];

const CHECKOUT_ALLOWING = ["canceled", "incomplete_expired"];

describe("blocksNewCheckout", () => {
  it.each(CHECKOUT_BLOCKING)("blocks on %s", (status) => {
    expect(blocksNewCheckout(status)).toBe(true);
  });

  it.each(CHECKOUT_ALLOWING)("does not block on %s", (status) => {
    expect(blocksNewCheckout(status)).toBe(false);
  });

  it.each(["past_due", "incomplete", "unpaid", "paused", "some_future_status"])(
    "blocks on %s without making it entitled",
    (status) => {
      expect(blocksNewCheckout(status)).toBe(true);
      expect(isEntitledStatus(status)).toBe(false);
    },
  );
});

describe("getUserEntitlement", () => {
  let db: Database;
  let close: () => Promise<void>;
  let userId: string;

  beforeEach(async () => {
    ({ db, close } = await createTestDatabase());
    ({ id: userId } = await insertTestUser(db));
  });

  afterEach(async () => {
    await close();
  });

  it("is not entitled without a subscription", async () => {
    expect(await getUserEntitlement(userId, { db })).toEqual({
      entitled: false,
    });
  });

  it.each(["active", "trialing"])(
    "is entitled with a %s subscription",
    async (status) => {
      await insertTestSubscription(db, userId, { status });

      expect(await getUserEntitlement(userId, { db })).toEqual({
        entitled: true,
        subscription: {
          stripeSubscriptionId: "sub_test_1",
          stripePriceId: "price_test_pro_monthly",
          status,
          currentPeriodEnd: new Date("2027-01-01T00:00:00Z"),
          cancelAtPeriodEnd: false,
          cancelAt: null,
        },
      });
    },
  );

  it.each(NOT_ENTITLED)(
    "is not entitled with a %s subscription",
    async (status) => {
      await insertTestSubscription(db, userId, { status });

      expect(await getUserEntitlement(userId, { db })).toEqual({
        entitled: false,
      });
    },
  );

  it("uses the entitled subscription when older ones were canceled", async () => {
    await insertTestSubscription(db, userId, {
      id: "sub_old",
      status: "canceled",
    });
    await insertTestSubscription(db, userId, {
      id: "sub_new",
      status: "active",
    });

    expect(await getUserEntitlement(userId, { db })).toMatchObject({
      entitled: true,
      subscription: { stripeSubscriptionId: "sub_new" },
    });
  });

  it("is not entitled by another user's subscription", async () => {
    const other = await insertTestUser(db, "user_2");
    await insertTestSubscription(db, other.id, { status: "active" });

    expect(await getUserEntitlement(userId, { db })).toEqual({
      entitled: false,
    });
  });
});

describe("getCheckoutEligibility", () => {
  let db: Database;
  let close: () => Promise<void>;
  let userId: string;

  beforeEach(async () => {
    ({ db, close } = await createTestDatabase());
    ({ id: userId } = await insertTestUser(db));
  });

  afterEach(async () => {
    await close();
  });

  it("is eligible without a subscription", async () => {
    expect(await getCheckoutEligibility(userId, { db })).toEqual({
      eligible: true,
    });
  });

  it.each(CHECKOUT_BLOCKING)(
    "is not eligible with a %s subscription",
    async (status) => {
      await insertTestSubscription(db, userId, { status });

      expect(await getCheckoutEligibility(userId, { db })).toMatchObject({
        eligible: false,
        reason: "existing_subscription",
        subscription: { stripeSubscriptionId: "sub_test_1", status },
      });
    },
  );

  it.each(CHECKOUT_ALLOWING)(
    "is eligible with a %s subscription",
    async (status) => {
      await insertTestSubscription(db, userId, { status });

      expect(await getCheckoutEligibility(userId, { db })).toEqual({
        eligible: true,
      });
    },
  );

  it.each(["past_due", "incomplete", "unpaid", "paused", "some_future_status"])(
    "blocks checkout for %s without granting entitlement",
    async (status) => {
      await insertTestSubscription(db, userId, { status });

      expect(await getCheckoutEligibility(userId, { db })).toMatchObject({
        eligible: false,
      });
      expect(await getUserEntitlement(userId, { db })).toEqual({
        entitled: false,
      });
    },
  );

  it.each(["active", "trialing"])(
    "blocks checkout for %s and stays entitled",
    async (status) => {
      await insertTestSubscription(db, userId, { status });

      expect(await getCheckoutEligibility(userId, { db })).toMatchObject({
        eligible: false,
      });
      expect(await getUserEntitlement(userId, { db })).toMatchObject({
        entitled: true,
      });
    },
  );

  it("is blocked by a live subscription alongside a canceled one", async () => {
    await insertTestSubscription(db, userId, {
      id: "sub_old",
      status: "canceled",
    });
    await insertTestSubscription(db, userId, {
      id: "sub_new",
      status: "unpaid",
    });

    expect(await getCheckoutEligibility(userId, { db })).toMatchObject({
      eligible: false,
      subscription: { stripeSubscriptionId: "sub_new", status: "unpaid" },
    });
  });

  it("is not blocked by another user's subscription", async () => {
    const other = await insertTestUser(db, "user_2");
    await insertTestSubscription(db, other.id, { status: "active" });

    expect(await getCheckoutEligibility(userId, { db })).toEqual({
      eligible: true,
    });
  });
});
