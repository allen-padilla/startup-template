---
name: add-environment-variable
description: Add, rename, or change the validation of an environment variable, including server secrets, browser-visible NEXT_PUBLIC_ values, and Turbo env propagation.
---

# Add Environment Variable

Use this skill whenever a task introduces a new environment variable or changes how an existing one is validated, exposed, or propagated.

## Source of truth

- `packages/env/src/server.ts` — server-only schema, exported as `serverEnv` from `@startup/env`
- `packages/env/src/client.ts` — browser-safe schema, exported as `clientEnv` from `@startup/env/client`
- `packages/env/src/optional.ts` — `optional(...)` helper that treats an empty string as unset
- `.env.example` — committed documentation of every supported variable, with placeholders or safe local values only
- `.env.local` — ignored local values and secrets, loaded by `apps/web/next.config.ts`
- `turbo.json` — task env hashing and pass-through
- `docs/architecture/environment.md` — the environment model

## Procedure

1. Classify the variable before writing code:
   - **secret or public** — would exposure harm anyone?
   - **server-only or browser-visible** — does browser code need it?
   - **required or optional** — should the app fail to start without it?
   - **build-time or runtime** — is it read during `next build` (inlined, build plugins) or only at request time?

2. Choose the name.
   - Browser-visible values must use the `NEXT_PUBLIC_` prefix. Everything else must not.
   - Anything with `NEXT_PUBLIC_` is inlined into browser bundles and is public. Never put a secret, credential, or token behind it.

3. Add it to the correct schema.
   - Server-only: add to `serverSchema` and the `serverEnv` parse object in `server.ts`.
   - Browser-visible: add to `clientSchema` and the `clientEnv` parse object in `client.ts`. Reference it as a literal `process.env.NEXT_PUBLIC_...` so Next.js can inline it.
   - `client.ts` must never import `server.ts` or anything that does.
   - Validate the format (`url()`, `min(...)`, prefix checks) rather than accepting any string.

4. Choose required vs optional deliberately.
   - Required variables fail validation at startup and at build time.
   - Optional integrations use `optional(...)` so an empty value (`FOO=`) means "disabled" and non-empty values are still validated.
   - For features that are optional until used (like billing), the owning package raises a typed configuration error when a missing value is needed, instead of failing app startup.
   - Do not make a variable optional, or loosen its validation, just to make a build pass.

5. Update `.env.example`.
   - Put it in the right section with a comment saying required/optional, server-only/browser-visible, and where to obtain the value.
   - Use empty placeholders or safe local defaults. Never paste real values.
   - Put real local values only in `.env.local`, which is ignored.

6. Consume it through the validated modules.
   - Server code reads `serverEnv` from `@startup/env`; browser code reads `clientEnv` from `@startup/env/client`.
   - Avoid new direct `process.env` access in application code. Existing exceptions are build tooling such as `next.config.ts`.
   - Add the variable to test setup where needed, for example the `env` block in `packages/billing/vitest.config.ts`.

7. Inspect `turbo.json` when the variable affects a Turbo task (most often `build`).
   - `.env.local` is a `globalDependencies` entry, and `next.config.ts` loads it directly, so local values already reach `next build` and changes to it invalidate the cache.
   - Values supplied by the shell or CI are filtered by Turbo's strict env mode unless listed.
   - `env`: values that intentionally change build output and should change the cache key (for example `BETTER_AUTH_URL`, `SENTRY_ORG`).
   - `passThroughEnv`: secrets and build credentials that must be available but should not be part of the cache key (for example `BETTER_AUTH_SECRET`, `DATABASE_URL`, `SENTRY_AUTH_TOKEN`).
   - `NEXT_PUBLIC_*` is already included for `apps/web` by Turbo's Next.js framework inference; do not list it.
   - Do not add every variable to Turbo. Runtime-only variables that no Turbo task reads need no entry.

8. Update `docs/architecture/environment.md` only when the environment model changes materially, such as a new category, entry point, or rule. Update the owning subsystem's architecture doc when the variable changes how that subsystem is configured.

9. Confirm server values cannot reach the browser.
   - Check that no client component or `@startup/env/client` import chain reaches `@startup/env`, `@startup/db`, `@startup/auth`, or `@startup/billing`.
   - When adding a sensitive server variable, build and search the browser output for its name:

     `grep -r "<VARIABLE_NAME>" apps/web/.next/static`

     This should return nothing. Never print the secret's value while checking.

10. Run:

    `pnpm verify`

    Also run `pnpm verify:full` for changes affecting significant application behavior or complete user workflows, including authentication, billing, routing, and other cross-system or user-facing behavior.

## Report

- variable name and classification (secret/public, server/browser, required/optional, build/runtime)
- schema and `.env.example` changes
- Turbo changes, or why none were needed
- docs updated
- browser-exposure check result
- verification results
