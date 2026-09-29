import { db as defaultDb, type Database } from "@startup/db";

/**
 * Stripe subscription statuses that grant paid access. This is the single
 * place where Stripe status is interpreted as an entitlement.
 *
 * Not entitled: `past_due`, `unpaid`, `paused`, `incomplete`,
 * `incomplete_expired`, `canceled`, and any status Stripe adds later.
 */
export const ENTITLED_SUBSCRIPTION_STATUSES: readonly string[] = [
  "active",
  "trialing",
];

/**
 * Stripe subscription statuses that still allow starting a new subscription
 * checkout. Both are terminal: the subscription can never become active again.
 *
 * Checkout eligibility is deliberately fail-closed. Every other status blocks
 * a new checkout, including `past_due`, `unpaid`, `paused`, `incomplete`, and
 * any status Stripe adds later, so a user cannot end up with a duplicate
 * subscription. Blocking checkout does not make a status entitled.
 */
export const CHECKOUT_ALLOWING_SUBSCRIPTION_STATUSES: readonly string[] = [
  "canceled",
  "incomplete_expired",
];

export function isEntitledStatus(status: string): boolean {
  return ENTITLED_SUBSCRIPTION_STATUSES.includes(status);
}

export function blocksNewCheckout(status: string): boolean {
  return !CHECKOUT_ALLOWING_SUBSCRIPTION_STATUSES.includes(status);
}

export type SubscriptionSummary = {
  stripeSubscriptionId: string;
  stripePriceId: string;
  status: string;
  currentPeriodEnd: Date;
  cancelAtPeriodEnd: boolean;
  cancelAt: Date | null;
};

export type UserEntitlement =
  | { entitled: false }
  | { entitled: true; subscription: SubscriptionSummary };

export type CheckoutEligibility =
  | { eligible: true }
  | {
      eligible: false;
      reason: "existing_subscription";
      subscription: SubscriptionSummary;
    };

type StatusFilter = { in: readonly string[] } | { notIn: readonly string[] };

/** The user's most recent subscription (by period end) matching `statuses`. */
async function findLatestSubscription(
  db: Database,
  userId: string,
  statuses: StatusFilter,
): Promise<SubscriptionSummary | undefined> {
  return db.query.subscriptions.findFirst({
    columns: {
      stripeSubscriptionId: true,
      stripePriceId: true,
      status: true,
      currentPeriodEnd: true,
      cancelAtPeriodEnd: true,
      cancelAt: true,
    },
    where: (table, { and, eq, inArray, notInArray }) =>
      and(
        eq(table.userId, userId),
        "in" in statuses
          ? inArray(table.status, [...statuses.in])
          : notInArray(table.status, [...statuses.notIn]),
      ),
    orderBy: (table, { desc }) => desc(table.currentPeriodEnd),
  });
}

/**
 * Whether the user currently has paid access, based only on subscription
 * state synchronized from verified Stripe webhooks.
 */
export async function getUserEntitlement(
  userId: string,
  { db = defaultDb }: { db?: Database } = {},
): Promise<UserEntitlement> {
  const subscription = await findLatestSubscription(db, userId, {
    in: ENTITLED_SUBSCRIPTION_STATUSES,
  });

  return subscription ? { entitled: true, subscription } : { entitled: false };
}

/**
 * Whether the user may start a new subscription checkout. Fail-closed: any
 * subscription outside `CHECKOUT_ALLOWING_SUBSCRIPTION_STATUSES` blocks it.
 */
export async function getCheckoutEligibility(
  userId: string,
  { db = defaultDb }: { db?: Database } = {},
): Promise<CheckoutEligibility> {
  const subscription = await findLatestSubscription(db, userId, {
    notIn: CHECKOUT_ALLOWING_SUBSCRIPTION_STATUSES,
  });

  return subscription
    ? { eligible: false, reason: "existing_subscription", subscription }
    : { eligible: true };
}
