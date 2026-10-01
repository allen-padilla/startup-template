# Transactional Email

## Goal

Implement `docs/specs/transactional-email.md`:

- a server-only `@startup/email` package that sends one SMTP message with an HTML body and a plain-text body
- password reset and email verification through Better Auth, sending through `@startup/email`
- a local mail catcher (Mailpit) that works with the Quick Start without edits
- optional configuration (`SMTP_URL`, `EMAIL_FROM`) that leaves `pnpm verify` green with both values empty

The work is split into slices. Each slice passes `pnpm verify` on its own and can be reviewed and merged separately.

## Resolved Questions

These were ambiguous in the spec or conflict with Better Auth 1.7.6. The answers below were agreed before planning and are recorded in the spec (Slice 0).

| Question | Resolution |
| --- | --- |
| Sending during the request versus not revealing whether an account exists through response time | Sends run through Next.js `after()`. They start during the request, and the response does not wait for them. On Vercel `after()` uses `waitUntil`. On `next start` it runs in the same process. `POST /request-password-reset` also has a fixed minimum response time. |
| Only one of `SMTP_URL` and `EMAIL_FROM` is set | Environment validation fails, so the application does not start. |
| Who can request a new verification email | Signed-in users only. An unauthenticated `POST /send-verification-email` returns `401`. |
| Verification links that were already used | Accepted as Better Auth behaves. Verification links are signed and stateless, so they are not single-use. Following one again after verification succeeds. The spec's "already used" edge case applies to reset links. |
| Testing the "email not configured" behavior | An integration test in `@startup/auth` runs Better Auth's HTTP handler against in-memory PGlite. The Verify CI job also builds with both variables empty. No second Playwright server. |
| Rate limits and storage | Per client: Better Auth's default for these endpoints (3 per 60 s per IP), stored in Postgres. Per address: 3 per hour per address per endpoint, stored as a keyed hash in its own table. No Redis. |

Defaults chosen by this plan:

- `pnpm db:up` and `pnpm db:down` keep their names. They already run `docker compose up` and `down` for every Compose service, so Mailpit starts and stops with the database.
- Mailpit uses a pinned image, with SMTP on `127.0.0.1:1025` and its web interface on `127.0.0.1:8025`.
- `nodemailer` 10.x is the mail library. It has no dependencies and ships its own types. Only `@startup/email` uses it.
- The "not available" error is `503` with Better Auth's error body: `{ "code": "EMAIL_NOT_AVAILABLE", "message": "Email is not available." }`.
- When email is not configured, the server logs one warning per process, at the first sign-up. Logging at import would print it during every build.
- `autoSignInAfterVerification` stays off.

## Better Auth 1.7.6 Compared With the Spec

Checked against the installed source in `better-auth/dist` and `@better-auth/core/dist`.

