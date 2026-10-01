import {
  EmailError,
  emailVerificationEmail,
  passwordResetEmail,
  type EmailMessage,
  type RenderedEmail,
} from "@startup/email";

import type { RunInBackground } from "./background";
import type { EmailFailureReporter } from "./report";

export interface AuthEmailOptions {
  send: (message: EmailMessage) => Promise<void>;
  runInBackground: RunInBackground;
  reportFailure: EmailFailureReporter;
}

interface Recipient {
  email: string;
  name: string;
}

/**
 * Better Auth email callbacks. Each schedules the send and returns at once, so
 * responses never wait for SMTP and a failed send never changes a response.
 * Links and tokens stay inside the message; failures report only the error.
 */
export function createAuthEmailCallbacks(options: AuthEmailOptions) {
  function deliver(user: Recipient, render: () => RenderedEmail) {
    return options.runInBackground(async () => {
      try {
        await options.send({ to: user.email, ...render() });
      } catch (error) {
        options.reportFailure(
          error instanceof EmailError
            ? error
            : new EmailError("Authentication email failed."),
        );
      }
    });
  }

  return {
    sendResetPassword: ({ user, url }: { user: Recipient; url: string }) =>
      deliver(user, () => passwordResetEmail({ name: user.name, url })),

    sendVerificationEmail: ({ user, url }: { user: Recipient; url: string }) =>
      deliver(user, () => emailVerificationEmail({ name: user.name, url })),
  };
}
