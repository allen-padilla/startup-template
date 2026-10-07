# Repository Guide

## Purpose

Reusable production-oriented startup application template.

## Repository

- `apps/` — deployable applications
- `packages/` — shared packages
- `docs/` — product and engineering documentation
- `scripts/` — repository automation
- `tests/` — cross-application and end-to-end tests
- `.agents/` — repository-specific agent rules, skills, and workflows

## Toolchain

Node.js 24 and pnpm. Do not use npm or yarn for dependency management. Run workspace commands from the repository root unless a task specifically requires a package-local command. See `docs/architecture/dependencies.md` before adding or upgrading dependencies.

## Agent Guidelines

Before making changes:

1. Read `.agents/rules/repository.md`. It holds the operational rules for every area of the repository.
2. Understand the relevant existing code, and the relevant `docs/architecture/` document before structural or cross-package changes.
3. Prefer existing patterns over introducing new ones.
4. Keep changes scoped to the requested task.
5. Do not introduce dependencies without a concrete reason.
6. Do not weaken validation, tests, security constraints, or architecture rules merely to make a task pass.
7. Verify your work before considering the task complete.
8. Review the resulting diff for accidental or unrelated changes.

Do not commit changes unless the task explicitly requests a commit.

## Verification

This is the one statement of the verification policy. Other documents point here.

`pnpm verify` is required before considering implementation complete. It runs the agent harness check (`pnpm agent:check`), lint, type checking, fast automated tests, and the production build.

`pnpm verify:full` is also required for changes affecting significant application behavior or complete user workflows, including authentication, billing, routing, and other cross-system or user-facing behavior. It adds end-to-end browser testing. Documentation-only changes do not require it.

Do not claim a change is complete if verification fails. See `docs/architecture/testing.md` for what the end-to-end tests need before they can run.

## Invariants

- Applications may depend on packages. Packages must not depend on applications. Import packages only through their public entry points.
- Server-only code (database connections, server-only environment variables, credentials, privileged request state) must never be imported by client code. Any `NEXT_PUBLIC_*` environment variable is browser-visible and public.
- Never commit secrets, credentials, tokens, or private keys. `.env.example` holds placeholders only; local secrets go in the ignored `.env.local`. Never print secret values.
- Authentication lives in `packages/auth`, the database and its migrations in `packages/db`, Stripe in `packages/billing`, and email in `packages/email`. Each is the only code that uses its third-party SDK.
- Schema changes go through the database migration workflow, and generated SQL is reviewed before it is applied.
- Paid access is decided only by `getUserEntitlement` from `@startup/billing`, from webhook-verified state.
- Sentry and PostHog are optional locally and never receive secrets, tokens, or unnecessary personal data.
- Do not delete, skip, or weaken tests, and do not modify CI, to make a change pass.

## Agent Workflows

The agent harness lives in `.agents/`. See `docs/architecture/agent-workflows.md` for how its layers fit together and which guidance takes precedence.

- `.agents/rules/repository.md` — the operational rules for every area. Read it before substantive work.
- `.agents/skills/` — repeatable procedures. When a task matches a skill, read and follow it instead of improvising: `database-migration`, `add-api-route`, `add-environment-variable`, `add-package`, `worktree-task`.
- `.agents/commands/` — workflow modes: `plan`, `implement`, `debug`, `review`.

Desired feature behavior is specified in `docs/specs/`, and implementation plans in `docs/plans/`. Task state is recorded, not remembered: each slice of a plan records its status below its heading, and `pnpm agent:status` shows it together with the active branches and worktrees. Start a task by reading that state.

When several tasks run at the same time, each uses its own branch and Git worktree, and the main checkout stays on `main`. See `docs/architecture/parallel-development.md`.

GitHub Actions runs `pnpm verify` and the end-to-end tests on every pull request. See `docs/architecture/continuous-integration.md`.

<!-- BEGIN:turborepo-agent-rules -->

# This is NOT the Turborepo you know

Turborepo configuration, task behavior, and CLI commands can vary between installed versions and may differ from your training data. Resolve the `turbo` package from this file's directory or relevant workspace; in monorepos, it may not be visible from the repository root. For example, run `node -p "require.resolve('turbo/package.json')"` from a workspace that depends on `turbo`.

Read `docs/README.md` inside that installed package first, then read the relevant pages from its `docs/` directory before changing Turborepo configuration or commands. Heed deprecation notices. These bundled docs match the installed package version and are available without network access.

This block is written and re-added by `turbo` before repository-scoped commands when an AI agent is detected. In the Turborepo source repository, its template is defined in `crates/turborepo-cli/src/cli/agent_guidance.rs`. Removing the managed block while updates are enabled means a later qualifying invocation will add it again. Set `"agentGuidance": false` in the root `turbo.json` or `turbo.jsonc` to opt out; this does not remove an existing block. Keep the block committed with your work to avoid an uncommitted change on the next agent invocation.
<!-- END:turborepo-agent-rules -->
