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

## Sessions

Server components, server actions, and route handlers read the session with `getSession()` from `@startup/auth/next`. It reads the current request's headers itself and returns the session (`user` and `session`) or `null`. It never redirects or throws: pages decide where a signed-out visitor goes, and route handlers return `401`. Do not call `auth.api.getSession` directly in applications.

The template ships the authentication API only. Products build the sign-in, sign-up, password reset, and verification pages.

## Email

`@startup/auth` sends password reset and verification messages through `@startup/email`. It never opens an SMTP connection itself. Email is configured when `SMTP_URL` and `EMAIL_FROM` are both set. See `email.md`.

| Route (under `/api/auth`)       | Behavior |
| ------------------------------- | -------- |
| `POST /request-password-reset`  | Emails a reset link when the address has an account. The response is the same for every address and takes at least 500 ms. `redirectTo` is the product page that receives the token. |
| `GET /reset-password/:token`    | The emailed link. Redirects to `redirectTo` with `?token=…`, or with `?error=INVALID_TOKEN` when the token is expired, used, or altered. |
| `POST /reset-password`          | Sets `newPassword` with `token`. The token works once and expires after one hour. Every session for the account ends. |
| `POST /sign-up/email`           | Also emails a verification link. Sign-up succeeds whether or not the email is sent. |
| `POST /send-verification-email` | Emails a new verification link. Requires a session (`401` otherwise). |
| `GET /verify-email`             | The emailed link. Marks the address as verified, then redirects to its `callbackURL`. |

### Sending

The send callbacks schedule the send and return at once. The message goes out through Next.js `after()`, so responses never wait for SMTP, and the time a reset request takes does not reveal whether the account exists. A failed send never changes a response. It is reported through `setEmailFailureReporter`, which `apps/web` connects to Sentry, with the `EmailError` only: never the link, token, recipient, or body.

### Verification

Verification is recorded, not enforced. Sign-in works for an unverified address. Product code reads `session.user.emailVerified` and decides what an unverified user may do.

Verification links are signed by Better Auth and stored nowhere. A link stays valid until it expires after one hour, even after it has been used, and requesting a new link does not invalidate earlier ones. Following a used link again only confirms an address that is already verified.

### Password Reset

Reset tokens are stored in the `verification` table, deleted when used, and expire after one hour. A second request sends a second link, and each works once. `revokeSessionsOnPasswordReset` ends every session for the account. Session cookie caching is off; enabling `session.cookieCache` would keep a revoked session valid until its cached copy expires.

The page that receives a reset token has the token in its URL. Keep it out of analytics capture. See `observability.md`.

### Redirects

Reset and verification links redirect only to the `BETTER_AUTH_URL` origin or a relative path. The template configures no `trustedOrigins`; leave `BETTER_AUTH_TRUSTED_ORIGINS` unset. Better Auth skips origin checks when `NODE_ENV` is `test`, so tests of redirects set `advanced.disableOriginCheck: false`.

Pages that send a visitor on after sign-in or sign-up take the target from a `redirect` query parameter and pass it through `safeRedirectPath` from `@startup/auth/redirect`. It follows only a path on the application's own origin, keeping its query and fragment, and falls back to `/account` without an error for anything else: absolute and protocol-relative URLs, backslashes, percent-encoded forms of these, control characters, and the sign-in and sign-up pages themselves. It runs in server and browser code.

### Rate Limits

| Limit      | Requests                                                         | Enforced by |
| ---------- | ---------------------------------------------------------------- | ----------- |
| Per client | 3 per 60 seconds per IP, for each endpoint that sends email      | Better Auth, `rate_limit` table |
| Per address | 3 per hour per address, for each endpoint that sends email, whether or not the account exists | `@startup/auth` hook, `email_rate_limit` table |

Both are enabled when `NODE_ENV` is `production`, including the E2E server, and both answer `429`. Better Auth's other default limits, such as sign-in and sign-up, use the same `rate_limit` table. See `deployment.md` for client IP configuration.

### When Email Is Not Configured

- Sign-up and sign-in work. No verification email is sent, and the server logs one warning per process, at the first sign-up.
- `POST /request-password-reset` and `POST /send-verification-email` return `503` with `{ "code": "EMAIL_NOT_AVAILABLE", "message": "Email is not available." }` for every address.

## Database

Authentication tables are defined in `@startup/db`.

The current auth schema includes:

- `user`
- `session`
- `account`
- `verification`
- `rate_limit` (Better Auth rate-limit counters)

Authentication schema changes must use the database migration workflow.

## Environment

Authentication uses server-only environment variables such as:

- `BETTER_AUTH_SECRET`
- `BETTER_AUTH_URL`
- `SMTP_URL` and `EMAIL_FROM`, through `@startup/email`

## Testing

`@startup/auth` tests run Better Auth's HTTP handler against in-memory PGlite with the repository migrations applied. They inject a recording email sender and run background work inline, and cannot open network connections.

Secrets must not be exposed through `NEXT_PUBLIC_*` variables.
