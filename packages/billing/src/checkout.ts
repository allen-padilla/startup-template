import type Stripe from "stripe";

import { db as defaultDb, type Database } from "@startup/db";
import { serverEnv } from "@startup/env";

import {
  getOrCreateStripeCustomer,
  type BillingUser,
  type StripeCustomersClient,
} from "./customers";
import { getCheckoutEligibility } from "./entitlements";
import { getProMonthlyPriceId, getStripe } from "./stripe";

/** The user already has a subscription that blocks a new checkout. */
export class AlreadySubscribedError extends Error {
  constructor() {
    super("User already has an existing subscription.");
    this.name = "AlreadySubscribedError";
  }
}

export type StripeCheckoutClient = StripeCustomersClient & {
  checkout: { sessions: Pick<Stripe["checkout"]["sessions"], "create"> };
};

/**
 * Creates a Stripe Checkout Session for the Pro monthly subscription. The
 * price always comes from server configuration, never from the caller.
 * Throws `AlreadySubscribedError` if an existing subscription blocks checkout
 * (any status outside `CHECKOUT_ALLOWING_SUBSCRIPTION_STATUSES`).
 *
 * Completing checkout does not grant access: subscription state is only
 * written by verified webhooks.
 */
export async function createSubscriptionCheckout(
  user: BillingUser,
  {
    db = defaultDb,
    stripe = getStripe(),
    priceId = getProMonthlyPriceId(),
    appUrl = serverEnv.BETTER_AUTH_URL,
  }: {
    db?: Database;
    stripe?: StripeCheckoutClient;
    priceId?: string;
    appUrl?: string;
  } = {},
): Promise<{ id: string; url: string }> {
  const eligibility = await getCheckoutEligibility(user.id, { db });

  if (!eligibility.eligible) {
    throw new AlreadySubscribedError();
  }

  const customer = await getOrCreateStripeCustomer(user, { db, stripe });

  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer,
    client_reference_id: user.id,
    line_items: [{ price: priceId, quantity: 1 }],
    subscription_data: { metadata: { userId: user.id } },
    success_url: new URL("/?checkout=success", appUrl).toString(),
    cancel_url: new URL("/?checkout=cancelled", appUrl).toString(),
  });

  if (!session.url) {
    throw new Error(`Stripe Checkout Session ${session.id} has no URL.`);
  }

  return { id: session.id, url: session.url };
}
