import { z } from "zod";

import { emailFrom, smtpUrl } from "./email";
import { optional } from "./optional";

export const serverSchema = z
  .object({
    NODE_ENV: z
      .enum(["development", "test", "production"])
      .default("development"),

    DATABASE_URL: z.string().url(),
    BETTER_AUTH_SECRET: z.string().min(32),
    BETTER_AUTH_URL: z.string().url(),

    // Set by a single-instance host so the server applies migrations when it
    // starts. See docs/architecture/deployment.md.
    RUN_MIGRATIONS: optional(z.enum(["true", "false"])),

    // Billing is optional until a billing endpoint is invoked. @startup/billing
    // raises a configuration error when a required value is missing.
    STRIPE_SECRET_KEY: optional(z.string().regex(/^(sk|rk)_(test|live)_/)),
    STRIPE_WEBHOOK_SECRET: optional(z.string().startsWith("whsec_")),
    STRIPE_PRICE_PRO_MONTHLY: optional(z.string().startsWith("price_")),

    // Email is disabled when both are empty. Setting only one is an error.
    // @startup/email raises a configuration error when sending while disabled.
    SMTP_URL: optional(smtpUrl),
    EMAIL_FROM: optional(emailFrom),
  })
  .superRefine((env, ctx) => {
    const missing = env.SMTP_URL
      ? env.EMAIL_FROM
        ? undefined
        : "EMAIL_FROM"
      : env.EMAIL_FROM
        ? "SMTP_URL"
        : undefined;

    if (missing) {
      ctx.addIssue({
        code: "custom",
        path: [missing],
        message: `${missing} is required when ${
          missing === "SMTP_URL" ? "EMAIL_FROM" : "SMTP_URL"
        } is set. Set both to enable email, or leave both empty.`,
      });
    }

    // .env.example points SMTP_URL at the local mail catcher. Copied to a
    // deployment, that passes validation and then fails every send, so a
    // deployed application may not send mail through a loopback host.
    if (
      env.SMTP_URL &&
      isLoopbackUrl(env.SMTP_URL) &&
      !isLoopbackUrl(env.BETTER_AUTH_URL)
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["SMTP_URL"],
        message:
          "SMTP_URL points at a local mail catcher, but BETTER_AUTH_URL is not local. Set a real SMTP provider, or leave SMTP_URL and EMAIL_FROM empty.",
      });
    }
  });

// False for a value that is not a URL: the field's own validator reports that.
function isLoopbackUrl(value: string) {
  try {
    const { hostname } = new URL(value);

    return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]";
  } catch {
    return false;
  }
}

export const serverEnv = serverSchema.parse({
  NODE_ENV: process.env.NODE_ENV,
  DATABASE_URL: process.env.DATABASE_URL,
  BETTER_AUTH_SECRET: process.env.BETTER_AUTH_SECRET,
  BETTER_AUTH_URL: process.env.BETTER_AUTH_URL,
  RUN_MIGRATIONS: process.env.RUN_MIGRATIONS,
  STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY,
  STRIPE_WEBHOOK_SECRET: process.env.STRIPE_WEBHOOK_SECRET,
  STRIPE_PRICE_PRO_MONTHLY: process.env.STRIPE_PRICE_PRO_MONTHLY,
  SMTP_URL: process.env.SMTP_URL,
  EMAIL_FROM: process.env.EMAIL_FROM,
});
