# Startup Template

## What this is

A production-oriented monorepo for starting a new web application.

It ships with the parts most products need on day one, already wired together and verified in CI:

- a Next.js application in a pnpm and Turborepo workspace
- PostgreSQL with Drizzle migrations
- authentication with Better Auth
- subscription billing with Stripe
- error monitoring with Sentry and product analytics with PostHog
- unit tests with Vitest and end-to-end tests with Playwright
- a repository harness that tells coding agents how to work here

Every integration except the database and authentication is optional locally. The application builds and runs without Stripe, Sentry, or PostHog accounts.

The template lives at [github.com/allen-padilla/startup-template](https://github.com/allen-padilla/startup-template) and is set up as a GitHub template repository.

## Stack

| Area            | Technology                                    |
| --------------- | --------------------------------------------- |
| Application     | Next.js 16 (App Router), React 19, TypeScript |
| Styling         | Tailwind CSS 4                                |
| Workspace       | pnpm, Turborepo                               |
| Database        | PostgreSQL 17, Drizzle ORM                    |
| Authentication  | Better Auth                                   |
| Billing         | Stripe                                        |
| Observability   | Sentry, PostHog                               |
| Testing         | Vitest, Playwright                            |
| CI              | GitHub Actions, Dependabot                    |

## Requirements

- **Node.js 24.** `.node-version` pins it for version managers such as fnm and nvm.
- **pnpm through Corepack.** Corepack ships with Node.js 24 and installs the pnpm version pinned in `package.json`.
- **Docker**, or a compatible runtime that provides `docker compose`, for the local PostgreSQL database.
- **Git.**
- **OpenSSL**, to generate a local secret. Most systems already have it.

On Windows, work inside WSL and keep the repository on the Linux filesystem.

## Quick Start

Create your own repository from the template, either with **Use this template** on the [repository page](https://github.com/allen-padilla/startup-template) or with the GitHub CLI:

```bash
gh repo create my-app --template allen-padilla/startup-template --private --clone
```

The template repository is private, so your GitHub account needs access to it.

Then set up and start the application:

```bash
cd my-app

corepack enable
pnpm install --frozen-lockfile

cp .env.example .env.local
sed -i.bak "s|^BETTER_AUTH_SECRET=.*|BETTER_AUTH_SECRET=$(openssl rand -base64 32)|" .env.local && rm .env.local.bak

pnpm db:up
pnpm db:migrate
pnpm dev
```

Open <http://localhost:3000>.

The `sed` line writes a freshly generated secret into `.env.local` without printing it. Every other value copied from `.env.example` already works for local development.

To check your setup at any point, run:

```bash
./scripts/check-environment.sh
```

It verifies the Node.js version, pnpm, installed dependencies, the required environment variables, and Docker. It changes nothing and never prints a value.

## Environment

- `.env.example` is committed. It documents every supported variable and contains only placeholders and safe local defaults.
- `.env.local` holds your local values. It is gitignored. Never commit it, and never put real credentials in `.env.example`.

Both files live in the repository root. The application and the database tooling read the root `.env.local`.

| Variable                                                        | Required | Visibility    | Purpose                                       |
| --------------------------------------------------------------- | -------- | ------------- | --------------------------------------------- |
| `DATABASE_URL`                                                  | yes      | server        | PostgreSQL connection string                  |
| `NEXT_PUBLIC_APP_URL`                                           | no       | browser       | reserved; not yet read by the application     |
| `BETTER_AUTH_SECRET`                                            | yes      | server secret | signs sessions; at least 32 characters        |
| `BETTER_AUTH_URL`                                               | yes      | server        | base URL of the application                   |
| `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`                    | no       | server secret | billing; use Stripe test mode locally         |
| `STRIPE_PRICE_PRO_MONTHLY`                                      | no       | server        | Stripe Price ID for the paid plan             |
| `NEXT_PUBLIC_SENTRY_DSN`                                        | no       | browser       | enables Sentry                                |
| `NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN`, `NEXT_PUBLIC_POSTHOG_HOST` | no       | browser       | enables PostHog when both are set             |
| `SENTRY_ORG`, `SENTRY_PROJECT`, `SENTRY_AUTH_TOKEN`             | no       | build only    | Sentry source-map upload                      |

Required variables are validated when the application builds and starts. A missing or invalid value fails loudly instead of being ignored.

Optional integrations stay disabled while their variables are unset or empty. Billing endpoints return `503` until Stripe is configured.

**Server and browser values.** Any variable that starts with `NEXT_PUBLIC_` is compiled into the browser bundle and is public. Never put a secret behind that prefix. Everything else stays on the server.

**Generating `BETTER_AUTH_SECRET`.** Generate a new value for every environment. Do not reuse one between projects, and do not use the CI placeholder outside CI.

```bash
openssl rand -base64 32
```

See [docs/architecture/environment.md](docs/architecture/environment.md).

## Database

Local PostgreSQL runs in Docker Compose, configured in `compose.yaml`.

| Command            | What it does                                                        |
| ------------------ | ------------------------------------------------------------------- |
| `pnpm db:up`       | starts PostgreSQL on `localhost:5432` and waits until it is ready   |
| `pnpm db:down`     | stops and removes the container; the data volume is kept            |
| `pnpm db:migrate`  | applies the committed migrations in `packages/db/drizzle/`          |
| `pnpm db:generate` | generates a new migration from schema changes                       |
| `pnpm db:studio`   | opens Drizzle Studio                                                |
| `pnpm db:logs`     | follows the PostgreSQL logs                                         |

To change the schema:

1. Edit the schema in `packages/db/src/schema/`.
2. Run `pnpm db:generate`.
3. Read the generated SQL. Look for dropped tables or columns, unexpected renames, and anything else that loses data.
4. Run `pnpm db:migrate`.
5. Commit the schema change, the migration, and its generated metadata together.

Do not edit generated migrations or their metadata by hand.

See [docs/architecture/database.md](docs/architecture/database.md).

## Development

```bash
pnpm dev
```

This starts the Next.js development server on <http://localhost:3000>.

Run commands from the repository root.

| Path                         | Contents                                           |
| ---------------------------- | -------------------------------------------------- |
| `apps/web`                   | the Next.js application (`@startup/web`)           |
| `packages/auth`              | Better Auth server and client (`@startup/auth`)    |
| `packages/billing`           | Stripe integration (`@startup/billing`)            |
| `packages/db`                | Drizzle schema and migrations (`@startup/db`)      |
| `packages/env`               | validated environment variables (`@startup/env`)   |
| `packages/ui`                | shared React components (`@startup/ui`)            |
| `packages/typescript-config` | shared TypeScript configuration                    |
| `tests/e2e`                  | Playwright tests                                   |
| `docs/architecture`          | how the system is built                            |
| `scripts`                    | repository automation                              |

Applications depend on packages. Packages never depend on applications. See [docs/architecture/package-boundaries.md](docs/architecture/package-boundaries.md).

## Testing

```bash
pnpm test        # Vitest unit and integration tests
pnpm test:e2e    # Playwright end-to-end tests
```

`pnpm test` needs no database and no running server.

`pnpm test:e2e` builds the application, starts it on port `3000`, runs the tests, and stops the server. It needs:

- the local database running with migrations applied
- port `3000` free, so stop `pnpm dev` first
- the Playwright browser, installed once per machine:

```bash
pnpm exec playwright install chromium
```

On Linux, add `--with-deps` to also install the system libraries the browser needs.

See [docs/architecture/testing.md](docs/architecture/testing.md).

## Verification

```bash
pnpm verify        # agent harness check, lint, typecheck, tests, production build
pnpm verify:full   # pnpm verify, then the end-to-end tests
```

Run `pnpm verify` before considering any change complete.

Also run `pnpm verify:full` when a change affects application behavior or a complete user workflow, such as authentication, billing, or routing. Documentation-only changes do not need it.

## Agent Workflows

The repository includes a tool-agnostic harness for coding agents, written in plain Markdown.

| Path                  | Purpose                                                          |
| --------------------- | ---------------------------------------------------------------- |
| `AGENTS.md`           | entry point: repository invariants and where to find the rest    |
| `.agents/rules/`      | detailed rules for every task                                    |
| `.agents/skills/`     | step-by-step procedures for known task types                     |
| `.agents/commands/`   | workflow modes: `plan`, `implement`, `debug`, `review`           |
| `.agents/agents/`     | role definitions: `planner`, `implementer`, `reviewer`           |
| `docs/specs/`         | what a feature should do, agreed before implementation           |
| `docs/plans/`         | how an approved change will be implemented                       |

Current skills: `database-migration`, `add-api-route`, `add-environment-variable`, `add-package`, and `worktree-task`.

Agents verify their work with `pnpm verify` and do not commit unless asked.

`pnpm agent:check` checks the structure of the harness itself, such as skill frontmatter and the repository paths the documentation refers to. It runs as the first step of `pnpm verify`.

`CLAUDE.md` is a thin adapter that points to `AGENTS.md`. Add adapters for other tools the same way, and keep the rules themselves in `AGENTS.md` and `.agents/`. List each new adapter in `ADAPTERS` in `scripts/check-agent-harness.mjs`, so the check covers it.

See [docs/architecture/agent-workflows.md](docs/architecture/agent-workflows.md).

## Parallel Development

When several tasks run at the same time, each one gets its own branch and Git worktree outside the main checkout.

See [docs/architecture/parallel-development.md](docs/architecture/parallel-development.md).

## CI

GitHub Actions runs two workflows on every pull request and on pushes to `main`:

| Workflow | Check                          | Local equivalent |
| -------- | ------------------------------ | ---------------- |
| Verify   | `Lint, Typecheck, Test, Build` | `pnpm verify`    |
| E2E      | `Playwright`                   | `pnpm test:e2e`  |

Both run without any repository secrets. Dependabot opens weekly update pull requests.

**Branch protection is advisory on private repositories on the GitHub Free plan.** GitHub does not offer branch protection or rulesets there, so the checks report on every pull request but do not block merging. Until the plan or the repository visibility changes, do not merge a pull request with failing or pending checks.

See [docs/architecture/continuous-integration.md](docs/architecture/continuous-integration.md).

## Deployment

The template does not deploy anything by itself. It is built for a Next.js host such as Vercel, with a managed PostgreSQL database.

See [docs/architecture/deployment.md](docs/architecture/deployment.md) for production environment variables, migrations, webhooks, and secrets.

## Dependencies

Use pnpm only, and add each dependency to the package that imports it.

See [docs/architecture/dependencies.md](docs/architecture/dependencies.md).

## Using This as a Template

After creating a project from this template, replace these values first:

- `.github/CODEOWNERS`: the owner is `@allen-padilla`, the template maintainer
- `package.json`: `name`, `description`, `license`, and `author`
- this README: the title, the introduction, and the closing maintainer line
- `apps/web/src/app/layout.tsx` and `page.tsx`: the application title, description, and landing page
- `apps/web/src/app/favicon.ico`: the icon
- Stripe, Sentry, and PostHog: your own accounts, products, and projects

The `@startup/*` package names and the local database credentials are intentional template defaults and are safe to keep.

See [docs/template-checklist.md](docs/template-checklist.md) for the full list, including what must change before production.

---

Maintained by Allen.
