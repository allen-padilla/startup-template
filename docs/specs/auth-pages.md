# Authentication Pages

## Problem

The template ships the authentication API but no pages. After the Quick Start, nobody can sign up, sign in, reset a password, or verify an email address without calling the API by hand. The landing page's "Get Started" button goes nowhere.

Server code has no shared way to read the current session either. The billing checkout route calls `auth.api.getSession` inline, and every new page or route would repeat it.

## Goals

- A visitor can sign up, sign in, sign out, reset a forgotten password, and verify their email address through pages, using the existing `@startup/auth` API and client.
- A signed-in user has an account page that shows their email address and whether it is verified, lets them request a new verification link, and lets them sign out.
- Server components and route handlers read the session through one helper in `@startup/auth`.
- The pages are plain and work as a starting point that products restyle. Shared primitives live in `@startup/ui`.
- End-to-end tests cover the complete flows in a browser, including the email steps through Mailpit.

## Non-goals

- Social or OAuth sign-in, magic links, and one-time codes.
- Profile editing, including changing the name.
- Changing the email address or password while signed in.
- Account deletion.
- The billing portal, and any change to checkout's success and cancel URLs.
- Identifying users in PostHog on sign-in.
- A site header or navigation bar.
- Changes to the authentication API's behavior, configuration, or rate limits.
- Blocking anything for unverified addresses. Verification stays recorded, not enforced.

## Decisions

These are already decided. Change them here before planning, not during implementation.

| Decision                         | Choice                                                                                                                                                | Reason                                                                                                                                                           |
| -------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Name on sign-up                  | Required "Name" field                                                                                                                                 | The `user.name` column and Better Auth both require it, and profile editing is out of scope, so a derived name could not be corrected.                          |
| Sign-up with an existing address | Says the account already exists and links to sign-in and password reset                                                                               | The sign-up API already answers `422 USER_ALREADY_EXISTS`. Hiding it needs an auth configuration change (no auto sign-in, or required verification). See Security. |
| Redirect after sign-in           | `?redirect=` query parameter, default `/account`. Unsafe values fall back to the default without an error. Sign-up honors it the same way.            | One rule for every entry point. A silent fallback gives an attacker nothing to probe.                                                                           |
| Signed-in visitors               | `/sign-in` and `/sign-up` send them on to their redirect target. `/forgot-password` and `/reset-password` stay open.                                  | A signed-in user has nothing to do on the first two. A reset ends every session anyway.                                                                          |
| After a password reset           | `/sign-in` with a "password changed" message                                                                                                          | A reset ends every session for the account, so the user is signed out.                                                                                          |
| Verification outcome             | Carried through the sign-in redirect and shown on `/account` after sign-in. "Verified" is shown only when the address is actually verified.           | Sign-in after verification is off, so a link opened in another browser lands signed out. A query parameter alone must not claim a verification that did not happen. |
| Session helper                   | `getSession()` in the server-only `@startup/auth/next` entry point. It reads the request headers itself and returns the session or `null`.            | One call works in server components and route handlers. Callers decide what "no session" means: pages redirect, route handlers return `401`.                    |
| Protecting `/account`            | A server-side session check in the page, not middleware                                                                                               | The repository rules require authenticating server-side with Better Auth. A middleware cookie check is only a hint.                                             |
| Reset token handling             | Never reaches PostHog or Sentry, never sent in a `Referer` header, and removed from the address bar once read                                         | A reset token is a credential for the account until it is used or expires.                                                                                      |
| Passwords                        | Better Auth's defaults: 8 to 128 characters. One field on sign-up. New password and confirmation on reset.                                            | Matches the server. On reset there is no other check that the user typed what they meant.                                                                       |
| Sign-out                         | Resets analytics identity and goes to `/`                                                                                                             | `observability.md` requires resetting analytics identity on logout.                                                                                             |
| "Get Started"                    | A link to `/sign-up`, styled as a button                                                                                                              | Navigation is a link. `@startup/ui` provides button styling for links.                                                                                          |

## Behavior

### Common

