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

## Local Development

Observability integrations must be optional locally.

The application must continue to build and run without configured Sentry or PostHog projects.

## Client vs Server

Any `NEXT_PUBLIC_*` variable is browser-visible and must be treated as public.

Server secrets must never be exposed through client environment variables.