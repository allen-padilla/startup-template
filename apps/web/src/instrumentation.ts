import * as Sentry from "@sentry/nextjs";

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("../sentry.server.config");

    // Authentication emails are sent in the background, so a failed send
    // cannot reach the response. Report it; the error never carries the link,
    // token, recipient, or message body.
    const { setEmailFailureReporter } = await import("@startup/auth");
    setEmailFailureReporter((error) => {
      Sentry.captureException(error);
    });
  }

  if (process.env.NEXT_RUNTIME === "edge") {
    await import("../sentry.edge.config");
  }
}

export const onRequestError = Sentry.captureRequestError;