| Spec behavior | Better Auth 1.7.6 | Plan |
| --- | --- | --- |
| Reset link works once and expires after one hour | `consumeVerificationValue` deletes the token inside a transaction and rejects expired tokens. `resetPasswordTokenExpiresIn` defaults to 3600 s. | Met. Set the expiry explicitly. |
| Every session ends after a reset | `revokeSessionsOnPasswordReset` exists and defaults to `false`. Session cookie caching is off, so deleting the sessions takes effect immediately. | Set it to `true`. Document that enabling `session.cookieCache` would keep revoked sessions valid until the cache expires. |
| Unknown address gets the same response | `/request-password-reset` returns the same `200` body either way. | Met. |
| Unknown address takes the same time | The unknown path does a dummy lookup. The known path writes a token, then waits for `sendResetPassword`. The SMTP round trip reveals the account. | The send runs through `after()`, so the response never waits for SMTP. A 500 ms minimum response time hides the token write. |
| "Not available" when not configured | Without a send function, Better Auth returns `400` (`RESET_PASSWORD_DISABLED`, `VERIFICATION_EMAIL_NOT_ENABLED`). With a send function that throws, unknown addresses still get `200`. | A `hooks.before` returns `503` for both endpoints before any lookup. |
| Sign-up succeeds when the email fails | Sign-up calls the send function through `runInBackgroundOrAwait`, which catches errors. | Met. Our send functions schedule the send and return, so they never throw. |
| A signed-in user can request a new link | `/send-verification-email` also accepts any address without a session. It has a 500 ms minimum response time, but it passes send errors to the caller, which reveals that the account exists. | A `hooks.before` requires a session. |
| Expired, used, or altered links get a generic error | Reset links fail with `INVALID_TOKEN`. Verification links fail with `INVALID_TOKEN` or `TOKEN_EXPIRED`. `USER_NOT_FOUND` appears only for a genuine token whose account was deleted. A used verification link succeeds. | Accepted and documented. See Resolved Questions. |
| Rate limits per client | Limits are keyed by IP and path, kept in memory by default, and enabled only when `NODE_ENV=production`. | `rateLimit.storage: "database"` adds a `rate_limit` table, so limits hold across serverless instances. |
| Rate limits per address | Not supported. | Our own `hooks.before`, counting in an `email_rate_limit` table. |
| Client IP | Taken from a single `x-forwarded-for` value unless `advanced.ipAddress.trustedProxies` is set. A directly exposed server lets clients choose the value. | Document host-specific configuration. The per-address limit is the backstop. |
| Redirects stay on the application's origin | Allowed: the `BETTER_AUTH_URL` origin and safe relative paths. Protocol-relative URLs, backslashes, and encoded separators are rejected. Better Auth also reads `BETTER_AUTH_TRUSTED_ORIGINS` directly from `process.env`, and it skips origin checks entirely when `NODE_ENV=test`. | Configure no `trustedOrigins`. Document that `BETTER_AUTH_TRUSTED_ORIGINS` must stay unset. Redirect tests set `advanced.disableOriginCheck: false`. |
| Verification state is available to products | `session.user.emailVerified` | Met. Document it. |
| No account enumeration (spec scope) | `POST /sign-up/email` returns `422` for an address that is taken. | Outside the spec. Recorded under Risks. |

## Existing System

- `packages/auth/src/auth.ts` creates the Better Auth singleton at import from `@startup/db` and `serverEnv`, with only `emailAndPassword.enabled`.
- `@startup/auth/next` exports `authHandler` (`toNextJsHandler(auth)`). `apps/web/src/app/api/auth/[...all]/route.ts` re-exports it.
- `@startup/auth` has no tests, no `vitest.config.ts`, and no `test` script.
- `packages/env/src/server.ts` validates server variables. `optional()` treats an empty value as unset.
- `@startup/decision` is the reference for an optional, server-only integration: lazy configuration errors, typed errors that never contain secrets, a deterministic test environment, and tests that cannot reach the network.
- `@startup/billing` tests use in-memory PGlite with the repository migrations applied (`src/testing/database.ts`).
- `compose.yaml` has only `postgres`. `pnpm db:up` runs `docker compose up -d --wait`, which starts every service in the file.
- The E2E workflow runs a Postgres service container and no repository secrets. The Verify workflow sets only the three required variables.
- Rate limiting is currently in memory and enabled in production, including the E2E server, which runs `next start`.

## Slices

Each slice lists its files, routes, tests, skill, and verification. Every slice runs `pnpm verify`.

### Slice 0: Amend the Spec (done)

Documentation only. Done on `docs/transactional-email-spec`, together with this plan.

- `docs/specs/transactional-email.md`:
  - Decisions: Configuration (setting only one variable fails validation), Verification resend, Verification link reuse, Delivery (`after()`), and Rate-limit storage.
  - Local Development: `pnpm db:up` and `pnpm db:down` keep their names.
  - Email Verification: one-hour expiry, links stay valid until they expire, and only a signed-in user can request a new link.
  - When Email Is Not Configured: one warning per process, at the first sign-up.
  - Edge Cases: "already used" applies to reset links only.
  - Security: how timing is hidden, and the rate limits and their storage.
  - Acceptance Criteria: an unauthenticated resend is rejected (tested in Slice 4), and setting only one variable fails validation (tested in Slice 1).

Skill: none. Verification: `pnpm agent:check`.

### Slice 1: Configuration and Local Mail Catcher

