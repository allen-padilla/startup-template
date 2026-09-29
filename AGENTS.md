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

- lint
- type checking
- fast automated tests
- production build

Before considering implementation complete, run `pnpm verify`.

Do not claim a change is complete if verification fails.

For significant user-facing, authentication, billing, routing, or workflow changes, also run:

`pnpm verify:full`

This adds end-to-end browser testing.

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

Generated migrations must be reviewed before they are applied.

Inspect generated SQL for:

- destructive operations
- accidental drops
- unsafe renames
- missing constraints
- data-loss implications

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

## Testing

Vitest is used for fast unit and integration-level tests.

Playwright is used for end-to-end browser testing.

Prefer tests that validate externally meaningful behavior rather than implementation details.

Do not delete, skip, or weaken tests merely to make a change pass.

Use `pnpm verify:full` for significant changes affecting complete user workflows.

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

## Skills

Repository-specific procedural workflows live in `.agents/skills/`.

Use a skill when the task matches that workflow instead of improvising a new process.

Current important skill:

- `database-migration` — safe Drizzle/PostgreSQL schema changes

<!-- BEGIN:turborepo-agent-rules -->

# This is NOT the Turborepo you know

Turborepo configuration, task behavior, and CLI commands can vary between installed versions and may differ from your training data. Resolve the `turbo` package from this file's directory or relevant workspace; in monorepos, it may not be visible from the repository root. For example, run `node -p "require.resolve('turbo/package.json')"` from a workspace that depends on `turbo`.

Read `docs/README.md` inside that installed package first, then read the relevant pages from its `docs/` directory before changing Turborepo configuration or commands. Heed deprecation notices. These bundled docs match the installed package version and are available without network access.

This block is written and re-added by `turbo` before repository-scoped commands when an AI agent is detected. In the Turborepo source repository, its template is defined in `crates/turborepo-cli/src/cli/agent_guidance.rs`. Removing the managed block while updates are enabled means a later qualifying invocation will add it again. Set `"agentGuidance": false` in the root `turbo.json` or `turbo.jsonc` to opt out; this does not remove an existing block. Keep the block committed with your work to avoid an uncommitted change on the next agent invocation.
<!-- END:turborepo-agent-rules -->