- Every page is plain and uses `@startup/ui`. New shared primitives, such as inputs, labels, form messages, and button styling for links, are added to `packages/ui` and exported from its public API.
- Every input has a visible label. Errors and confirmations are shown as text on the page, next to the form, and are announced to assistive technology.
- A form's submit button is disabled while its request is in flight, so a double click sends one request.
- Browser form code uses `@startup/auth/client` only. It never imports server auth, database, or server-only environment modules.
- The auth pages link to each other: sign-in links to sign-up and to forgot-password, sign-up links to sign-in, and forgot-password and reset-password link back to sign-in. Links between sign-in and sign-up keep the `redirect` parameter.
- These messages apply on every page that sends a request:
  - `429` from rate limiting: "Too many requests. Please try again later."
  - `503 EMAIL_NOT_AVAILABLE`: "Email isn't available right now." This is the same for every address.
  - Any other failure: a generic "Something went wrong. Please try again." The page never shows raw server error details.

### Redirect Target

- `/sign-in` and `/sign-up` read an optional `redirect` query parameter.
- It is accepted only as a relative path on the application's own origin: it starts with a single `/`, and resolving it against the application's origin leaves the origin unchanged.
- Anything else falls back to `/account` without an error. That includes absolute URLs (`https://…`), protocol-relative URLs (`//host`), backslash forms (`/\host`, `\\host`), percent-encoded forms of these, values without a leading `/`, `javascript:` and other schemes, and values containing control characters.
- A target that is itself `/sign-in` or `/sign-up` also falls back to `/account`, so redirects cannot loop.
- The path, query, and fragment of an accepted target are kept.

### Sign-Up (`/sign-up`)

- The fields are Name, Email, and Password. All three are required. The page states the password length rule (8 to 128 characters).
- A successful sign-up signs the user in, as the API does today, and goes to the redirect target.
- Sign-up sends a verification email when email is configured. The link in it lands on `/account` (see Verification Links).
- An address that already has an account shows "An account with this email already exists." with links to sign in and to reset the password.
- A password outside the length rule shows the rule. Nothing is created.
- A signed-in visitor is sent to the redirect target instead of seeing the form.

### Sign-In (`/sign-in`)

- The fields are Email and Password.
- A successful sign-in goes to the redirect target.
- Any failed sign-in for credentials, whether the address is unknown or the password is wrong, shows "Invalid email or password."
- An unverified address signs in normally.
- A signed-in visitor is sent to the redirect target instead of seeing the form.
- After a password reset, the page shows "Your password has been changed. Sign in with your new password."

### Forgot Password (`/forgot-password`)

- The field is Email.
- Submitting a valid address always shows the same message, whether or not an account exists: "If an account exists for that address, we've sent a link to reset your password. The link expires in one hour."
- The request asks for the reset link to land on `/reset-password`.
- The page behaves the same for signed-in and signed-out visitors.

### Reset Password (`/reset-password`)

- The page receives the token from the reset email's link as `?token=…`.
- Once the page has read the token, it removes the token from the address bar and the browser history entry. The token stays in memory for the submit.
- The fields are New password and Confirm new password. If they differ, the page says so and sends nothing.
- A successful reset goes to `/sign-in` with the "password changed" message. Every session for the account has ended, including the one in this browser, if there was one.
- The page shows "This reset link is invalid or has expired." with a link to `/forgot-password` when:
  - the URL has `?error=INVALID_TOKEN`
  - the URL has no token
  - the server rejects the token on submit because it is expired, already used, or altered
- The page behaves the same for signed-in and signed-out visitors.

### Account (`/account`)

- The page is protected. A signed-out visitor is redirected to `/sign-in?redirect=` with the account page's full path and query, so a verification outcome survives the sign-in.
- The session is checked on the server on every request. The page is never prerendered or cached across requests.
- The page shows:
  - the email address
  - whether it is verified
  - when it is not verified, a "Resend verification email" action
  - a "Sign out" button
- Resend sends a new verification link whose destination is `/account`. On success, the page says "Verification email sent. Check your inbox." The action is not shown once the address is verified.

### Verification Links

- Verification emails sent on sign-up and on resend link to the authentication API, which redirects to `/account`. The redirect tells `/account` that the visitor arrived from a verification link.
- When the visitor arrives from a successful verification link and the address is verified, the page shows "Your email address has been verified."
- If the address is not actually verified, the page shows no confirmation, whatever the URL says.
- When the API reports a failure (`TOKEN_EXPIRED`, `INVALID_TOKEN`, `INVALID_USER`, or any other error), the page shows "This verification link is invalid or has expired." The resend action appears if the address is still unverified.
- A visitor who is signed out when they follow the link is sent to `/sign-in` first. After signing in, they land on `/account` with the same outcome message.
- Following a used, unexpired link again shows the confirmation. This matches the API, where such links stay valid until they expire.

