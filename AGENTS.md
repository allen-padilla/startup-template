# Repository Guide

## Purpose

Reusable production-oriented startup application template.

## Repository

- `apps/` — deployable applications
- `packages/` — shared packages
- `docs/` — product and engineering documentation
- `scripts/` — repository automation
- `tests/` — cross-application and end-to-end tests
- `.agents/` — repository-specific agent skills and workflows

## Package Manager

Use pnpm.

Do not use npm or yarn for dependency management.

Run workspace commands from the repository root unless a task specifically requires a package-local command.

See `docs/architecture/dependencies.md` before adding or upgrading dependencies.

## Development

Node.js 24 is required.

Source repositories live inside the WSL/Linux filesystem.

## Agent Guidelines

Before making changes:

1. Understand the relevant existing code.
2. Read relevant architecture documentation before structural or cross-package changes.
3. Prefer existing patterns over introducing new ones.
4. Keep changes scoped to the requested task.
5. Do not introduce dependencies without a concrete reason.
6. Do not weaken validation, tests, security constraints, or architecture rules merely to make a task pass.
7. Verify your work before considering the task complete.
8. Review the resulting diff for accidental or unrelated changes.

Do not commit changes unless the task explicitly requests a commit.

## Verification

The canonical fast local correctness check is:

`pnpm verify`

It currently covers:

- agent harness structure (`pnpm agent:check`)
- lint
- type checking
- fast automated tests
- production build

`pnpm verify` is required before considering implementation complete.

Also run `pnpm verify:full` for changes affecting significant application behavior or complete user workflows, including authentication, billing, routing, and other cross-system or user-facing behavior. It adds end-to-end browser testing. Documentation-only changes do not require it.

Do not claim a change is complete if verification fails.

## Architecture

Architecture documentation lives in `docs/architecture/`.

Before making structural or cross-package changes, consult the relevant architecture documentation.

Applications may depend on packages.

Packages must not depend on applications.

Prefer intentional package public APIs over imports from another package's internal source paths.

## Server and Client Boundaries

Server-only code may access:

- database connections
- server-only environment variables
- credentials and secrets
- privileged request/session state

Client code must not import server-only modules.

Any `NEXT_PUBLIC_*` environment variable is browser-visible and must be treated as public.

Do not move server code into client components merely to make an import work.

## Secrets and Environment Variables

- Never commit secrets, credentials, tokens, or private keys.
- `.env.example` documents supported environment variables and must contain placeholders or safe local examples only.
- Local secrets belong in ignored environment files such as `.env.local`.
- Application code should use the repository's validated environment modules instead of scattering direct `process.env` access.
- Never weaken environment validation merely to make a build pass.
- Never print or expose secret values during debugging.

## Authentication

Authentication code lives in `packages/auth`.

Server authentication is exposed through the server auth package.

Browser-safe authentication code must use the client auth entry point.

Client components must not import:

- server auth configuration
- database code
- server-only environment modules
- secret-bearing modules

Authentication schema changes must use the database migration workflow.

## Database

Database code lives in `packages/db`.

Schema definitions live in `packages/db/src/schema/`.

Schema changes must use the database migration workflow.

For schema changes, use the `database-migration` skill.

Generated migration SQL must be reviewed for destructive or data-loss changes before it is applied.

Never run destructive production database operations unless the task explicitly authorizes a reviewed production procedure.

## Billing

Stripe server code lives in `packages/billing` (`@startup/billing`). Do not import `stripe` elsewhere.

- `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET` are server-only. Never expose them via `NEXT_PUBLIC_*` or client code.
- Price IDs come from server configuration. Never treat a client-supplied price ID as authoritative.
- Subscription state comes only from verified Stripe webhooks. Checkout redirects never grant paid access.
- Decide paid access with `getUserEntitlement` from `@startup/billing`. Do not interpret subscription statuses elsewhere.
- Webhook handlers must verify signatures over the raw body and be idempotent.
- Use Stripe test mode for development and testing.

See `docs/architecture/billing.md`.

## Email

Email code lives in `packages/email` (`@startup/email`). It is the only code that opens an SMTP connection or imports a mail library. Do not import `nodemailer` elsewhere.

