# Deployment

## Purpose

This document describes the intended production model. The template does not include deployment configuration, and nothing in the repository deploys automatically.

The model avoids depending on one vendor where it does not have to. Where a choice is needed, the defaults are a Next.js host such as Vercel and a managed PostgreSQL database.

## Model

| Part          | Production                                                        |
| ------------- | ----------------------------------------------------------------- |
| Application   | `apps/web`, on Vercel or any host that runs Next.js on Node.js    |
| Database      | managed PostgreSQL                                                |
| Secrets       | the deployment platform's secret management                       |
| Verification  | GitHub Actions, before deployment                                 |
| Billing       | Stripe, live mode                                                 |
| Email         | any SMTP provider or relay, optional                              |
| Observability | Sentry and PostHog, both optional                                 |

## Application

The deployable application is `apps/web`. It is a standard Next.js App Router application.

- Build from the repository root, so workspace packages resolve: `pnpm install --frozen-lockfile`, then `pnpm build`.
- On a platform with a project root setting, such as Vercel, set the root directory to `apps/web`. The platform still needs access to the whole repository.
- The host must run Node.js 24.
- Server code runs on the Node.js runtime. `@startup/db` connects with `pg` over TCP, which the Edge runtime does not support.

The repository has no `Dockerfile` and does not use Next.js `output: "standalone"`. Add them in a dedicated change if you deploy to containers.

## Database

Use a managed PostgreSQL service in production. Do not run the Docker Compose database from `compose.yaml` in production. It is for local development only.

- Keep the major version aligned with local development and CI, currently PostgreSQL 17.
- Give each environment its own database. Do not share one between production and preview or staging.
- Require TLS, as the provider recommends.
- On serverless hosts, use the provider's pooled connection string. Each instance opens its own `pg` connection pool, so unpooled connections can exhaust the database's connection limit.
- Never use the local credentials from `.env.example` for a database that is reachable from a network.

## Environment Variables

Set these in the deployment platform. `.env.local` is not used in production, and the application does not need the file to exist.

| Variable                                                        | Required | Needed at       | Notes                                               |
| --------------------------------------------------------------- | -------- | --------------- | --------------------------------------------------- |
| `DATABASE_URL`                                                  | yes      | build, runtime  | secret                                              |
| `BETTER_AUTH_SECRET`                                            | yes      | build, runtime  | secret, at least 32 characters                      |
| `BETTER_AUTH_URL`                                               | yes      | build, runtime  | public origin of the deployment                     |
| `STRIPE_SECRET_KEY`                                             | billing  | runtime         | secret                                              |
| `STRIPE_WEBHOOK_SECRET`                                         | billing  | runtime         | secret                                              |
| `STRIPE_PRICE_PRO_MONTHLY`                                      | billing  | runtime         | live-mode Price ID                                  |
| `TYPESAFE_API_KEY`                                              | decision | runtime         | secret                                              |
| `TYPESAFE_MODEL`                                                | decision | runtime         | TypeSafe model name                                 |
| `SMTP_URL`                                                      | email    | runtime         | secret; your SMTP provider, never the local Mailpit |
| `EMAIL_FROM`                                                    | email    | runtime         | sender on a domain you have verified                |
| `NEXT_PUBLIC_SENTRY_DSN`                                        | no       | build           | public                                              |
| `NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN`, `NEXT_PUBLIC_POSTHOG_HOST` | no       | build           | public                                              |
| `SENTRY_ORG`, `SENTRY_PROJECT`                                  | no       | build           | source-map upload                                   |
| `SENTRY_AUTH_TOKEN`                                             | no       | build           | secret, source-map upload                           |

The production build validates the required server variables through `@startup/env`, so they must exist in the build environment as well as at runtime. The build does not need to reach the database.

Set `SMTP_URL` and `EMAIL_FROM` together, or leave both empty to disable email. Setting only one fails validation. Both local defaults from `.env.example` must change: a deployment that still points at `smtp://localhost:1025` fails every send with a delivery error.

`NEXT_PUBLIC_*` values are compiled into the browser bundle during the build. Changing one requires a new build. Treat all of them as public.

