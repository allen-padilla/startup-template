// Shared by the authentication pages, in server and browser code.
// See docs/specs/auth-pages.md.

import { DEFAULT_REDIRECT } from "@startup/auth/redirect";

/** Where verification links land, so `/account` can show their outcome. */
export const VERIFY_CALLBACK = "/account?verified=1";

/** Where a successful password reset sends the user. */
export const PASSWORD_CHANGED = "/sign-in?password=changed";

// Better Auth's defaults, which the server enforces.
export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 128;

export const NAME_MAX_LENGTH = 100;

export const MESSAGES = {
  tooManyRequests: "Too many requests. Please try again later.",
  emailUnavailable: "Email isn't available right now.",
  invalidCredentials: "Invalid email or password.",
  accountExists: "An account with this email already exists.",
  passwordLength: `Use a password between ${PASSWORD_MIN_LENGTH} and ${PASSWORD_MAX_LENGTH} characters.`,
  passwordsDiffer: "The passwords don't match.",
  resetSent:
    "If an account exists for that address, we've sent a link to reset your password. The link expires in one hour.",
  resetLinkInvalid: "This reset link is invalid or has expired.",
  passwordChanged: "Your password has been changed. Sign in with your new password.",
  emailVerified: "Your email address has been verified.",
  verificationLinkInvalid: "This verification link is invalid or has expired.",
  verificationSent: "Verification email sent. Check your inbox.",
  generic: "Something went wrong. Please try again.",
} as const;

/** The parts of a Better Auth client error the pages read. */
export interface AuthClientError {
  status: number;
  code?: string;
}

/** The page's copy for a failed request. Never the server's own message. */
export function authErrorMessage(error: AuthClientError): string {
  if (error.status === 429) return MESSAGES.tooManyRequests;

  switch (error.code) {
    case "EMAIL_NOT_AVAILABLE":
      return MESSAGES.emailUnavailable;
    case "INVALID_EMAIL_OR_PASSWORD":
      return MESSAGES.invalidCredentials;
    case "USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL":
      return MESSAGES.accountExists;
    case "PASSWORD_TOO_SHORT":
    case "PASSWORD_TOO_LONG":
      return MESSAGES.passwordLength;
    default:
      return MESSAGES.generic;
  }
}

/** The first value of a search parameter. */
export function param(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/** `path`, carrying the redirect target when it is not the default. */
export function withRedirect(path: string, target: string): string {
  return target === DEFAULT_REDIRECT
    ? path
    : `${path}?redirect=${encodeURIComponent(target)}`;
}

export type SearchParams = Promise<Record<string, string | string[] | undefined>>;