- `SMTP_URL` and `EMAIL_FROM` are server-only. `SMTP_URL` is a secret. Set both or neither.
- Add messages as templates in `@startup/email`; escape user-supplied values with its `html` template tag.
- Never log or report message bodies, links, or tokens.
- Mailpit is for local development and CI only.

See `docs/architecture/email.md`.

## Testing

Vitest is used for fast unit and integration-level tests.

Playwright is used for end-to-end browser testing.

Prefer tests that validate externally meaningful behavior rather than implementation details.

Do not delete, skip, or weaken tests merely to make a change pass.

See Verification for when to run `pnpm verify:full`. See `docs/architecture/testing.md` for what end-to-end tests need before they can run.

## Observability

Sentry is used for runtime error and performance monitoring.

PostHog is used for product analytics and feature flags.

Observability must remain optional for local development.

Do not send:

- secrets
- credentials
- raw auth tokens
- unnecessary personal data

to observability systems.

Use stable authenticated user IDs when identifying users in analytics.

## Generated and Tool-Managed Files

Do not manually edit generated files or tool-managed sections unless the task specifically requires it.

Examples include:

- generated Drizzle migration metadata
- tool-managed blocks inside `AGENTS.md`
- generated framework files

When a tool owns a marked section, preserve the section boundaries.

## Agent Workflows

The agent harness lives in `.agents/`. See `docs/architecture/agent-workflows.md` for how its layers fit together and which guidance takes precedence.

- `.agents/rules/repository.md` — detailed repository rules. Read it before substantive repository work.
- `.agents/skills/` — repeatable procedures. When a task matches a skill, read and follow it instead of improvising.
- `.agents/commands/` — workflow modes: `plan`, `implement`, `debug`, `review`.
- `.agents/agents/` — role definitions: `planner`, `implementer`, `reviewer`.

Current skills:

- `database-migration` — Drizzle/PostgreSQL schema changes
- `add-api-route` — Next.js route handlers in `apps/web`
- `add-environment-variable` — server and browser environment variables
- `add-package` — `@startup/*` workspace packages
- `worktree-task` — tasks in a Git worktree and parallel agent work

Desired feature behavior may be specified in `docs/specs/`. Implementation plans may be saved in `docs/plans/` when requested.

Keep detailed procedures in `.agents/`, not in `AGENTS.md`.

## Continuous Integration

GitHub Actions is the canonical remote verification environment.

Pull requests must pass the required verification and E2E checks before merge.

Do not modify CI to bypass failing repository checks.

Keep local verification commands aligned with CI rather than duplicating different correctness rules in workflow YAML.

See `docs/architecture/continuous-integration.md`.

## Parallel Development

When several tasks run at the same time, each uses its own Git worktree:

- one task, one branch, one worktree, one primary owner
- worktrees live outside the repository, in `~/dev/worktrees/`
- the main checkout stays on `main` and coordinates: updating, reviewing, merging, and cleaning up

Small tasks with no parallel work may still follow the normal small-task flow in the main checkout.

Avoid overlapping active changes to shared hotspots, such as root manifests, `pnpm-lock.yaml`, `AGENTS.md`, and database schema or migrations. Report overlap instead of racing.

Only one active task may own database schema and migration changes at a time.

Tasks integrate through pull requests. See `docs/architecture/parallel-development.md` and the `worktree-task` skill.

<!-- BEGIN:turborepo-agent-rules -->

# This is NOT the Turborepo you know

Turborepo configuration, task behavior, and CLI commands can vary between installed versions and may differ from your training data. Resolve the `turbo` package from this file's directory or relevant workspace; in monorepos, it may not be visible from the repository root. For example, run `node -p "require.resolve('turbo/package.json')"` from a workspace that depends on `turbo`.

Read `docs/README.md` inside that installed package first, then read the relevant pages from its `docs/` directory before changing Turborepo configuration or commands. Heed deprecation notices. These bundled docs match the installed package version and are available without network access.

This block is written and re-added by `turbo` before repository-scoped commands when an AI agent is detected. In the Turborepo source repository, its template is defined in `crates/turborepo-cli/src/cli/agent_guidance.rs`. Removing the managed block while updates are enabled means a later qualifying invocation will add it again. Set `"agentGuidance": false` in the root `turbo.json` or `turbo.jsonc` to opt out; this does not remove an existing block. Keep the block committed with your work to avoid an uncommitted change on the next agent invocation.
<!-- END:turborepo-agent-rules -->
