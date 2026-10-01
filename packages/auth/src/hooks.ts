import {
  APIError,
  createAuthMiddleware,
  getSessionFromCtx,
} from "better-auth/api";

import type { Database } from "@startup/db";

import type { RunInBackground } from "./background";
import {
  consumeEmailRateLimit,
  pruneEmailRateLimit,
  type EmailRateLimitRule,
} from "./email-rate-limit";

export const REQUEST_PASSWORD_RESET = "/request-password-reset";
export const SEND_VERIFICATION_EMAIL = "/send-verification-email";
const SIGN_UP = "/sign-up/email";

/** Per-address limit for each endpoint that sends email. */
export const EMAIL_RATE_LIMIT: EmailRateLimitRule = { max: 3, window: 3600 };

// Matches Better Auth's own per-client 429 message.
const TOO_MANY_REQUESTS = "Too many requests. Please try again later.";

export interface EmailHookOptions {
  emailEnabled: boolean;
  db: Database;
  secret: string;
  runInBackground: RunInBackground;
}

export function createEmailHooks(options: EmailHookOptions) {
  let warnedNotConfigured = false;

  const before = createAuthMiddleware(async (ctx) => {
    if (ctx.path !== REQUEST_PASSWORD_RESET && ctx.path !== SEND_VERIFICATION_EMAIL) {
      return;
    }

    // Same answer for every address, like billing without Stripe.
    if (!options.emailEnabled) {
      throw new APIError("SERVICE_UNAVAILABLE", {
        code: "EMAIL_NOT_AVAILABLE",
        message: "Email is not available.",
      });
    }

    // Better Auth also accepts an address without a session here. That path
    // can reveal which addresses have accounts, so only signed-in users may
    // request a new verification link.
    if (ctx.path === SEND_VERIFICATION_EMAIL && !(await getSessionFromCtx(ctx))) {
      throw new APIError("UNAUTHORIZED", {
        code: "UNAUTHORIZED",
        message: "Sign in to request a new verification email.",
      });
    }

    const address: unknown = ctx.body?.email;

    // Better Auth rejects a missing or invalid address after this hook.
    if (typeof address !== "string" || !ctx.context.rateLimit.enabled) return;

    const { allowed } = await consumeEmailRateLimit(
      options.db,
      options.secret,
      ctx.path,
      address,
      EMAIL_RATE_LIMIT,
    );

    void options.runInBackground(() =>
      pruneEmailRateLimit(options.db, EMAIL_RATE_LIMIT.window).catch(() => {}),
    );

    if (!allowed) {
      throw new APIError(
        "TOO_MANY_REQUESTS",
        { message: TOO_MANY_REQUESTS },
        { "X-Retry-After": String(EMAIL_RATE_LIMIT.window) },
      );
    }
  });

  const after = createAuthMiddleware(async (ctx) => {
    if (ctx.path !== SIGN_UP || options.emailEnabled || warnedNotConfigured) {
      return;
    }

    warnedNotConfigured = true;
    console.warn(
      "[auth] Email is not configured (SMTP_URL and EMAIL_FROM are empty): sign-up sends no verification email, and password reset and verification requests return 503.",
    );
  });

  return { before, after };
}
