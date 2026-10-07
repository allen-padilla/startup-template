# Environment Configuration

## Goals

Environment configuration must:

- fail early when required configuration is invalid
- distinguish server-only secrets from browser-visible configuration
- avoid scattered direct access to `process.env`
- provide typed configuration to application code
- never expose server secrets to client bundles

## Environment Files

`.env.example`

Documents supported configuration. Contains no secrets.

`.env.local`

Local developer configuration. Never committed.

Production secrets are provided by the deployment environment.

Both files live in the repository root. The application and the database tooling read the root `.env.local`.

## Variables

| Variable                                                        | Required | Visibility    | Purpose                                       |
| --------------------------------------------------------------- | -------- | ------------- | --------------------------------------------- |
| `DATABASE_URL`                                                  | yes      | server        | PostgreSQL connection string                  |
| `RUN_MIGRATIONS`                                                | no       | server        | `true` applies migrations at server start     |
| `BETTER_AUTH_SECRET`                                            | yes      | server secret | signs sessions; at least 32 characters        |
| `BETTER_AUTH_URL`                                               | yes      | server        | base URL of the application                   |
| `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`                    | no       | server secret | billing; use Stripe test mode locally         |
| `STRIPE_PRICE_PRO_MONTHLY`                                      | no       | server        | Stripe Price ID for the paid plan             |
| `SMTP_URL`                                                      | no       | server secret | SMTP connection string; set with `EMAIL_FROM` |
| `EMAIL_FROM`                                                    | no       | server        | sender address; set with `SMTP_URL`           |
| `NEXT_PUBLIC_SENTRY_DSN`                                        | no       | browser       | enables Sentry                                |
| `NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN`, `NEXT_PUBLIC_POSTHOG_HOST` | no       | browser       | enables PostHog when both are set             |
| `SENTRY_ORG`, `SENTRY_PROJECT`, `SENTRY_AUTH_TOKEN`             | no       | build only    | Sentry source-map upload                      |

Required variables are validated when the application builds and starts. A missing or invalid value fails loudly instead of being ignored.

Optional integrations stay disabled while their variables are unset or empty. Billing endpoints return `503` until Stripe is configured.

## Server Variables

Server-only values are validated by `@startup/env`.

Server secrets must never use the `NEXT_PUBLIC_` prefix.

## Browser Variables

Only variables intentionally exposed to browser code may use the `NEXT_PUBLIC_` prefix.

Treat any `NEXT_PUBLIC_*` value as public information.

Browser variables are validated by `@startup/env/client`. Client code must import from this entry point, never from `@startup/env`, which loads server-only configuration.

Optional browser variables treat an empty value (for example `NEXT_PUBLIC_SENTRY_DSN=`) as unset. Non-empty values must still be valid.

## Paired Variables

Some optional integrations need several values together. When setting only some of them cannot work, validation rejects the partial configuration instead of treating it as disabled. `SMTP_URL` and `EMAIL_FROM` are set together or both left empty. The error names the missing variable and never a value.

## Application Code

Prefer validated environment modules over direct `process.env` access.
