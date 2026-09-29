import type Stripe from "stripe";

import { db as defaultDb, schema, type Database } from "@startup/db";

import { getStripe } from "./stripe";

export type BillingUser = {
  id: string;
  email: string;
  name?: string | null;
};

export type StripeCustomersClient = {
  customers: Pick<Stripe["customers"], "create">;
};

export async function findStripeCustomerId(
  userId: string,
  db: Database = defaultDb,
): Promise<string | null> {
  const customer = await db.query.billingCustomers.findFirst({
    columns: { stripeCustomerId: true },
    where: (table, { eq }) => eq(table.userId, userId),
  });

  return customer?.stripeCustomerId ?? null;
}

/**
 * Returns the user's Stripe customer ID, creating the Stripe customer and the
 * local mapping on first use. The application user ID (not email) is the
 * identity key: it is stored in the local mapping and in Stripe metadata.
 */
export async function getOrCreateStripeCustomer(
  user: BillingUser,
  {
    db = defaultDb,
    stripe = getStripe(),
  }: { db?: Database; stripe?: StripeCustomersClient } = {},
): Promise<string> {
  const existing = await findStripeCustomerId(user.id, db);

  if (existing) {
    return existing;
  }

  const customer = await stripe.customers.create(
    {
      email: user.email,
      name: user.name ?? undefined,
      metadata: { userId: user.id },
    },
    // Concurrent first requests for the same user resolve to one Stripe customer.
    { idempotencyKey: `billing-customer:${user.id}` },
  );

  const [inserted] = await db
    .insert(schema.billingCustomers)
    .values({ userId: user.id, stripeCustomerId: customer.id })
    .onConflictDoNothing({ target: schema.billingCustomers.userId })
    .returning({ stripeCustomerId: schema.billingCustomers.stripeCustomerId });

  if (inserted) {
    return inserted.stripeCustomerId;
  }

  // Another request stored the mapping first; the stored mapping wins.
  const stored = await findStripeCustomerId(user.id, db);

  if (!stored) {
    throw new Error(`Failed to store Stripe customer for user ${user.id}.`);
  }

  return stored;
}
