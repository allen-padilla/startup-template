// Browser-side observability. Both integrations are no-ops when their
// NEXT_PUBLIC_* configuration is absent (e.g. local development).
import * as Sentry from "@sentry/nextjs";
import { scrubAuthTokens } from "@startup/auth/redact";
import { clientEnv } from "@startup/env/client";
import posthog from "posthog-js";

Sentry.init({
  dsn: clientEnv.NEXT_PUBLIC_SENTRY_DSN,

  // Define how likely traces are sampled. Adjust this value in production, or use tracesSampler for greater control.
  tracesSampleRate: 0.1,

  // Turns off collection of data that could identify users. Adjust per category:
  // https://docs.sentry.io/platforms/javascript/configuration/options/#dataCollection
  dataCollection: {
    userInfo: false,
    graphQL: { document: false, variables: false },
    genAI: { inputs: false, outputs: false },
    databaseQueryData: false,
    queues: false,
    httpBodies: [],
    httpHeaders: { deny: ["forwarded", "-ip", "remote-", "via", "-user"] },
    cookies: { deny: ["forwarded", "-ip", "remote-", "via", "-user"] },
    urlQueryParams: { deny: ["forwarded", "-ip", "remote-", "via", "-user"] },
  },

  // Authentication links carry tokens in their URLs, such as the reset link's
  // path, which dataCollection does not filter. See observability.md.
  beforeSend: scrubAuthTokens,
  beforeSendSpan: scrubAuthTokens,
});

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;

const posthogToken = clientEnv.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN;
const posthogHost = clientEnv.NEXT_PUBLIC_POSTHOG_HOST;

if (posthogToken && posthogHost) {
  posthog.init(posthogToken, {
    api_host: posthogHost,
    defaults: "2026-05-30",
  });
}
