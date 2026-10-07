import * as Sentry from "@sentry/nextjs";

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("../sentry.server.config");

    // A single-instance host sets RUN_MIGRATIONS=true, so the committed
    // migrations apply before the server accepts requests. A failure stops
    // the start. See docs/architecture/deployment.md.
    const { serverEnv } = await import("@startup/env");
    if (serverEnv.RUN_MIGRATIONS === "true") {
      const { migrateDatabase } = await import("@startup/db/migrate");
      await migrateDatabase();
      console.log("Migrations applied.");
    }

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
