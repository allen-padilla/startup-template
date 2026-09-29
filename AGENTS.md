# Repository Guide

## Purpose

Reusable production-oriented startup application template.

## Repository

- `apps/` — deployable applications
- `packages/` — shared packages
- `docs/` — product and engineering documentation
- `scripts/` — repository automation

## Package Manager

Use pnpm.

Do not use npm or yarn for dependency management.

## Development

Node.js 24 is required.

## Agent Guidelines

Before making changes:

1. Understand the relevant existing code.
2. Prefer existing patterns over introducing new ones.
3. Keep changes scoped to the requested task.
4. Do not introduce dependencies without a concrete reason.
5. Verify your work before considering the task complete.

More specific instructions will be added as the repository evolves.

## Verification

Before considering implementation complete, run:

`pnpm verify`

The verification command is the repository's canonical local correctness check.

Do not claim a change is complete if verification fails.

## Architecture

Architecture documentation lives in `docs/architecture/`.

Before making structural or cross-package changes, consult the relevant architecture documentation.

Packages must not depend on applications.

<!-- BEGIN:turborepo-agent-rules -->

# This is NOT the Turborepo you know

Turborepo configuration, task behavior, and CLI commands can vary between installed versions and may differ from your training data. Resolve the `turbo` package from this file's directory or relevant workspace; in monorepos, it may not be visible from the repository root. For example, run `node -p "require.resolve('turbo/package.json')"` from a workspace that depends on `turbo`.

Read `docs/README.md` inside that installed package first, then read the relevant pages from its `docs/` directory before changing Turborepo configuration or commands. Heed deprecation notices. These bundled docs match the installed package version and are available without network access.

This block is written and re-added by `turbo` before repository-scoped commands when an AI agent is detected. In the Turborepo source repository, its template is defined in `crates/turborepo-cli/src/cli/agent_guidance.rs`. Removing the managed block while updates are enabled means a later qualifying invocation will add it again. Set `"agentGuidance": false` in the root `turbo.json` or `turbo.jsonc` to opt out; this does not remove an existing block. Keep the block committed with your work to avoid an uncommitted change on the next agent invocation.
<!-- END:turborepo-agent-rules -->