| File | Change |
| --- | --- |
| `packages/env/src/server.ts` | Add `SMTP_URL` and `EMAIL_FROM` as `optional(...)`, plus a refinement that rejects one value set without the other. The error names the missing variable and never a value. `SMTP_URL` must be a URL with protocol `smtp:` or `smtps:` and a host. `EMAIL_FROM` must be `address` or `Display Name <address>`, contain no CR or LF, and contain a valid address. |
| `packages/env/src/email-from.ts` (new) | The `EMAIL_FROM` parser, used by the env schema. |
| `packages/env/src/server.test.ts` (new), `packages/env/package.json` | Add `vitest` and a `test` script. Test cases: both empty, both valid, only one set (fails and names the other), invalid URL, invalid sender, line break in the sender, no value in any error message. Because `server.ts` parses at import, the tests check the exported schema. Export `serverSchema` for this, or move the schema into `schema.ts`. |
| `packages/billing/vitest.config.ts`, `packages/decision/vitest.config.ts` | Add `SMTP_URL: ""` and `EMAIL_FROM: ""`, so values from a developer's shell never reach the tests. |
| `.env.example` | New Email section: `SMTP_URL=smtp://localhost:1025` and `EMAIL_FROM="Startup Template <no-reply@example.com>"`. Comments: optional, server-only, both or neither, percent-encode reserved characters in credentials, Mailpit is local-only, and both values must change before deploying. |
| `compose.yaml` | Add a `mailpit` service with a pinned `axllent/mailpit` tag, ports `127.0.0.1:1025:1025` and `127.0.0.1:8025:8025`, and a health check (`/mailpit readyz`) so `--wait` covers it. |
| `scripts/check-environment.sh` | Warn when only one email variable is set, without printing either value. |
| `docs/architecture/environment.md` | New rule: paired optional variables are both set or both empty. |
| `docs/architecture/database.md` | Under Local Database: `pnpm db:up` also starts Mailpit, and how to handle ports `1025` and `8025` already in use. |
| `docs/architecture/deployment.md` | Environment table rows: `SMTP_URL` (email, runtime, secret) and `EMAIL_FROM` (email, runtime). Both must replace the local defaults. |
| `docs/architecture/parallel-development.md` | Mailpit is shared by every worktree, like Postgres. |
| `docs/template-checklist.md` | Safe to Keep: Mailpit and its local `SMTP_URL`. |
| `README.md` | Quick Start: `pnpm db:up` also starts the mail catcher at <http://localhost:8025>. |

- `turbo.json`: no change. Both variables are read only at runtime, as with `TYPESAFE_*`.
- Routes: none.
- Tests: `@startup/env` schema tests.
- Skill: `add-environment-variable`.
- Verification:
  - `pnpm --filter @startup/env test`
  - `pnpm verify`
  - `pnpm build`, then `grep -r "SMTP_URL" apps/web/.next/static`, which must find nothing
  - `pnpm db:up` starts both services

### Slice 2: The `@startup/email` Package

Nothing uses the package yet.

| File | Change |
| --- | --- |
| `packages/email/package.json` | `@startup/email`, private, ESM, single `.` export. Dependencies: `@startup/env`, `nodemailer`. Dev dependencies: `vitest`, `typescript`, `@types/node`, `@startup/typescript-config`. |
| `packages/email/tsconfig.json`, `vitest.config.ts` | Same shape as `packages/decision`. The test environment has both email variables empty, and `setupFiles` loads the network guard. |
| `src/errors.ts` | `EmailError` is the base class. `EmailConfigurationError` has `variables` and names the missing variable or variables. `EmailValidationError` covers an invalid recipient, or a line break in the recipient or subject. `EmailDeliveryError` has `reason` (`timeout`, `connection`, `authentication`, `rejected`, or `unknown`) and an SMTP `code` when one exists. Messages never contain the connection string, credentials, recipient, subject, or bodies. There is no `cause`, so Sentry cannot serialize the underlying nodemailer error. |
| `src/config.ts` | Reads `serverEnv` lazily and exposes `isEmailConfigured()`. |
| `src/send.ts` | `createEmailSender({ smtpUrl, from, timeoutMs = 10_000, transport? })` returns `{ send(message) }`. `sendEmail(message)` uses the configured default sender. It validates before connecting. It sets nodemailer's connection, greeting, and socket timeouts, adds an overall deadline that closes the transport, and does not retry. |
| `src/template.ts` | `escapeHtml`, an `html` tagged template that escapes every interpolated value, and the `EmailTemplate<Input>` type, which returns `{ subject, html, text }`. |
| `src/templates/password-reset.ts`, `src/templates/email-verification.ts` | Typed inputs `{ name, url }` and both bodies. Product copy lives in `src/templates/brand.ts` (`productName`). |
| `src/testing/no-network.ts` | Test setup that replaces `net.connect`, `net.createConnection`, `tls.connect`, and `net.Socket.prototype.connect` with functions that fail the test. |
| `src/index.ts` | Public API: `sendEmail`, `createEmailSender`, `isEmailConfigured`, the errors, `EmailMessage`, `EmailTemplate`, `escapeHtml`, `html`, `passwordResetEmail`, `emailVerificationEmail`. |
| `docs/architecture/email.md` (new) | Boundaries, configuration, sending, errors, and how to add a message (template plus call, with no change to `@startup/auth`). Connection examples with placeholders: a hosted provider over `smtps://…:465`, Amazon SES over `smtp://…@email-smtp.<region>.amazonaws.com:587` with STARTTLS, and a self-hosted relay. Also covers percent-encoding, local Mailpit, testing, and that Mailpit is never for production. |
| `docs/architecture/package-boundaries.md` | Add `@startup/email`. |
| `docs/architecture/dependencies.md` | Single owner: `nodemailer` belongs to `@startup/email`. |
| `AGENTS.md`, `.agents/rules/repository.md` | Short Email section: only `@startup/email` opens SMTP connections or imports a mail library, `SMTP_URL` is a server-only secret, and errors and logs never contain bodies or tokens. |

