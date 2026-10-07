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

Runs `pnpm verify`: the agent harness check, lint, type checking, fast automated tests, and a production build.

Timeout: 15 minutes.

### E2E

`.github/workflows/e2e.yml`, job `Playwright`.

1. Starts PostgreSQL and Mailpit service containers.
2. Installs Playwright Chromium.
3. Applies database migrations with `pnpm db:migrate`.
4. Runs `pnpm test:e2e`, which builds `@startup/web` and runs Playwright against a production-style server.
5. Uploads the Playwright report and test results on failure.

Timeout: 20 minutes.

### Deploy

`.github/workflows/deploy.yml`, job `Trigger Coolify`.

Runs after Verify and E2E complete on `main`. It checks that both passed for the same commit, then calls the Coolify deploy webhook when `COOLIFY_WEBHOOK_URL` and `COOLIFY_TOKEN` exist as repository secrets, and logs that nothing is deployed otherwise. It is not a required check. See `deployment.md`.

### Shared Setup

Both jobs:

- use Node.js 24 on `ubuntu-latest`
- enable Corepack, so pnpm resolves to the version pinned in `package.json`
- install with `pnpm install --frozen-lockfile`
- grant the `GITHUB_TOKEN` only `contents: read`

Keep workflow permissions least-privilege. Grant additional scopes per job, only when a step needs them.

`--frozen-lockfile` fails the job if `pnpm-lock.yaml` is out of date. Commit lockfile changes together with the `package.json` changes that require them.

## Required Checks

Pull requests into `main` must pass these checks before merging. GitHub enforces this only when branch protection is available. See Branch Protection.

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

Only the E2E job has a database. `pnpm verify` must not require a running database. The Verify job sets `DATABASE_URL` only to satisfy build-time environment validation, and no database listens there.

## Mailpit Service

The E2E job also runs the Mailpit mail catcher as a service container, so the email tests can read the messages the application sends:

- image: `axllent/mailpit`, pinned to the same version as `compose.yaml`
- ports: `1025` (SMTP) and `8025` (web API) on `localhost`
- health check: `/mailpit readyz`

The job sets `SMTP_URL=smtp://localhost:1025` and `EMAIL_FROM="Startup Template <no-reply@example.com>"`. Both are safe to commit: they reach only the throwaway Mailpit on the runner, and nothing leaves it. Change the Mailpit version in `compose.yaml` and `e2e.yml` together.

The Verify job leaves both email variables unset, so every pull request also proves that the application builds with email disabled.

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
- Email in the Verify job (`SMTP_URL`, `EMAIL_FROM`): the build runs with email disabled. The E2E job sets both to Mailpit.
- Sentry and PostHog (`NEXT_PUBLIC_SENTRY_DSN`, `NEXT_PUBLIC_POSTHOG_*`): observability is disabled.
- Sentry source-map upload (`SENTRY_AUTH_TOKEN`): skipped.

GitHub sets `CI=true`. Playwright uses it to forbid `test.only`, retry failed tests twice, and run with a single worker. Sentry uses it to print source-map upload logs.

Turbo runs in strict env mode, so a variable set by the workflow reaches the build only if `turbo.json` lists it under the build task's `env` or `passThroughEnv`.

When adding a new required server variable, add a safe CI value to every workflow that builds the application. See the `add-environment-variable` skill.

## No Production Secrets

CI must not use production secrets, credentials, or live-mode keys.

- Do not add production values to GitHub Actions secrets or variables for the Verify and E2E workflows. The Deploy workflow's `COOLIFY_WEBHOOK_URL` and `COOLIFY_TOKEN` are deployment credentials: they can only trigger a deploy, and no check depends on them.
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

When the E2E job fails, it uploads one artifact:

- artifact name: `playwright-results`
- contents: `playwright-report/` (HTML report) and `test-results/` (traces, screenshots, error context)
- retention: 7 days
- not uploaded when the job succeeds
- a missing directory is ignored (`if-no-files-found: ignore`), so a failure before Playwright runs does not add an upload error

On CI, `playwright.config.ts` uses the `list` reporter for readable logs and the `html` reporter (`open: "never"`) to write `playwright-report/`. Local runs keep Playwright's default `list` reporter.

Playwright records a trace on the first retry of a failing test (`trace: "on-first-retry"`). Traces are written under `test-results/`.

Download the artifact from the failed workflow run's summary page, then run `pnpm exec playwright show-report <path>/playwright-report` or `pnpm exec playwright show-trace <path>/test-results/<test>/trace.zip`.

Artifacts can contain request data captured in traces. CI uses only disposable values, so they contain no real credentials. Keep it that way.

`playwright-report/` and `test-results/` are gitignored. Never commit them.

## Branch Protection

`main` is the canonical default branch and the integration branch. Pull requests target `main`.

Recommended protection for `main`:

- require a pull request before merging
- require the `Lint, Typecheck, Test, Build` and `Playwright` status checks to pass
- require branches to be up to date before merging
- block force pushes and branch deletion

Do not require approvals or code-owner review while the repository has a single maintainer. GitHub does not let authors approve their own pull requests, so either setting would block every merge. Add a review requirement once there is a second maintainer.

`.github/CODEOWNERS` still records ownership and requests review from the owner automatically. It lists `@allen-padilla`. Projects created from this template must replace that entry with their own user or team. See `docs/template-checklist.md`.

Branch protection and rulesets are configured in GitHub repository settings, not in this repository. They are not available for private repositories on the GitHub Free plan: the API returns `403 Upgrade to GitHub Pro or make this repository public`. Until the plan or repository visibility changes, CI is advisory. The checks run and report on every pull request, but GitHub does not block merging when they fail. Do not merge a pull request with failing or pending checks.

Do not claim protection is configured without checking the repository settings. When it becomes available, configure it as listed above.

Required checks match on the job's `name`. Renaming a job breaks the required check, and pull requests then wait on a check that never reports. Update branch protection in the same change as any rename.

Dependabot (`.github/dependabot.yml`) opens weekly npm and GitHub Actions update pull requests. They go through the same checks as any other pull request. Minor and patch npm updates are grouped. Major updates open individually, so they can be reviewed as breaking changes. `@types/node` major updates are ignored, because the repository targets Node.js 24. Change that ignore rule together with the Node.js version. `eslint` major updates and `typescript` 7 and later are also ignored, because `pnpm lint` fails on them until the linting plugins add support. See `dependencies.md` for the removal conditions.

## Known Gaps

- CI does not detect a schema change that is missing its generated migration. See Migration Behavior.

Remove each item once it is fixed.
