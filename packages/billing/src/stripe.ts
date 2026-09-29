import Stripe from "stripe";

import { serverEnv } from "@startup/env";

/**
 * Thrown when billing functionality is invoked without the Stripe
 * configuration it needs. Billing is optional until it is used, so this is
 * raised lazily instead of failing environment validation at startup.
 */
export class BillingConfigurationError extends Error {
  constructor(variable: string) {
    super(`Billing is not configured: ${variable} is not set.`);
    this.name = "BillingConfigurationError";
  }
}

function requireSetting(name: string, value: string | undefined): string {
  if (!value) {
    throw new BillingConfigurationError(name);
  }

  return value;
}

let stripe: Stripe | undefined;

/** Server-only Stripe client. Uses the API version pinned by the SDK. */
export function getStripe(): Stripe {
  stripe ??= new Stripe(
    requireSetting("STRIPE_SECRET_KEY", serverEnv.STRIPE_SECRET_KEY),
  );

  return stripe;
}

export function getWebhookSecret(): string {
  return requireSetting("STRIPE_WEBHOOK_SECRET", serverEnv.STRIPE_WEBHOOK_SECRET);
}

export function getProMonthlyPriceId(): string {
  return requireSetting(
    "STRIPE_PRICE_PRO_MONTHLY",
    serverEnv.STRIPE_PRICE_PRO_MONTHLY,
  );
}