- Routes: none.
- Tests (`src/*.test.ts`):
  - Templates: both bodies are present, user values are escaped in HTML, and the link appears in both bodies.
  - `EmailConfigurationError` names the missing variable and contains no value.
  - CR or LF in the recipient or subject is rejected before the transport is called.
  - A fake transport that throws an error containing the connection string gives an `EmailDeliveryError` whose `message`, `String(error)`, and JSON form contain neither the URL nor its password.
  - A fake transport that never resolves gives `reason: "timeout"`, tested with fake timers.
  - Nodemailer's `streamTransport` builds a MIME message with `text/plain` and `text/html` parts, without a network.
- Skill: `add-package`.
- Verification: `pnpm --filter @startup/email typecheck`, `pnpm --filter @startup/email test`, `pnpm verify`.
- Hotspots: `pnpm-lock.yaml`, `AGENTS.md`.

### Slice 3: Rate-Limit Tables

| File | Change |
| --- | --- |
| `packages/db/src/schema/auth.ts` | `rateLimit` (`pgTable("rate_limit")`): `id` text primary key, `key` text unique not null, `count` integer not null, `last_request` bigint (`mode: "number"`) not null. The fields match Better Auth's `rateLimit` model. |
| `packages/db/src/schema/email.ts` (new) | `emailRateLimit` (`pgTable("email_rate_limit")`): `key` text primary key, `count` integer not null, `window_start` timestamp not null. The key is an HMAC, never an address. |
| `packages/db/src/schema/index.ts` | Export both tables. |
| `packages/db/drizzle/0004_*.sql` and `meta/*` | Generated. Additive only: two new tables. |
| `docs/architecture/database.md` | List the new tables and their owners. |

The tables are separate because Better Auth deletes `rate_limit` rows older than its longest configured window (60 s). That would erase hourly per-address counts.

- Routes: none.
- Tests: the billing tests apply every migration to PGlite, which also checks that the new migration applies.
- Skill: `database-migration`.
- Verification: `pnpm db:generate`, review the SQL, `pnpm db:migrate`, `pnpm verify`.
- Hotspots: `packages/db/src/schema/*` and `packages/db/drizzle/*`. Confirm that no other active task owns them.

### Slice 4: Password Reset and Verification in `@startup/auth`

