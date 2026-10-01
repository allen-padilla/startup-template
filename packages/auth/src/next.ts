import { toNextJsHandler } from "better-auth/next-js";
import { headers } from "next/headers";

import { auth } from "./auth";
import { withMinimumDuration } from "./minimum-duration";

const handler = toNextJsHandler(auth);

// Responses to reset requests take at least this long, so the time does not
// reveal whether the address has an account. Sending happens in the
// background and never adds to it.
export const PASSWORD_RESET_MINIMUM_MS = 500;

export const authHandler = {
  ...handler,
  POST: (request: Request) =>
    new URL(request.url).pathname.endsWith("/request-password-reset")
      ? withMinimumDuration(PASSWORD_RESET_MINIMUM_MS, () =>
          handler.POST(request),
        )
      : handler.POST(request),
};

/**
 * The current request's session, or `null` when signed out. Reads the request
 * headers itself, so it works in server components, server actions, and route
 * handlers. It never redirects or throws for a missing session: pages
 * redirect, route handlers return `401`.
 */
export async function getSession() {
  return auth.api.getSession({ headers: await headers() });
}

export type Session = NonNullable<Awaited<ReturnType<typeof getSession>>>;
