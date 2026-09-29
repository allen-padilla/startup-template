# Continuous Integration

## Goals

Continuous integration must:

- be the canonical remote verification environment for every pull request
- run the same commands developers and agents run locally, not separate correctness rules
- be reproducible from the committed lockfile, migrations, and configuration
- run without production secrets or access to production systems
- fail loudly rather than skip checks that cannot run

CI runs on GitHub Actions. Workflows live in `.github/workflows/`.

## Workflows

Both workflows run on every pull request and on pushes to `main`.

A newer run on the same ref cancels an in-progress run (`concurrency` with `cancel-in-progress`).

### Verify

`.github/workflows/verify.yml`, job `Lint, Typecheck, Test, Build`.

Runs `pnpm verify`: lint, type checking, fast automated tests, and a production build.

Timeout: 15 minutes.

### E2E

`.github/workflows/e2e.yml`, job `Playwright`.

1. Starts a PostgreSQL service container.
2. Installs Playwright Chromium.
3. Applies database migrations with `pnpm db:migrate`.
4. Runs `pnpm test:e2e`, which builds `@startup/web` and runs Playwright against a production-style server.
5. Uploads the Playwright report on failure.

Timeout: 20 minutes.

### Shared Setup

Both jobs:

- use Node.js 24 on `ubuntu-latest`
- enable Corepack, so pnpm resolves to the version pinned in `package.json`
- install with `pnpm install --frozen-lockfile`

`--frozen-lockfile` fails the job if `pnpm-lock.yaml` is out of date. Commit lockfile changes together with the `package.json` changes that require them.

## Required Checks

Pull requests into `main` must pass:

| Check                          | Workflow | Local equivalent                  |
| ------------------------------ | -------- | --------------------------------- |
| `Lint, Typecheck, Test, Build` | Verify   | `pnpm verify`                     |
| `Playwright`                   | E2E      | `pnpm test:e2e`                   |

Together they match `pnpm verify:full`.

Keep correctness rules in repository scripts (`package.json`, `turbo.json`, tool configuration), not in workflow YAML. Workflows provide the environment and call those scripts. To change what CI checks, change the script so local verification changes with it.

Do not modify CI to bypass failing checks. This includes:

- adding `continue-on-error`
- removing or skipping steps
- narrowing test selection
- lowering validation strictness

## Postgres Service

The E2E job runs PostgreSQL as a GitHub Actions service container:

- image: `postgres:17`
- user, password, and database: `startup`
- port: `5432` on `localhost`
- health check: `pg_isready`, so the job waits until the database accepts connections

The credentials match the local Docker Compose database in `compose.yaml` and `.env.example`, so CI and local development use the same `DATABASE_URL`.

The database is ephemeral. Each run starts empty and is discarded when the job ends. Tests must not depend on data from a previous run.

Only the E2E job has a database. `pnpm verify` must not require a running database.

## CI Environment Values

The production build validates the required server environment through `@startup/env`. Any job that builds `@startup/web` must provide:

| Variable             | CI value                                               |
| -------------------- | ------------------------------------------------------ |
| `DATABASE_URL`       | `postgresql://startup:startup@localhost:5432/startup`  |
| `BETTER_AUTH_SECRET` | `ci-only-secret-that-is-long-enough-for-validation`    |
| `BETTER_AUTH_URL`    | `http://127.0.0.1:3000`                                |

These values are safe to commit:

- they are placeholders that only satisfy validation
- they grant no access outside the throwaway CI runner
- the database they point to exists only for the duration of the job

`BETTER_AUTH_URL` uses `127.0.0.1:3000` to match the Playwright `baseURL` and the E2E server.

Optional integrations stay unset in CI:

- Stripe (`STRIPE_*`): billing endpoints return a configuration error, which the E2E suite exercises as endpoint protection.
- Sentry and PostHog (`NEXT_PUBLIC_SENTRY_DSN`, `NEXT_PUBLIC_POSTHOG_*`): observability is disabled.
- Sentry source-map upload (`SENTRY_AUTH_TOKEN`): skipped.

GitHub sets `CI=true`. Playwright uses it to forbid `test.only`, retry failed tests twice, and run with a single worker. Sentry uses it to print source-map upload logs.

Turbo runs in strict env mode, so a variable set by the workflow reaches the build only if `turbo.json` lists it under the build task's `env` or `passThroughEnv`.

When adding a new required server variable, add a safe CI value to every workflow that builds the application. See the `add-environment-variable` skill.

## No Production Secrets

CI must not use production secrets, credentials, or live-mode keys.

- Do not add production values to GitHub Actions secrets or variables for these workflows.
- Do not point CI at production or shared databases.
- Do not use live-mode Stripe keys (`sk_live_`, `rk_live_`) in CI.
- Required checks must pass without any repository secrets.

Pull requests from forks and Dependabot run without access to repository secrets. A required check that needs a secret would fail on those pull requests.

If a future workflow needs a credential, such as a Stripe test-mode key or a Sentry upload token, it must:

- be scoped to test or non-production resources
- be stored as a GitHub Actions secret, never in workflow YAML or committed files
- not be printed in logs
- not be required for the pull request checks to pass

## Migration Behavior

The E2E job runs `pnpm db:migrate` before the tests. It applies every committed migration in `packages/db/drizzle/`, in order, to the empty service database.

This verifies that:

- the committed migrations apply cleanly from an empty database
- the application and E2E suite work against the migrated schema

CI does not:

- run `pnpm db:generate`
- create or edit migrations
- run against any persistent database
- detect a schema change that is missing its generated migration

Schema changes must still follow the `database-migration` skill: generate, review the SQL, and commit the migration with the schema change. A migration that fails in CI must be fixed in the migration, not worked around in the workflow.

The Drizzle configuration reads `DATABASE_URL` from the job environment because CI has no `.env.local`.

## Playwright Artifacts

When the E2E job fails, it uploads the `playwright-report/` directory:

- artifact name: `playwright-report`
- retention: 7 days
- not uploaded when the job succeeds

Download it from the failed workflow run's summary page and open `index.html` locally, or run `pnpm exec playwright show-report <directory>`.

Playwright records a trace on the first retry of a failing test (`trace: "on-first-retry"`). Traces are written under `test-results/`.

`playwright-report/` and `test-results/` are gitignored. Never commit them.

## Branch Protection

`main` is the protected integration branch. Expected settings:

- require a pull request before merging
- require the `Lint, Typecheck, Test, Build` and `Playwright` status checks to pass
- require branches to be up to date before merging
- require review from code owners (`.github/CODEOWNERS`)
- block force pushes and branch deletion
- apply the rules to administrators

Branch protection is configured in GitHub repository settings, not in this repository. Treat it as part of CI and keep it in sync with the workflows.

Required checks match on job name. Renaming a job, or the workflow that contains it, breaks the required check. A pull request then waits on a check that never reports. Update branch protection in the same change as any rename.

Dependabot (`.github/dependabot.yml`) opens weekly npm and GitHub Actions update pull requests. They go through the same required checks and review as any other pull request.

## Known Gaps

- `verify.yml` does not set the required server environment values, so `pnpm verify` fails at the production build in CI. It needs the same `env` block as `e2e.yml`.
- `playwright.config.ts` does not configure a reporter. On CI, Playwright defaults to the `dot` reporter, so `playwright-report/` is not generated and the failure upload finds no files. `test-results/`, which holds traces, is not uploaded.

Remove each item once it is fixed.
