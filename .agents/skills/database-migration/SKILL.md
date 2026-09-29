---
name: database-migration
description: Safely create and apply Drizzle PostgreSQL schema migrations in this repository.
---

# Database Migration

Use this skill whenever a task changes the PostgreSQL schema.

## Source of truth

Database schema lives in:

`packages/db/src/schema/`

Generated migrations live in:

`packages/db/drizzle/`

Do not hand-edit generated migration metadata unless the task specifically requires repairing migration state.

## Parallel Work

Only one active task or worktree may own schema and migration changes at a time.

Before generating a migration:

- check `git worktree list` and active plans for another task that changes `packages/db/src/schema/` or `packages/db/drizzle/`
- if another task owns schema changes, stop and report the overlap

Two branches that generate migrations from the same base collide on migration numbers and `meta/_journal.json`. If another migration branch must land first, rebase or merge onto the updated `main`, restore `packages/db/drizzle/` to the updated `main` version, and run `pnpm db:generate` again from the new base. Do not hand-merge migration files or journal entries. If the discarded migration was already applied to the local database, report it.

All worktrees share the local PostgreSQL database. `pnpm db:migrate` changes it for every worktree, so do not run concurrent migrations against it.

See `docs/architecture/parallel-development.md`.

## Procedure

1. Understand the requested data-model change.
2. Inspect the existing schema and relevant migrations.
3. Make the smallest necessary schema change.
4. Run:

   `pnpm db:generate`

5. Read the generated SQL.

6. Check for:
   - accidental destructive changes
   - dropped columns/tables
   - unexpected renames
   - missing constraints
   - unsafe defaults
   - data-loss implications

7. Apply locally with:

   `pnpm db:migrate`

8. Run:

   `pnpm verify`

9. Report:
   - schema changes
   - generated migration
   - whether migration succeeded
   - any rollout or data-migration concerns

## Safety

Never run destructive database operations against production unless the task explicitly authorizes a reviewed production procedure.

Never modify production data manually to make a migration appear successful.

Do not weaken schema constraints merely to make a migration pass.
