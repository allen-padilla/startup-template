# Testing

## Fast Verification

The canonical local verification command is:

`pnpm verify`

It runs:

- agent harness check (`pnpm agent:check`, see `agent-workflows.md`)
- lint, in every package: `apps/web` uses `eslint-config-next`, and the packages share the root `eslint.config.mjs`
- TypeScript type checking
- fast automated tests
- production build

## Full Verification

`pnpm verify:full` runs `pnpm verify` and then the Playwright end-to-end tests.

The Verification section of `AGENTS.md` says when each command is required.

## Unit and Integration Tests

Vitest is used for fast unit and integration-level tests.

The harness scripts are the exception. Their tests are `scripts/lib/*.test.mjs`, use Node's built-in test runner, and need no dependencies. `pnpm agent:check` runs them, so they are part of `pnpm verify`. The tests of `scripts/lib/status.mjs` create small Git repositories in the temporary directory.

Tests should generally live close to the implementation they exercise.

Unit and integration tests never open a network connection. Packages that talk to external services inject fakes. `@startup/email` and `@startup/auth` also load a setup file (`src/testing/no-network.ts`) that fails any test that tries to connect. Databases run in memory with PGlite.

Example:

`src/lib/utils.ts`

`src/lib/utils.test.ts`

## End-to-End Tests

Playwright tests live in:

`tests/e2e/`

The current E2E suite includes smoke coverage for:

- homepage loading
- authentication endpoint availability
- billing endpoint protection (unauthenticated checkout, unsigned webhooks)
- email (`tests/e2e/email.spec.ts`): password reset end to end, sign-up verification, identical responses for unknown addresses, and signed-in-only verification resend. The tests read delivered messages from Mailpit through `tests/e2e/support/mailpit.ts` (`MAILPIT_URL`, default `http://127.0.0.1:8025`).
- Sentry: the reset link's token never reaches Sentry (`tests/e2e/email.spec.ts`). The test follows the link with a sampled `sentry-trace` header, so the server records its spans whatever the sample rate.
- rate limits (`tests/e2e/rate-limits.spec.ts`): 10 sign-ups per hour per client.
- security headers (`tests/e2e/security-headers.spec.ts`): the headers on `/` and `/account`, and `Referrer-Policy: no-referrer` on `/reset-password`.
- authentication pages (`tests/e2e/auth-pages.spec.ts`): sign-up, sign-in and its redirect rule, sign-out, verification (same browser, signed out, resend, altered link), password reset through the pages, identical forgot-password messages, the "email unavailable" and rate-limit messages, and that the reset page's token never reaches PostHog or Sentry. Browser tests import `test` from `tests/e2e/support/fixtures.ts`, which gives every browser context its own client IP and provides `newVisitor()` for a second visitor.

`pnpm test:e2e` builds the application with `scripts/build-e2e.sh`, which points Sentry and PostHog at an observability stub on `127.0.0.1:9999` (`tests/e2e/support/observability-stub.ts`). Playwright starts the stub with the application, and tests read what it received through `tests/e2e/support/observability.ts`. E2E runs therefore never report to real Sentry or PostHog projects, even when `.env.local` sets other values. These `NEXT_PUBLIC_*` values are inlined at build time, so a build made by `pnpm test:e2e` reports to the stub until the next build.

PostHog drops events from browsers it considers bots, which includes every automated browser. A test that needs PostHog's events must present as a regular browser, as the reset page test in `auth-pages.spec.ts` does. Do not turn off PostHog's bot filter in the application to make tests pass.

The E2E server runs in production mode, so rate limits apply. Tests give each test its own address and its own `x-forwarded-for` client IP, so tests never share a mailbox or a rate-limit bucket. Do not raise the limits to make tests pass.

Playwright runs the application with `BETTER_AUTH_URL=http://127.0.0.1:3000`, the origin the tests use. Better Auth rejects browser requests from any other origin, and `.env.local` usually says `http://localhost:3000`. CI sets the same value.

Playwright runs against a production-style Next.js server for more deterministic testing.

`pnpm test:e2e` builds `@startup/web` first, then Playwright starts `scripts/start-e2e-server.sh`, which `exec`s `next start` on `127.0.0.1:3000`. Playwright never reuses an existing server and stops the server when the run finishes. Playwright also starts the observability stub on `127.0.0.1:9999`. Because the ports are fixed, only one worktree at a time may run E2E tests. See `parallel-development.md`.

### Prerequisites

`pnpm test:e2e` and `pnpm verify:full` need all of these locally:

- `.env.local` is configured. The build validates the required server environment (`DATABASE_URL`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`).
- The local database and Mailpit are running, with migrations applied: `pnpm db:up`, then `pnpm db:migrate`.
- `.env.local` sets `SMTP_URL` and `EMAIL_FROM` to the Mailpit values from `.env.example`.
- Ports `3000` and `9999` are free. Stop any development server first.
- The Playwright browser is installed, once per machine: `pnpm exec playwright install chromium`. On Linux, add `--with-deps` to also install the system libraries the browser needs.

`./scripts/check-environment.sh` checks the toolchain and the required environment variables without printing their values.

CI provides the same prerequisites in the workflow, with disposable values instead of `.env.local`. See `continuous-integration.md`.

## Test Quality

Prefer tests that validate externally meaningful behavior.

Do not delete, skip, or weaken tests merely to make an implementation pass.
