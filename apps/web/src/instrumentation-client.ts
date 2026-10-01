// Browser-side observability. Both integrations are no-ops when their
// NEXT_PUBLIC_* configuration is absent (e.g. local development).
import * as Sentry from "@sentry/nextjs";
import { scrubAuthTokens } from "@startup/auth/redact";
import { clientEnv } from "@startup/env/client";
import posthog from "posthog-js";

// The reset page receives its token in the URL. Remove it before Sentry and
// PostHog start: PostHog records the first URL it sees as a person property
// and sends it with feature flag requests, which `before_send` never sees.
// The page already has the token from the server. See observability.md.
const startUrl = new URL(window.location.href);

if (startUrl.pathname === "/reset-password" && startUrl.searchParams.has("token")) {
  startUrl.searchParams.delete("token");
  window.history.replaceState(window.history.state, "", startUrl);
}

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

    // The reset page's first pageview carries its token in the URL, as do
    // properties such as $initial_current_url. See observability.md.
    before_send: (event) => (event ? scrubAuthTokens(event) : event),
  });
}
