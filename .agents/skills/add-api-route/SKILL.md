---
name: add-api-route
description: Add or materially change a Next.js API route handler in apps/web, including authenticated endpoints and signed webhooks.
---

# Add API Route

Use this skill whenever a task adds a Next.js route handler or materially changes the behavior, authentication, input, or response contract of an existing one.

## Source of truth

Route handlers live in:

`apps/web/src/app/api/<...>/route.ts`

Existing examples:

- `apps/web/src/app/api/auth/[...all]/route.ts` — Better Auth handler, re-exported from `@startup/auth/next`
- `apps/web/src/app/api/billing/checkout/route.ts` — authenticated endpoint that delegates to `@startup/billing`
- `apps/web/src/app/api/billing/webhook/route.ts` — signed Stripe webhook that verifies the raw body

Domain logic belongs in the owning `@startup/*` package, exposed through that package's public entry point. Route handlers are thin HTTP adapters.

## Procedure

1. Read the existing route handlers above and the architecture docs for the affected domain in `docs/architecture/` (`authentication.md`, `billing.md`, `database.md`, `package-boundaries.md`).

2. Decide the route path and HTTP methods. Export one function per method (`GET`, `POST`, ...) from `route.ts`.

3. Decide whether the route requires authentication.
   - Authenticated routes use the existing Better Auth server instance:
     `auth.api.getSession({ headers: request.headers })` from `@startup/auth`.
   - Return `401` when there is no session.
   - Do not create parallel authentication, session parsing, or cookie handling.

4. Decide where the logic lives.
   - Put business rules, database access, and third-party API calls in the owning `@startup/*` package and export them from its public entry point.
   - Create or extend a package (see the `add-package` skill) instead of placing reusable domain logic in `apps/web`.
   - The handler should only:
     - authenticate
     - read and validate the request
     - call the package function
     - translate domain results and typed errors into HTTP responses

5. Validate user-controlled input.
   - Treat the body, query string, route params, and headers as untrusted.
   - Validate shape and values before passing them to package code.
   - Never accept authoritative values from the client when the server owns them. For example, Stripe price IDs come from server configuration; `billing/checkout` ignores the request body entirely.

6. Map errors deliberately.
   - Catch the package's typed errors (for example `AlreadySubscribedError`, `BillingConfigurationError`, `WebhookSignatureError`) and return an explicit status with a JSON body via `Response.json(...)`.
   - Let unexpected errors propagate rather than masking them as success.
   - Do not include secrets, stack traces, or internal identifiers in response bodies.

7. For signed webhooks:
   - Read the body with `await request.text()`.
   - Verify the signature over that exact raw body before parsing or trusting the payload.
   - Never call `request.json()` before verification.
   - Keep processing idempotent; the sender may retry.
   - Return a non-2xx status only when a retry could succeed.

8. Keep server code on the server.
   - Route handlers are server code. Client components must not import the route's server dependencies (`@startup/auth`, `@startup/db`, `@startup/env`, `@startup/billing`).
   - Browser code calls the route over HTTP or uses browser-safe entry points such as `@startup/auth/client` and `@startup/env/client`.

9. Add tests.
   - Unit-test domain logic with Vitest in the owning package, next to the implementation.
   - Add a Playwright test in `tests/e2e/` when the route is important externally visible behavior, such as authentication gates, rejected unsigned webhooks, or user-facing flows. See `tests/e2e/billing.spec.ts`.

10. Run targeted tests first, for example:

    `pnpm --filter @startup/<package> test`

11. Run:

    `pnpm verify`

    Also run `pnpm verify:full` for changes affecting significant application behavior or complete user workflows, including authentication, billing, routing, and other cross-system or user-facing behavior. New or changed API routes usually qualify.

12. Review `git diff` for unrelated edits, server code reachable from client code, and secret exposure.

## Report

- route path and methods
- authentication requirement
- package functions added or used
- input validation and error-to-status mapping
- tests added
- verification results
- remaining concerns
