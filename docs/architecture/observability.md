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

## PostHog

PostHog is the canonical product analytics and feature-flag system.

Use stable application user IDs when identifying authenticated users.

Do not use email addresses as the primary distinct ID when a stable user ID exists.

Reset analytics identity on logout.

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
