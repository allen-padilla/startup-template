import { z } from "zod";

import { optional } from "./optional";

const serverSchema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),

  DATABASE_URL: z.string().url(),
  BETTER_AUTH_SECRET: z.string().min(32),
  BETTER_AUTH_URL: z.string().url(),

  // Billing is optional until a billing endpoint is invoked. @startup/billing
  // raises a configuration error when a required value is missing.
  STRIPE_SECRET_KEY: optional(z.string().regex(/^(sk|rk)_(test|live)_/)),
  STRIPE_WEBHOOK_SECRET: optional(z.string().startsWith("whsec_")),
  STRIPE_PRICE_PRO_MONTHLY: optional(z.string().startsWith("price_")),

  // Decision models are optional until a decision is evaluated.
  // @startup/decision raises a configuration error when a value is missing.
  TYPESAFE_API_KEY: optional(z.string().min(1)),
  TYPESAFE_MODEL: optional(z.string().min(1)),
});

export const serverEnv = serverSchema.parse({
  NODE_ENV: process.env.NODE_ENV,
  DATABASE_URL: process.env.DATABASE_URL,
  BETTER_AUTH_SECRET: process.env.BETTER_AUTH_SECRET,
  BETTER_AUTH_URL: process.env.BETTER_AUTH_URL,
  STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY,
  STRIPE_WEBHOOK_SECRET: process.env.STRIPE_WEBHOOK_SECRET,
  STRIPE_PRICE_PRO_MONTHLY: process.env.STRIPE_PRICE_PRO_MONTHLY,
  TYPESAFE_API_KEY: process.env.TYPESAFE_API_KEY,
  TYPESAFE_MODEL: process.env.TYPESAFE_MODEL,
});
