import Stripe from "stripe";

import { db as defaultDb, sql, type Database } from "@startup/db";

import { getStripe, getWebhookSecret } from "./stripe";
import {
  syncStripeSubscription,
  type SubscriptionSyncResult,
} from "./subscriptions";

/** The webhook request is missing a valid Stripe signature. */
export class WebhookSignatureError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WebhookSignatureError";
  }
}

export type StripeSubscriptionsClient = {
  subscriptions: Pick<Stripe["subscriptions"], "retrieve">;
};

/**
 * Verifies the Stripe signature over the raw request body and returns the
 * event. Nothing in the payload may be trusted before this succeeds.
 */
export function constructBillingWebhookEvent(
  payload: string,
  signature: string | null,
  secret?: string,
): Stripe.Event {
  if (!signature) {
    throw new WebhookSignatureError("Missing Stripe signature.");
  }

  const webhookSecret = secret ?? getWebhookSecret();

  try {
    return Stripe.webhooks.constructEvent(payload, signature, webhookSecret);
  } catch (error) {
    if (error instanceof Stripe.errors.StripeSignatureVerificationError) {
      throw new WebhookSignatureError("Invalid Stripe signature.");
    }

    throw error;
  }
}

function getSubscriptionId(event: Stripe.Event): string | null {
  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object;

      if (session.mode !== "subscription" || !session.subscription) {
        return null;
      }

      return typeof session.subscription === "string"
        ? session.subscription
        : session.subscription.id;
    }
    case "customer.subscription.created":
    case "customer.subscription.updated":
    case "customer.subscription.deleted":
      return event.data.object.id;
    default:
      return null;
  }
}

/**
 * Applies a verified webhook event to local billing state.
 *
 * Handled events only identify which subscription changed. The current state
 * is always fetched from Stripe, so duplicate or out-of-order deliveries
 * converge on the same local state.
 *
 * Returns an outcome for events that were deliberately not applied. Stripe,
 * database, and other processing failures are thrown so the delivery fails
 * and Stripe retries it.
 */
export async function handleBillingWebhookEvent(
  event: Stripe.Event,
  {
    db = defaultDb,
    stripe,
  }: { db?: Database; stripe?: StripeSubscriptionsClient } = {},
): Promise<SubscriptionSyncResult | { outcome: "ignored" }> {
  const subscriptionId = getSubscriptionId(event);

  if (!subscriptionId) {
    return { outcome: "ignored" };
  }

  const client = stripe ?? getStripe();

  return db.transaction(async (tx) => {
    // Lock before retrieving: otherwise an older Stripe response can arrive
    // after a cancellation and overwrite it. The transaction releases the
    // lock on success or failure, including across application instances.
    await tx.execute(sql`select pg_advisory_xact_lock(
      hashtextextended(${`billing-subscription:${subscriptionId}`}, 0)
    )`);
    const subscription = await client.subscriptions.retrieve(subscriptionId);

    return syncStripeSubscription(subscription, { db: tx });
  });
}
