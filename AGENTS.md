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