# Database

## Stack

The application uses PostgreSQL with Drizzle ORM.

Local PostgreSQL runs through Docker Compose.

## Local Database

`compose.yaml` defines the local PostgreSQL service. Run these commands from the repository root:

- `pnpm db:up` starts the database on `localhost:5432` and waits until it accepts connections.
- `pnpm db:down` stops and removes the container. The data volume is kept.
- `pnpm db:logs` follows the database logs.
- `pnpm db:studio` opens Drizzle Studio.

`pnpm db:up` waits for the container's health check. A new database takes a few seconds to initialize, and `pnpm db:migrate` fails if it runs before the database is ready.

The database tooling reads `DATABASE_URL` from the shell environment first, then from the root `.env.local`.

## Package

Database code lives in:

`packages/db`

## Schema

Schema definitions live in:

`packages/db/src/schema/`

Authentication-related tables are currently defined in:

`packages/db/src/schema/auth.ts`

Billing tables (`billing_customers`, `subscriptions`) are defined in:

`packages/db/src/schema/billing.ts`

## Migrations

Generated Drizzle migrations live in:

`packages/db/drizzle/`

Schema changes must use the repository migration workflow.

Typical flow:

1. Update the schema.
2. Run `pnpm db:generate`.
3. Review the generated SQL.
4. Check for destructive or unintended changes.
5. Run `pnpm db:migrate`.
6. Run `pnpm verify`.

## Safety

Generated migrations must be reviewed before application.

Do not:

- manually edit production data to make migrations pass
- weaken constraints merely to avoid migration failures
- run destructive production migrations without an explicitly reviewed procedure

## Application Access

Application code should access the database through `@startup/db`.

Packages must not create unrelated ad hoc database connections when the shared database package already provides the required capability.
