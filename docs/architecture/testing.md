# Testing

## Fast Verification

The canonical local verification command is:

`pnpm verify`

It runs:

- agent harness check (`pnpm agent:check`, see `agent-workflows.md`)
- lint
- TypeScript type checking
- fast automated tests
- production build

Agents must run this before considering implementation complete.

## Full Verification

Also run `pnpm verify:full` for changes affecting significant application behavior or complete user workflows, including authentication, billing, routing, and other cross-system or user-facing behavior.

`pnpm verify:full` runs `pnpm verify` and then the Playwright end-to-end tests. Documentation-only changes do not require it.

## Unit and Integration Tests

Vitest is used for fast unit and integration-level tests.

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

The E2E server runs in production mode, so rate limits apply. Email tests give each test its own address and its own `x-forwarded-for` client IP, so tests never share a mailbox or a rate-limit bucket. Do not raise the limits to make tests pass.

Playwright runs against a production-style Next.js server for more deterministic testing.

`pnpm test:e2e` builds `@startup/web` first, then Playwright starts `scripts/start-e2e-server.sh`, which `exec`s `next start` on `127.0.0.1:3000`. Playwright never reuses an existing server and stops the server when the run finishes. Because the port is fixed, only one worktree at a time may run E2E tests. See `parallel-development.md`.

### Prerequisites

`pnpm test:e2e` and `pnpm verify:full` need all of these locally:

- `.env.local` is configured. The build validates the required server environment (`DATABASE_URL`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`).
- The local database and Mailpit are running, with migrations applied: `pnpm db:up`, then `pnpm db:migrate`.
- `.env.local` sets `SMTP_URL` and `EMAIL_FROM` to the Mailpit values from `.env.example`.
- Port `3000` is free. Stop any development server first.
- The Playwright browser is installed, once per machine: `pnpm exec playwright install chromium`. On Linux, add `--with-deps` to also install the system libraries the browser needs.

`./scripts/check-environment.sh` checks the toolchain and the required environment variables without printing their values.

CI provides the same prerequisites in the workflow, with disposable values instead of `.env.local`. See `continuous-integration.md`.

## Test Quality

Prefer tests that validate externally meaningful behavior.

Do not delete, skip, or weaken tests merely to make an implementation pass.
