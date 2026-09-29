import type Stripe from "stripe";

import { db as defaultDb, schema, type Database } from "@startup/db";

export function toSubscriptionState(subscription: Stripe.Subscription) {
  // Subscriptions are single-price. Since Stripe API 2025-03-31.basil the
  // billing period lives on subscription items rather than the subscription.
  const item = subscription.items.data[0];

  if (!item) {
    throw new Error(`Stripe subscription ${subscription.id} has no items.`);
  }

  return {
    stripeSubscriptionId: subscription.id,
    stripeCustomerId:
      typeof subscription.customer === "string"
        ? subscription.customer
        : subscription.customer.id,
    stripePriceId: item.price.id,
    status: subscription.status,
    currentPeriodEnd: new Date(item.current_period_end * 1000),
    cancelAtPeriodEnd: subscription.cancel_at_period_end,
    cancelAt: subscription.cancel_at
      ? new Date(subscription.cancel_at * 1000)
      : null,
  };
}

export type SubscriptionSyncResult =
  | {
      outcome: "synced";
      subscription: typeof schema.subscriptions.$inferSelect;
    }
  // The Stripe customer has no local mapping (e.g. created in the Stripe
  // Dashboard, or by another environment sharing the Stripe account). Nothing
  // is written: local state is only created for this application's users.
  | { outcome: "unknown_customer"; stripeCustomerId: string };

/**
 * Writes the given Stripe subscription state to the local subscriptions table.
 * Upserts on the Stripe subscription ID, so applying the same state more than
 * once (e.g. duplicate webhook delivery) leaves a single, identical row.
 */
export async function syncStripeSubscription(
  subscription: Stripe.Subscription,
  { db = defaultDb }: { db?: Database } = {},
): Promise<SubscriptionSyncResult> {
  const { stripeCustomerId, ...state } = toSubscriptionState(subscription);

  const customer = await db.query.billingCustomers.findFirst({
    columns: { userId: true },
    where: (table, { eq }) => eq(table.stripeCustomerId, stripeCustomerId),
  });

  if (!customer) {
    return { outcome: "unknown_customer", stripeCustomerId };
  }

  const [row] = await db
    .insert(schema.subscriptions)
    .values({ userId: customer.userId, ...state })
    .onConflictDoUpdate({
      target: schema.subscriptions.stripeSubscriptionId,
      set: {
        stripePriceId: state.stripePriceId,
        status: state.status,
        currentPeriodEnd: state.currentPeriodEnd,
        cancelAtPeriodEnd: state.cancelAtPeriodEnd,
        cancelAt: state.cancelAt,
        updatedAt: new Date(),
      },
    })
    .returning();

  return { outcome: "synced", subscription: row! };
}