### Sign-Out

- "Sign out" ends the session, resets analytics identity (a no-op when PostHog is not configured), and goes to `/`.
- Visiting `/account` afterwards redirects to `/sign-in`.

### Session Helper

- `@startup/auth/next` exports `getSession()`. It is server-only, reads the current request's headers itself, and returns the Better Auth session (user and session) or `null`.
- It works in server components, server actions, and route handlers. It does not redirect or throw for a missing session.
- `/account`, the signed-in checks on `/sign-in` and `/sign-up`, and the billing checkout route use it. After this change, no code in `apps/web` calls `auth.api.getSession` directly.
- The checkout route's behavior is unchanged: `401` JSON without a session, and the same responses otherwise.

### Landing Page

- "Get Started" is a link to `/sign-up`, styled as a primary button. A signed-in visitor who follows it lands on `/account` (see Sign-Up).

## Edge Cases

- **Reloading `/reset-password` after the token was removed from the address bar.** The page shows the invalid-link message. The emailed link still works if the reset was not completed.
- **Two reset emails.** Each link works once. Using one does not invalidate the other until it is used or expires.
- **Resetting while signed in.** The reset succeeds, every session ends, and the user signs in again on `/sign-in`.
- **A verification link for a different account than the one signed in.** The API reports `INVALID_USER`, and `/account` shows the invalid-link message for the signed-in account.
- **A verification link followed after the address is already verified.** The confirmation is shown.
- **A crafted `/account` URL that claims verification.** No confirmation is shown unless the address is verified.
- **Email not configured.** Sign-up and sign-in work, and no verification email is sent. `/forgot-password` and the resend action show "Email isn't available right now." for every address.
- **Rate limits.** The per-address limit counts requests for unknown addresses too, so a `429` on `/forgot-password` does not reveal whether an account exists.
- **Nested redirects**, such as `/sign-in?redirect=/sign-in?redirect=…`. Auth-page targets fall back to `/account`, so there is no loop.
- **A session revoked elsewhere**, for example by a password reset in another browser. The next request to `/account` redirects to `/sign-in`.
- **JavaScript disabled.** Not supported. The forms need the browser auth client.

## Security and Privacy

- **Account enumeration.**
  - `/forgot-password` shows the same message, and the request returns the same status and body, for every address. Response timing is already handled by the API.
  - Sign-in failures use one message.
  - Resend requires a session.
  - Known gap: sign-up reveals that an address has an account, as the sign-up API already does. Closing it means turning off auto sign-in after sign-up or requiring verification, which is a product decision outside this spec.
- **Redirects.** Only same-origin relative paths are followed after sign-in and sign-up (see Redirect Target). Reset and verification links keep the API's existing origin rules.
- **Reset token.**
  - It never reaches PostHog: no pageview, autocapture, or other event from `/reset-password` contains it.
  - It never reaches Sentry, from the browser or the server: not in URLs, breadcrumbs, transaction names, or error reports.
  - `/reset-password` is served with `Referrer-Policy: no-referrer`.
  - The token is removed from the address bar once read.
  - The token is never logged.
- **Session checks.** Protected pages and routes check the session on the server through `getSession()`. Client-side state never grants access. Browser code never sees server auth, database, or secret-bearing modules.
- **Analytics.** Form values, including email addresses, names, and passwords, are never sent to PostHog or Sentry. Sign-out resets analytics identity.
- **Cross-site requests.** The pages call the API from the application's own origin, and Better Auth's origin check stays enabled.

## Acceptance Criteria

### End to End

Browser tests in `tests/e2e/` against the production-mode E2E server. Email steps read delivered messages from Mailpit through `tests/e2e/support/mailpit.ts`. Each test uses its own address and its own `x-forwarded-for` client IP. Rate limits are not raised.