Turborepo runs the build in strict environment mode. A variable set by the platform reaches the build only if `turbo.json` lists it under the build task's `env` or `passThroughEnv`, or if it starts with `NEXT_PUBLIC_`. Follow the `add-environment-variable` skill when adding a variable.

See `environment.md`.

## Secrets

Production secrets belong in the deployment platform's secret management. They never belong in:

- repository files, including `.env.example`
- GitHub Actions workflow YAML
- any `NEXT_PUBLIC_*` variable
- logs, error reports, or analytics events

Use separate values for every environment. Do not reuse a production secret in preview, staging, CI, or local development.

Limit who can read production secrets. Rotate a secret when someone with access leaves or when it may have been exposed.

## Migrations

Migrations are a deliberate release step. The application never migrates the database when it starts.

```bash
pnpm db:migrate
```

`pnpm db:migrate` applies the committed migrations in `packages/db/drizzle/` to the database in `DATABASE_URL`. A value in the shell environment takes precedence over the root `.env.local`.

- Run it from a trusted environment, such as a release pipeline, with the production `DATABASE_URL` supplied by secret management.
- It needs the full install, including development dependencies, because `drizzle-kit` is a development dependency of `@startup/db`.
- Apply migrations before the new application version serves traffic.
- Apply only migrations that are committed, reviewed, and merged to `main`. Do not run `pnpm db:generate` against production, and do not use `drizzle-kit push`.
- Check which database `DATABASE_URL` points to before running the command. A production URL that is exported in a shell or stored in `.env.local` turns a routine local `pnpm db:migrate` into a production migration. Do not keep production URLs in either place.

The previous application version keeps serving traffic while a migration runs. Keep each migration compatible with the version that is currently deployed:

1. Add new tables and columns first, as nullable or with defaults.
2. Deploy the code that uses them.
3. Remove old columns in a later release, after no deployed code reads them.

Back up the database, or confirm that the provider's point-in-time recovery works, before a destructive migration. See `database.md` and the `database-migration` skill.

## Authentication

`BETTER_AUTH_URL` must be the exact public origin users visit, including the scheme, such as `https://app.example.com`.

- Better Auth uses it as its base URL.
- `@startup/billing` builds the Stripe Checkout success and cancel URLs from it.
- A wrong value breaks sign-in and sends users to the wrong place after checkout.

Preview deployments have their own URLs. Each one needs a matching `BETTER_AUTH_URL`, or authentication must be treated as unavailable there.

Generate `BETTER_AUTH_SECRET` separately for each environment with `openssl rand -base64 32`. Changing it invalidates existing sessions and every outstanding verification link.

Leave `BETTER_AUTH_TRUSTED_ORIGINS` unset. Better Auth reads it directly from the environment, and every origin in it becomes a valid redirect target for reset and verification links.

### Rate Limits

In production, Better Auth limits requests per client, including 10 sign-ups per hour per client, and `@startup/auth` limits email requests per address. See `authentication.md` for the limits. Both store their counters in PostgreSQL (`rate_limit`, `email_rate_limit`), so they hold across serverless instances. Apply the migrations before deploying the code that uses them.

Per-client limits identify the client by the `x-forwarded-for` header. Better Auth trusts a single value as sent:

- On Vercel and similar platforms, the platform sets the header, so the default works.
- Behind your own proxy or load balancer, configure `advanced.ipAddress` in `packages/auth/src/auth.ts` (`ipAddressHeaders`, `trustedProxies`) for that proxy.
- Clients behind one shared address, such as an office or carrier NAT, share the per-client limits, including 10 sign-ups per hour.
- Never expose `next start` directly. It passes a client-supplied `x-forwarded-for` through unchanged, so clients could choose their own value and avoid the per-client limit. The per-address limit still applies.

### Email

Set `SMTP_URL` and `EMAIL_FROM` for a provider and a verified sender domain. See `email.md`.

Authentication email is sent with Next.js `after()`, after the response. Vercel keeps the function alive until the send finishes, and `next start` sends in the same process. On a host that stops work when the response ends, sends can be lost. Failed sends are reported to Sentry when it is configured.

See `authentication.md`.

## Security Headers

`apps/web/next.config.ts` sends these headers on every route, so they apply on any host that runs Next.js:

