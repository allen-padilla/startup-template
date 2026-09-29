# Environment Configuration

## Goals

Environment configuration must:

- fail early when required configuration is invalid
- distinguish server-only secrets from browser-visible configuration
- avoid scattered direct access to `process.env`
- provide typed configuration to application code
- never expose server secrets to client bundles

## Environment Files

`.env.example`

Documents supported configuration. Contains no secrets.

`.env.local`

Local developer configuration. Never committed.

Production secrets are provided by the deployment environment.

## Server Variables

Server-only values are validated by `@startup/env`.

Server secrets must never use the `NEXT_PUBLIC_` prefix.

## Browser Variables

Only variables intentionally exposed to browser code may use the `NEXT_PUBLIC_` prefix.

Treat any `NEXT_PUBLIC_*` value as public information.

Browser variables are validated by `@startup/env/client`. Client code must import from this entry point, never from `@startup/env`, which loads server-only configuration.

## Application Code

Prefer validated environment modules over direct `process.env` access.