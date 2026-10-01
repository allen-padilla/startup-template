import { betterAuth, type BetterAuthOptions } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";

import { db, schema, type Database } from "@startup/db";
import { isEmailConfigured, sendEmail, type EmailMessage } from "@startup/email";
import { serverEnv } from "@startup/env";

import { runAfterResponse, type RunInBackground } from "./background";
import { createAuthEmailCallbacks } from "./email";
import { createAuthHooks } from "./hooks";
import { reportEmailFailure, type EmailFailureReporter } from "./report";

// Reset and verification links expire after one hour.
const LINK_EXPIRES_IN_SECONDS = 3600;

/**
 * Per-client limit for email sign-up. Each sign-up sends a verification
 * email, so Better Auth's default for `/sign-up/*` (3 per 10 seconds) would
 * allow thousands a day.
 */
export const SIGN_UP_RATE_LIMIT = { window: 3600, max: 10 };

export interface CreateAuthOptions {
  db: Database;
  secret: string;
  baseURL: string;
  /** Sends one message. Email is disabled when this is not set. */
  sendEmail?: (message: EmailMessage) => Promise<void>;
  /** Defaults to Next.js `after()`. */
  runInBackground?: RunInBackground;
  /** Defaults to the reporter set with `setEmailFailureReporter`. */
  reportEmailFailure?: EmailFailureReporter;
  /** Better Auth enables rate limiting only in production by default. */
  rateLimitEnabled?: boolean;
  advanced?: BetterAuthOptions["advanced"];
}

export function createAuth(options: CreateAuthOptions) {
  const runInBackground = options.runInBackground ?? runAfterResponse;
  const email = options.sendEmail
    ? createAuthEmailCallbacks({
        send: options.sendEmail,
        runInBackground,
        reportFailure: options.reportEmailFailure ?? reportEmailFailure,
      })
    : undefined;

  return betterAuth({
    database: drizzleAdapter(options.db, {
      provider: "pg",
      schema,
    }),

    secret: options.secret,
    baseURL: options.baseURL,

    // No trustedOrigins: reset and verification links may only redirect to
    // the BETTER_AUTH_URL origin or a relative path.

    emailAndPassword: {
      enabled: true,
      revokeSessionsOnPasswordReset: true,
      resetPasswordTokenExpiresIn: LINK_EXPIRES_IN_SECONDS,
      sendResetPassword: email?.sendResetPassword,
    },

    // Verification is recorded, not enforced: sign-in works for unverified
    // addresses, and products read `session.user.emailVerified`.
    emailVerification: email
      ? {
          sendOnSignUp: true,
          sendVerificationEmail: email.sendVerificationEmail,
          expiresIn: LINK_EXPIRES_IN_SECONDS,
          autoSignInAfterVerification: false,
        }
      : undefined,

    // In PostgreSQL, so limits hold across serverless instances.
    rateLimit: {
      storage: "database",
      customRules: { "/sign-up/email": SIGN_UP_RATE_LIMIT },
      ...(options.rateLimitEnabled === undefined
        ? {}
        : { enabled: options.rateLimitEnabled }),
    },

    hooks: createAuthHooks({
      emailEnabled: email !== undefined,
      db: options.db,
      secret: options.secret,
      runInBackground,
    }),

    advanced: options.advanced,
  });
}

export const auth = createAuth({
  db,
  secret: serverEnv.BETTER_AUTH_SECRET,
  baseURL: serverEnv.BETTER_AUTH_URL,
  sendEmail: isEmailConfigured() ? sendEmail : undefined,
});