- [ ] The landing page's "Get Started" link opens `/sign-up`.
- [ ] Sign-up through `/sign-up` with a name, email, and password lands on `/account`. The page shows the address, shows it as not verified, and offers "Resend verification email".
- [ ] Verification, same browser: after sign-up, the test reads the verification message from Mailpit and opens its link in the browser. It lands on `/account`, which shows the confirmation and the address as verified, with no resend action.
- [ ] Verification, signed out: the test opens the link from Mailpit in a new browser context with no session. It is redirected to `/sign-in`, signs in, and lands on `/account` with the confirmation and the address verified.
- [ ] Resend: clicking "Resend verification email" on `/account` shows the sent message, and a second verification message arrives in Mailpit. Following the newer link verifies the address.
- [ ] An invalid verification link (an altered token) lands on `/account` with the invalid-link message and the resend action.
- [ ] Password reset:
  - A user signs up in one browser context. In a second context, the test submits their address on `/forgot-password` and sees the generic message.
  - The test reads the reset message from Mailpit and opens its link. It lands on `/reset-password`, and the address bar no longer contains the token.
  - Setting a new password goes to `/sign-in` with the "password changed" message.
  - Signing in with the new password lands on `/account`. The old password shows "Invalid email or password."
  - In the first context, the session created at sign-up has ended, and `/account` redirects to `/sign-in`.
- [ ] Reopening a reset link that was already used shows the invalid-link message with a link to `/forgot-password`.
- [ ] Mismatched new and confirm passwords on `/reset-password` show an error, and the password is unchanged.
- [ ] `/forgot-password` for an address without an account shows exactly the same message as for an existing account, and no message to that address arrives in Mailpit once the known address's message has arrived.
- [ ] A signed-out visit to `/account` redirects to `/sign-in?redirect=%2Faccount`. Signing in returns to `/account`.
- [ ] Unsafe redirect targets on `/sign-in` land on `/account` after sign-in. The cases are `https://example.com`, `//example.com`, `/\example.com`, and a percent-encoded `//example.com`. A safe target such as `/account?x=1` is followed.
- [ ] A signed-in visit to `/sign-in` or `/sign-up` goes to `/account`.
- [ ] Sign-up with an address that already has an account shows the "already exists" message with links to sign in and reset the password.
- [ ] Sign-in with a wrong password and sign-in with an unknown address show the same message.
- [ ] "Sign out" on `/account` lands on `/`, and `/account` then redirects to `/sign-in`.
- [ ] The `/reset-password` response has `Referrer-Policy: no-referrer`.
- [ ] Unauthenticated checkout still returns `401` (the existing billing test passes unchanged).
- [ ] `home.spec.ts` checks for a "Get Started" link instead of a button. The existing API-level tests in `email.spec.ts` are kept and pass.

### Other Tests and Checks

- [ ] A test shows that loading `/reset-password?token=…` with PostHog and Sentry configured sends no request to either service that contains the token.
- [ ] Unit tests cover the redirect check: every unsafe form listed under Redirect Target is rejected, and safe relative paths are accepted with their query and fragment.
- [ ] With `SMTP_URL` and `EMAIL_FROM` empty, sign-up and sign-in work through the pages, and `/forgot-password` and the resend action show "Email isn't available right now."
- [ ] No module in `apps/web` calls `auth.api.getSession`. The checkout route uses `getSession()` from `@startup/auth/next`.
- [ ] No client component imports `@startup/auth`, `@startup/auth/next`, `@startup/db`, `@startup/email`, or `@startup/env`.
- [ ] New UI primitives live in `packages/ui` and are imported from `@startup/ui`.
- [ ] `pnpm verify` and `pnpm verify:full` pass.

### Documentation

- [ ] `docs/architecture/authentication.md` describes the pages, the redirect rule, and `getSession()`, and no longer says the template ships the API only.
- [ ] `docs/architecture/package-boundaries.md` lists `getSession()` among the `@startup/auth/next` exports.
- [ ] `docs/architecture/observability.md` says how `/reset-password` is kept out of PostHog and Sentry.
- [ ] `docs/architecture/testing.md` lists the new end-to-end coverage.
- [ ] `.agents/rules/repository.md` and the `add-api-route` skill tell agents to authenticate with `getSession()`.
- [ ] `README.md`'s example slice plan no longer lists the sign-up, sign-in, and sign-out pages as work to do.
- [ ] `pnpm agent:check` passes.
