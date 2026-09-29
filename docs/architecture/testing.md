# Testing

## Fast Verification

The canonical local verification command is:

`pnpm verify`

It runs:

- lint
- TypeScript type checking
- fast automated tests
- production build

Agents must run this before considering implementation complete.

## Full Verification

For significant user-facing, authentication, billing, routing, or workflow changes, run:

`pnpm verify:full`

This additionally runs Playwright end-to-end tests.

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

Playwright runs against a production-style Next.js server for more deterministic testing.

## Test Quality

Prefer tests that validate externally meaningful behavior.

Do not delete, skip, or weaken tests merely to make an implementation pass.