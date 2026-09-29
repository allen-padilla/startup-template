# Authentication

Authentication is implemented with Better Auth.

## Server

Server authentication is exposed by `@startup/auth`.

The server auth package may access:

- the database
- server-only environment variables
- request and session state

Client components must not import server auth code.

## Client

Browser-safe authentication APIs are exposed through:

`@startup/auth/client`

Client code must not access server secrets, database code, or server-only environment modules.

## HTTP

Better Auth is mounted at:

`/api/auth/[...all]`

The route handler comes from `@startup/auth/next` (`authHandler`). Applications must not import `better-auth` directly; the auth package owns the Better Auth dependency.

## Database

Authentication tables are defined in `@startup/db`.

The current auth schema includes:

- `user`
- `session`
- `account`
- `verification`

Authentication schema changes must use the database migration workflow.

## Environment

Authentication uses server-only environment variables such as:

- `BETTER_AUTH_SECRET`
- `BETTER_AUTH_URL`

Secrets must not be exposed through `NEXT_PUBLIC_*` variables.
