# Observability

## Goals

Observability should help diagnose:

- runtime errors
- performance regressions
- production incidents
- product usage and funnels
- feature rollout behavior

## Sentry

Sentry is the canonical runtime error and performance monitoring system.

Do not send secrets, credentials, raw auth tokens, or unnecessary personal data to Sentry.

Failed authentication emails are reported to Sentry from `apps/web/src/instrumentation.ts`. The reported `EmailError` never contains the link, token, recipient, or message body.

Authentication links carry tokens in their URLs. The password reset link has its token in the path (`/api/auth/reset-password/<token>`), which `dataCollection` does not filter, and server spans record the full path in `http.target` and `url.full`. Every Sentry configuration passes errors (`beforeSend`) and spans (`beforeSendSpan`) through `scrubAuthTokens` from `@startup/auth/redact`, which replaces the reset path's token and the value of any query parameter whose name contains `token` with `[Filtered]`. Keep both hooks in every `Sentry.init`. A new URL that carries a token in its path needs a pattern in `packages/auth/src/redact.ts`.

## PostHog

PostHog is the canonical product analytics and feature-flag system.

Use stable application user IDs when identifying authenticated users.

Do not use email addresses as the primary distinct ID when a stable user ID exists.

Reset analytics identity on logout. The account page's sign-out calls `posthog.reset()` when PostHog is loaded.

Keep tokens in URLs out of analytics. The password reset page (`/reset-password?token=…`) is the template's only page that receives one, and three measures cover it:

- `src/instrumentation-client.ts` removes `token` from the URL on `/reset-password` before Sentry and PostHog start. This is required, not only defensive: PostHog records the first URL it sees as a person property (`$initial_current_url`) and sends it with feature flag requests, which `before_send` never sees. The page receives the token from the server, so it does not need it in the URL.
- PostHog's `before_send` passes every event, including session replay data (`$snapshot`), through `scrubAuthTokens`.
- `/reset-password` is served with `Referrer-Policy: no-referrer` (`next.config.ts`), so its URL is never sent to other sites.

A new page that receives a token in its URL needs the same treatment: add it to the removal in `instrumentation-client.ts`, and to `scrubAuthTokens` if the token is in the path.

## Implementation

Observability is initialized in `apps/web`:

- `src/instrumentation-client.ts` initializes Sentry and PostHog in the browser.
- `src/instrumentation.ts` loads `sentry.server.config.ts` or `sentry.edge.config.ts` for the active runtime.
- `src/app/global-error.tsx` reports uncaught rendering errors to Sentry.

Runtime configuration comes from `@startup/env/client`:

- `NEXT_PUBLIC_SENTRY_DSN` — Sentry is disabled when unset.
- `NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN` and `NEXT_PUBLIC_POSTHOG_HOST` — PostHog initializes only when both are set.

Sentry `dataCollection` settings disable user info, request bodies, database query data, and identifying headers, cookies, and query parameters.

Source-map upload is build-only. It runs only when the build environment provides `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, and `SENTRY_PROJECT`. `SENTRY_AUTH_TOKEN` is a secret and is a Turborepo pass-through variable rather than a cache input.

## Local Development

Observability integrations must be optional locally.

The application must continue to build and run without configured Sentry or PostHog projects.

## Client vs Server

Any `NEXT_PUBLIC_*` variable is browser-visible and must be treated as public.

Server secrets must never be exposed through client environment variables.
