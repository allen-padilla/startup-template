# Package Boundaries

## Applications

`apps/` contains deployable applications.

Applications may depend on packages.

Packages must not depend on applications.

## Packages

`packages/` contains reusable capabilities and shared infrastructure.

Packages should expose intentional public APIs rather than requiring consumers to import arbitrary internal files.

## Dependency Direction

Allowed:

packages → external dependencies

apps → packages → external dependencies

Not allowed:

packages → apps

## Current Packages

### @startup/typescript-config

Shared TypeScript configuration for the repository.

This package contains configuration only and must not contain application runtime code.

### @startup/ui

Shared React UI components and design-system primitives.

Applications may depend on this package.

The package must not depend on application code.

Consumers should import from the package's public API rather than internal source paths.

Shared UI primitives belong here when they are reusable across application surfaces.

### @startup/env

Validated environment configuration.

- `@startup/env` exports server-only configuration (`serverEnv`).
- `@startup/env/client` exports browser-safe `NEXT_PUBLIC_*` configuration (`clientEnv`) and must not import server configuration.

See `environment.md`.

### @startup/db

PostgreSQL access through Drizzle ORM: the shared connection (`db`) and schema.

Server-only. Depends on `@startup/env`.

See `database.md`.

### @startup/auth

Better Auth configuration.

- `@startup/auth` exports the server auth instance and is server-only.
- `@startup/auth/client` exports the browser-safe auth client.
- `@startup/auth/next` exports the server-only Next.js route handler (`authHandler`).

Depends on `@startup/db` and `@startup/env`.

See `authentication.md`.

### @startup/billing

Server-side Stripe integration: customer mapping, checkout, webhook verification, and subscription synchronization.

Server-only. Owns the `stripe` dependency. Depends on `@startup/db` and `@startup/env`.

See `billing.md`.

### @startup/decision

Bounded AI decisions (classification, routing, scoring, gating) through TypeSafe's System One API: `createDecisionClient`, typed questions and answers, and `Decision*` errors.

Server-only. Depends on `@startup/env`. The only code that calls the TypeSafe API. No application currently depends on it.

See `decision-models.md`.

### @startup/email

Transactional email over SMTP: `sendEmail`, `createEmailSender`, typed message templates, and `Email*` errors.

Server-only. Owns the `nodemailer` dependency. Depends on `@startup/env`. The only code that opens an SMTP connection.

See `email.md`.