| File | Change |
| --- | --- |
| `packages/auth/src/auth.ts` | Split into `createAuth({ db, secret, baseURL, email, runInBackground, rateLimitEnabled? })` and the exported `auth = createAuth(...from serverEnv)`. The configuration is listed after this table. |
| `packages/auth/src/email.ts` (new) | `sendResetPassword` and `sendVerificationEmail` callbacks. Each renders a template, passes `sendEmail(...)` to `runInBackground`, and returns. A failure goes to the reporter as the `EmailError` only. The URL and token never reach a log, an error, or the reporter. |
| `packages/auth/src/background.ts` (new) | The default `runInBackground` calls `after()` from `next/server`. Outside a request scope, where `after()` throws, it awaits the send inline. This is also where a future jobs package would enqueue instead. |
| `packages/auth/src/hooks.ts` (new) | The `hooks.before` rules, listed after this table. |
| `packages/auth/src/email-rate-limit.ts` (new) | One atomic `INSERT … ON CONFLICT (key) DO UPDATE` that resets the count when the window has passed and returns the new count. The key is `HMAC-SHA256(BETTER_AUTH_SECRET, "<endpoint>:<lower-cased address>")`. |
| `packages/auth/src/report.ts` (new), `packages/auth/src/index.ts` | `setEmailFailureReporter(fn)`. The default logs `error.name` and `error.message`, which are safe. |
| `packages/auth/src/next.ts` | `authHandler` wraps `POST /request-password-reset` with a 500 ms minimum response time, measured around the whole Better Auth handler. Other routes are unchanged. |
| `apps/web/src/instrumentation.ts` | In `register()` on the Node.js runtime, call `setEmailFailureReporter(Sentry.captureException)`. |
| `packages/auth/package.json` | Add dependency `@startup/email` (`workspace:*`). Add `next` as a peer dependency (`^16.3.6`) and as an exact dev dependency matching `apps/web`. Add dev dependencies `vitest`, `@electric-sql/pglite`, and `drizzle-orm` with the same specifiers as `packages/billing`. Add a `test` script. |
| `packages/auth/vitest.config.ts`, `src/testing/database.ts` | Deterministic environment with email empty, the network guard, and PGlite with the migrations applied (same pattern as billing). |
| `docs/architecture/authentication.md` | Password reset, verification, configured and unconfigured behavior, session revocation, the `emailVerified` state for products, redirects, rate limits, and `after()`. |
| `docs/architecture/email.md` | How auth messages are sent, the failure reporter, and that pages receiving a reset token must be kept out of analytics capture. |
| `docs/architecture/deployment.md` | Rate-limit storage. Client IP configuration for each kind of host (`advanced.ipAddress`). A host must support `after()`, which Vercel and `next start` do. Leave `BETTER_AUTH_TRUSTED_ORIGINS` unset. Release checklist: a reset email arrives. |
| `docs/architecture/observability.md` | Exclude pages that carry reset tokens from PostHog capture and Sentry URLs. |
| `docs/architecture/dependencies.md` | Aligned versions: `next` in `apps/web` and `packages/auth`. `drizzle-orm` and `@electric-sql/pglite` are also used by the `@startup/auth` tests. |
| `docs/template-checklist.md` | Replace Immediately: the sender address in `EMAIL_FROM` and `productName` in the email templates. Configure Before Production: an SMTP provider, plus SPF and DKIM (and DMARC) for the sender domain. |
| `README.md` | Stack table and diagram: email, Mailpit, `@startup/email`. |

Better Auth configuration in `createAuth`:

- `emailAndPassword`:
  - `revokeSessionsOnPasswordReset: true`
  - `resetPasswordTokenExpiresIn: 3600`
  - `sendResetPassword` only when email is configured
- `emailVerification`, only when email is configured:
  - `sendOnSignUp: true`
  - `sendVerificationEmail`
  - `expiresIn: 3600`
  - `autoSignInAfterVerification: false`
- `rateLimit: { storage: "database" }`, which keeps Better Auth's default rules (3 per 60 s for both endpoints) and its default of enabling limits only in production
- no `trustedOrigins`
- `hooks.before` from `hooks.ts`
- a `hooks.after` on `/sign-up/email` that logs the "email not configured" warning once per process

`hooks.before` rules:

1. When email is not configured, `/request-password-reset` and `/send-verification-email` return `503 EMAIL_NOT_AVAILABLE`.
2. `/send-verification-email` without a session returns `401`.
3. The per-address limit for both endpoints is 3 per hour per address. It is counted whether or not the account exists, and returns the same `429` body as Better Auth.

Routes (existing Better Auth routes under `/api/auth`). The route file is unchanged.

