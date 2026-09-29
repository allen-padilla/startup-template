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