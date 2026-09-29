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

Playwright runs against a production-style Next.js server for more deterministic testing.

`pnpm test:e2e` builds `@startup/web` first, then Playwright starts `scripts/start-e2e-server.sh`, which `exec`s `next start` on `127.0.0.1:3000`. Playwright never reuses an existing server and stops the server when the run finishes. Because the port is fixed, only one worktree at a time may run E2E tests. See `parallel-development.md`.

### Prerequisites

`pnpm test:e2e` and `pnpm verify:full` need all of these locally:

- `.env.local` is configured. The build validates the required server environment (`DATABASE_URL`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`).
- The local database is running with migrations applied: `pnpm db:up`, then `pnpm db:migrate`.
- Port `3000` is free. Stop any development server first.
- The Playwright browser is installed, once per machine: `pnpm exec playwright install chromium`. On Linux, add `--with-deps` to also install the system libraries the browser needs.

`./scripts/check-environment.sh` checks the toolchain and the required environment variables without printing their values.

CI provides the same prerequisites in the workflow, with disposable values instead of `.env.local`. See `continuous-integration.md`.

## Test Quality

Prefer tests that validate externally meaningful behavior.

Do not delete, skip, or weaken tests merely to make an implementation pass.
