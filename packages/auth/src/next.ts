import { toNextJsHandler } from "better-auth/next-js";

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