| Route | Change |
| --- | --- |
| `POST /request-password-reset` | Sends a reset email in the background. `503` when not configured. Per-client and per-address `429`. 500 ms minimum response time. |
| `GET /reset-password/:token` | Unchanged. Redirects to `callbackURL` with the token, or with `error=INVALID_TOKEN`. |
| `POST /reset-password` | Now ends every session for the account. |
| `POST /sign-up/email` | Sends a verification email when configured. Never fails because of email. |
| `POST /send-verification-email` | Requires a session (`401`). `503` when not configured. Per-address `429`. |
| `GET /verify-email` | Unchanged. Marks the address as verified. |

Tests (`packages/auth/src/*.test.ts`). They call Better Auth's handler with `Request` objects against PGlite, with a recording fake sender and an inline `runInBackground`:

- **Reset:**
  - A known address gets one message containing the link. An unknown address gets the same status and body and no message.
  - The token works once. The new password signs in, and the old one is rejected.
  - A session created before the reset is invalid afterwards.
  - An expired token is rejected with `INVALID_TOKEN`.
  - A second request sends a second message, and each token works once.
- **Delivery failure:** the reset response is unchanged. The reporter receives an `EmailDeliveryError` that contains neither the token nor the URL.
- **Sign-up:** a delivery failure still lets sign-up succeed. Following the verification link sets `emailVerified`.
- **Resend:** without a session it returns `401`. With a session it returns `200` and sends one message.
- **Not configured:**
  - sign-up and sign-in work and send nothing
  - reset returns `503 EMAIL_NOT_AVAILABLE` for both known and unknown addresses
  - resend returns `503`
  - the warning is logged once across two sign-ups
- **Limits** (with `rateLimitEnabled: true`):
  - the 4th reset request for an address within an hour returns `429`, for both known and unknown addresses
  - the per-client limit returns `429`
- **Redirects** (with `advanced.disableOriginCheck: false`): an absolute `redirectTo` on another origin returns `403`. A relative path is accepted.
- **Minimum response time:** a `next.ts` wrapper test with fake timers.

Skills: `add-api-route` (this materially changes the `/api/auth/*` contract) and `add-package` (manifest changes).

Verification:

- `pnpm --filter @startup/auth test`
- `pnpm verify`
- `pnpm verify:full`
- `pnpm build`, then `grep -r "SMTP_URL" apps/web/.next/static`, which must find nothing

Hotspots: `pnpm-lock.yaml`.

### Slice 5: End-to-End Tests and CI

| File | Change |
| --- | --- |
| `.github/workflows/e2e.yml` | Add a `mailpit` service container (same pinned image, ports `1025` and `8025`, health check). Job environment: `SMTP_URL: smtp://localhost:1025` and `EMAIL_FROM: "Startup Template <no-reply@example.com>"`. No secrets. |
| `.github/workflows/verify.yml` | No change. Both variables stay unset, which covers "builds with both empty". |
| `tests/e2e/support/mailpit.ts` (new) | Polls `GET /api/v1/search?query=to:"<address>"` and reads the message with `GET /api/v1/message/<id>`, with a bounded wait. Defaults to `http://127.0.0.1:8025` and can be overridden with `MAILPIT_URL`. |
| `tests/e2e/email.spec.ts` (new) | Every test uses a unique address (`e2e-<uuid>@example.test`) and sends a unique `x-forwarded-for`, so per-IP buckets do not collide. |
| `docs/architecture/testing.md` | Mailpit is an E2E prerequisite, and lists the email E2E coverage. |
| `docs/architecture/continuous-integration.md` | The Mailpit service, the CI email values, and that both workflows still need no secrets. |

`tests/e2e/email.spec.ts` tests:

1. Sign up, then request a reset with `redirectTo: "/reset-password"`. Read the message from Mailpit, follow the link with redirects off, and take the token from `Location`. Set a new password. The new password signs in and the old one is rejected. A session cookie captured before the reset no longer returns a session from `GET /api/auth/get-session`.
2. Sign up, read the verification message, and follow the link. `get-session` then shows `emailVerified: true`.
3. Requests for an unknown address and a known address get identical status and body. The known address's message arrives, and after that no message exists for the unknown address.

- Tests: the three E2E tests above, plus a check that the existing suites still pass.
- Skill: none specific. Follow the testing and CI architecture docs.
- Verification: `pnpm db:up`, `pnpm db:migrate`, `pnpm verify`, `pnpm verify:full`.