| Header                      | Value                                          | Purpose |
| --------------------------- | ---------------------------------------------- | ------- |
| `X-Content-Type-Options`    | `nosniff`                                      | Browsers do not guess content types. |
| `X-Frame-Options`           | `DENY`                                         | No other site can frame the application (older browsers). |
| `Content-Security-Policy`   | `frame-ancestors 'none'`                       | The same for current browsers. |
| `Referrer-Policy`           | `strict-origin-when-cross-origin`              | Other sites receive only the origin. `/reset-password` overrides it with `no-referrer`, because its URL carries a reset token (see `observability.md`). |
| `Strict-Transport-Security` | `max-age=63072000`                             | Browsers use HTTPS for the next two years after each visit. Browsers ignore it over plain HTTP, so local development is unaffected. |
| `Permissions-Policy`        | `camera=(), microphone=(), geolocation=()`     | The application and anything it embeds cannot use these. |

When two rules match a path and set the same header, the later rule wins, so page-specific rules come after the `/:path*` rule.

- Strict-Transport-Security has no `includeSubDomains` or `preload`. Add them only when every subdomain of the production domain serves HTTPS, because browsers keep the policy for its full `max-age`.
- The Content-Security-Policy restricts only framing. There is no `script-src` policy yet: a useful one needs nonces or hashes for Next.js, Sentry, and PostHog scripts, which is a separate change.
- A product that needs the camera, microphone, or location, or needs to be framed, changes these values in `next.config.ts`.

## Stripe

Create the production webhook endpoint in the Stripe Dashboard, in live mode:

`https://<your-domain>/api/billing/webhook`

Subscribe it to the events the application handles:

- `checkout.session.completed`
- `customer.subscription.created`
- `customer.subscription.updated`
- `customer.subscription.deleted`

Then configure:

- `STRIPE_WEBHOOK_SECRET`: the signing secret of that endpoint. It differs from the secret the Stripe CLI prints locally, and it differs between test mode and live mode.
- `STRIPE_SECRET_KEY`: a live-mode key. Prefer a restricted key (`rk_live_…`) limited to what the application uses.
- `STRIPE_PRICE_PRO_MONTHLY`: the live-mode Price ID. Test-mode and live-mode products and prices are separate objects with different IDs.

Use live-mode keys only in production. Every other environment uses test mode.

Subscription state comes only from verified webhooks. If the webhook endpoint is wrong or its secret does not match, paying customers do not receive access. Send a test event from the Stripe Dashboard after deploying.

See `billing.md`.

## Sentry

- `NEXT_PUBLIC_SENTRY_DSN` enables error and performance reporting. It is public.
- `SENTRY_ORG`, `SENTRY_PROJECT`, and `SENTRY_AUTH_TOKEN` enable source-map upload during the build. Upload is skipped unless the token is present.
- `SENTRY_AUTH_TOKEN` is a secret. Set it only in the build environment, and scope it to releases for one project.

Without source maps, production stack traces point to minified code.

## PostHog

- `NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN` and `NEXT_PUBLIC_POSTHOG_HOST` enable analytics. PostHog starts only when both are set.
- Both are public.
- Use a separate PostHog project for production, so development events do not mix with production data.
- Set the host for the region of your PostHog project.

See `observability.md`.

## CI Before Deploy

Deploy only commits that passed both required checks, `Lint, Typecheck, Test, Build` and `Playwright`.

A hosting platform that deploys on every push to `main` does not wait for GitHub Actions by default. Branch protection is also advisory on the current repository plan. Until one of them enforces the checks:

- merge only pull requests with passing checks
- confirm that `main` is green before promoting a deployment to production

See `continuous-integration.md`.

## Release Checklist

1. CI is green on the commit being deployed.
2. New environment variables are set in the deployment platform.
3. Migrations are reviewed and compatible with the currently deployed version.
4. Migrations are applied.
5. The application is deployed.
6. The homepage and `/api/auth/ok` respond.
7. When billing changed, a Stripe test event reaches the webhook endpoint.
8. When email changed, a password reset request for a test account delivers a message.

## Not Included

The template deliberately leaves these to each project:

- deployment platform configuration
- a container image
- automated deployment or migration pipelines
- preview environment databases
- database backups and restore testing
- uptime monitoring and alerting
