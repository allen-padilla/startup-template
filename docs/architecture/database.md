# Database

## Stack

The application uses PostgreSQL with Drizzle ORM.

Local PostgreSQL runs through Docker Compose.

## Local Database

`compose.yaml` defines the local PostgreSQL service and the Mailpit mail catcher used by email (see `email.md`). Run these commands from the repository root:

- `pnpm db:up` starts the database on `localhost:5432` and Mailpit on `localhost:1025` (SMTP) and `localhost:8025` (web interface), and waits until both are ready.
- `pnpm db:down` stops and removes both containers. The data volume is kept. Mailpit keeps no messages.
- `pnpm db:logs` follows the database logs.
- `pnpm db:studio` opens Drizzle Studio.

Both services publish their ports on `127.0.0.1` only, so nothing else on the network can reach them. The local credentials are in `.env.example` and are public. Connect through `localhost` or `127.0.0.1`. An explicit IPv6 `::1` is refused. To reach the database from another machine, use an SSH tunnel rather than publishing the port.

`pnpm db:up` waits for the containers' health checks. A new database takes a few seconds to initialize, and `pnpm db:migrate` fails if it runs before the database is ready.

If a port is already in use, `pnpm db:up` fails with `port is already allocated`. Stop the other PostgreSQL or mail catcher that holds `5432`, `1025`, or `8025`, or find it with `ss -ltnp`.

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

Rate-limit tables are defined with the tables of the code that uses them:

- `rate_limit` in `packages/db/src/schema/auth.ts`: Better Auth's per-client counters (model `rateLimit`), keyed by client IP and path.
- `email_rate_limit` in `packages/db/src/schema/email.ts`: per-address counters for requests that send email. The key is an HMAC of the endpoint and the address, so no address is stored.

Both hold short-lived counters only. Losing them resets the limits and loses no other data.

## Migrations

Generated Drizzle migrations live in:

`packages/db/drizzle/`

Schema changes must use the repository migration workflow.

Typical flow:

1. Update the schema.
2. Run `pnpm db:generate`.
3. Review the generated SQL.
4. Check for destructive or unintended changes: dropped tables or columns, unexpected renames, and anything else that loses data.
5. Run `pnpm db:migrate`.
6. Run `pnpm verify`.
7. Commit the schema change, the migration, and its generated metadata together.

Do not edit generated migrations or their metadata by hand.

A product with a deployed database never rewrites committed migration history; it adds migrations. The template itself squashed its scaffold history once. A local database created from the older history then fails `pnpm db:migrate` with `relation "account" already exists`. Recreate it: `pnpm db:down`, then `docker compose down -v` (this deletes the local data), then `pnpm db:up && pnpm db:migrate`.

## Safety

Generated migrations must be reviewed before application.

Do not:

- manually edit production data to make migrations pass
- weaken constraints merely to avoid migration failures
- run destructive production migrations without an explicitly reviewed procedure

## Application Access

Application code should access the database through `@startup/db`.

Packages must not create unrelated ad hoc database connections when the shared database package already provides the required capability.