Check during implementation: whether `next start` passes a client-supplied `x-forwarded-for` through unchanged. If it overwrites or appends to the header, the per-test IP trick does not work. The fallback is `test.describe.configure({ mode: "serial" })`, keeping the whole file within 3 reset requests per 60 s and 3 sign-ups per 10 s. Do not raise the limits for tests.

## Data and API Changes

- **Environment:** `SMTP_URL` (secret) and `EMAIL_FROM`. Both are server-only, optional, read at runtime, and set together or not at all.
- **Schema:** new tables `rate_limit` (Better Auth) and `email_rate_limit`. One additive migration.
- **Routes:** behavior changes to existing `/api/auth/*` routes, as listed in Slice 4. No new route files.
- **Public APIs:**
  - `@startup/email`, new. See Slice 2.
  - `@startup/auth` adds `setEmailFailureReporter`. `createAuth` stays internal to the package.
- **Local services:** Mailpit in `compose.yaml`.
- **CI:** a Mailpit service and two non-secret environment values in `e2e.yml`.

## Ownership

- Branch: `feat/transactional-email`, created from `main` after this plan and the spec amendments merge
- Worktree: `~/dev/worktrees/startup-template-transactional-email`
- Primary owner: one implementing agent, one slice at a time
- Expected files: the files listed in each slice
- Shared hotspots: `.env.example` (S1), `pnpm-lock.yaml` (S2, S4), `AGENTS.md` (S2), `packages/db/src/schema/*` and `packages/db/drizzle/*` (S3), and `compose.yaml` (S1, not on the hotspot list but shared by every worktree)
- Coordination notes: S3 must own schema changes exclusively. Run E2E (S4, S5) only while no other worktree is using port `3000`, Postgres, or Mailpit.

## Risks

- **Spoofed client IPs.** Per-client limits depend on the host's proxy headers. A directly exposed `next start` lets clients choose `x-forwarded-for`. The per-address limit and the deployment documentation are the mitigation.
- **Hosts without `after()`.** On a host that does not support `after()` or `waitUntil`, a send can be cut off after the response. The send is then lost silently, apart from the reporter, and reset still returns success. Documented as a host requirement.
- **Timing floor.** The 500 ms minimum hides the token write only while that write stays under 500 ms. A slow database can still show a difference. The floor does not cover `auth.api.*` calls made directly from server code, which attackers cannot time.
- **Database writes for every limited request.** Database-backed rate limiting adds a write to every limited auth request in production, including sign-in. It costs nothing extra, but it adds load to Postgres.
- **Verification links.** They stay valid for one hour and can be used more than once. Mail scanners that prefetch links can mark an address as verified.
- **Reset tokens are stored in plain text** in `verification.identifier`. Better Auth's default. Hashing them (`verification.storeIdentifier`) is possible hardening, outside this plan.
- **Sign-up still reveals existing accounts** (`422`). Outside the spec.
- **`next` peer dependency.** `@startup/auth` now takes `next` as a peer, which adds another version to keep aligned with `apps/web`.
- **Better Auth with PGlite.** Better Auth's Drizzle adapter resolves a sibling copy of `drizzle-orm` (see the billing doc's known limitations). It should work with a PGlite Drizzle instance at runtime. If it does not, test against the node-postgres driver in the E2E job instead, and report the change.
- **Rollout order.** Deploy the migration before Slice 4. With rate limiting enabled in production, a missing `rate_limit` table would break every limited auth endpoint.
- **Weak `EMAIL_FROM` validation.** A malformed display name may pass validation but be rejected by a provider. Delivery then fails with `EmailDeliveryError` (`rejected`).

## Verification

Per slice, as listed. The complete change finishes with:

```bash
pnpm db:up
pnpm db:migrate
pnpm verify
pnpm verify:full
pnpm build && grep -r "SMTP_URL" apps/web/.next/static   # no output
```

The build with both variables empty is proven by the Verify CI job, which has no `.env.local`. Locally, exporting empty values does not test this: Turbo's strict mode filters unlisted shell variables, and `next.config.ts` then loads them from `.env.local`.

Then go through the acceptance criteria in the spec one by one, including the documentation items.
