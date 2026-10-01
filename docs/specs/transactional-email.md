# Transactional Email

## Problem

The template signs users up with an email address and a password, but it cannot send email.

- A user who forgets their password has no way back into their account.
- Nothing confirms that an email address belongs to the person who entered it.
- Products built from the template have no shared way to send their own messages, such as receipts, invitations, and digests.

## Goals

- Password reset by email works end to end.
- New accounts receive an email verification link.
- One package, `@startup/email`, is the only way the repository sends email. Products add their own messages through it.
- Email works in local development with no external account, the same way the database does.
- Any provider, hosted or self-hosted, can be used in production by changing configuration only.
- The default setup costs nothing.

## Non-goals

- Sign-in, sign-up, password reset, or verification pages. The template keeps shipping the authentication API only, and products build the pages.
- Background delivery, queues, and automatic retries. These arrive with a later jobs package. Nothing in this change may prevent moving sends onto a queue later.
- Marketing email, contact lists, unsubscribe management, and campaign analytics.
- Receiving email, and bounce or complaint webhooks.
- Provider-specific HTTP APIs, and any provider registry or driver abstraction.
- Changing an account's email address, "your password was changed" notices, magic links, and one-time codes.
- Blocking sign-in until an address is verified. See Decisions.

## Decisions

These are already decided. Change them here before planning, not during implementation.

| Decision                | Choice                                                                                                              | Reason                                                                                                                                       |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Transport               | SMTP only                                                                                                           | Every hosted provider and every self-hosted relay accepts SMTP, so switching provider is configuration.                                      |
| Configuration           | Optional, with a working local default in `.env.example`. Setting only one of the two variables fails validation.   | Matches billing and decision models: optional until used, and `pnpm verify` needs no mail server. A half-configured deployment fails early. |
| Email verification      | Sent on sign-up, not enforced at sign-in                                                                            | Enforcement is a product decision. The template records the state and lets products act on it.                                               |
| Verification resend     | Only a signed-in user can request a new verification link                                                           | An address-only resend endpoint can reveal which addresses have accounts. Sign-in is not blocked, so every user can still request one.      |
| Verification link reuse | A verification link stays valid until it expires, even after it has been used                                      | Better Auth verification links are signed and stateless. Following one again only confirms an address that is already verified.             |
| Delivery                | The send starts during the request and finishes after the response, within the request's lifetime (Next.js `after()`), with no retry | The template has no job queue yet. Waiting for SMTP before responding would reveal through timing whether an account exists.                 |
| Sessions after a reset  | A successful password reset ends every session for the account                                                      | A reset usually means the old password, or a session, may be in someone else's hands.                                                        |
| Rate-limit storage      | PostgreSQL, through the database migration workflow                                                                 | Limits must hold across serverless instances, and the default setup costs nothing. No Redis.                                                 |

## Behavior

### Configuration

- Two server-only variables configure email:
  - `SMTP_URL`: the SMTP connection string, including any credentials. Secret.
  - `EMAIL_FROM`: the sender, such as `Startup Template <no-reply@example.com>`.
- Both are optional. When both are empty, email is disabled.
- Setting one without the other fails environment validation, so the application does not start. The error names the missing variable and never a value.
- A non-empty value that is not valid fails validation, like every other variable.
- `.env.example` ships values that point at the local mail catcher, so the Quick Start produces working email without any edits.
- Neither variable is read at build time.

### Local Development

- The local services include a mail catcher (Mailpit). Every message sent locally is captured there and can be read in a browser. Nothing leaves the machine.
- Starting the local services starts the mail catcher together with the database. `pnpm db:up` and `pnpm db:down` keep their names and start and stop both.

### Sending

- `@startup/email` is server-only. It sends one message to one recipient, with a subject, an HTML body, and a plain-text body.
- Every message has both an HTML body and a plain-text body.
- Message templates live in the package, take typed inputs, and can be tested without a network connection.
- A product adds a new message by adding a template and calling the package. It does not change `@startup/auth`.
- Sending while email is not configured raises a typed configuration error. The error names the missing variables and never a value.
- A failed or timed-out delivery raises a typed error. The package waits a bounded time and does not retry.

### Password Reset

- A reset request for an address that has an account sends one email containing a reset link.
- The link works once and expires after one hour.
- Following the link lets the user set a new password through the existing authentication API.
- After a successful reset, the new password signs in, the old password does not, and every existing session for the account is ended.
- A reset request for an address without an account sends nothing and returns the same response.

### Email Verification

- Signing up sends a verification email. Sign-up succeeds whether or not the email could be sent.
- Following the link marks the address as verified.
- The link expires after one hour. Until then it stays valid: following it again after verification succeeds, and requesting a new link does not invalidate earlier ones.
- A signed-in user can request a new link. A request without a session is rejected.
- Sign-in is not blocked for an unverified address. The verification state is available to product code, which may enforce it.

### When Email Is Not Configured

- Sign-up and sign-in work unchanged. No verification email is sent, and the server logs one warning per process, at the first sign-up.
- Password reset and verification requests return a "not available" error for every address, whether or not an account exists. This follows the billing endpoints, which return `503` until Stripe is configured.

## Edge Cases

- **Delivery fails during a reset request.** The response is the same as a successful one. The failure is reported to error monitoring without the link or token.
- **A reset link is expired, already used, or altered.** It is rejected with a generic error that reveals nothing about the account.
- **A verification link is expired or altered.** It is rejected with a generic error. A verification link that was already used still succeeds until it expires. See Decisions.
- **A second reset request.** A second email is sent. Each link still works only once.
- **Credentials with reserved URL characters.** They must be percent-encoded in `SMTP_URL`. The documentation says so.
- **The mail catcher's ports are already in use.** The documentation covers this the same way it covers port `5432`.
- **Line breaks in a recipient address or subject.** The message is rejected before anything is sent.
- **A deployment still pointing at the local default.** Sending fails with a delivery error. The deployment documentation lists both variables as values that must change.

## Security and Privacy

- **No account enumeration.** Reset and verification requests return the same status and body whether or not the account exists. The time a request takes must not reveal it either. The response never waits for delivery (see Delivery in Decisions), and a reset request always takes at least a fixed minimum time. The host must support Next.js `after()`, as Vercel and `next start` do. On a host that cuts off work after the response, a send can be lost.
- **Rate limiting.** Requests that send email are limited per client and per address, and the limits are enforced in production through PostgreSQL, because in-memory limits do not hold across serverless instances:
  - per client: 3 requests per 60 seconds per IP address, for each endpoint
  - per address: 3 requests per hour per address, for each endpoint, counted the same way whether or not the account exists. The address is stored only as a keyed hash.

  Per-client limits depend on the host forwarding a trustworthy client IP. The deployment documentation says how to configure it.
- **Redirects.** Reset and verification links only ever redirect to the application's own origin.
- **Tokens.** Tokens and links are never logged and never sent to Sentry or PostHog. The documentation tells products to keep the page that receives a reset token out of analytics capture, because the token is in its URL.
- **Secrets.** `SMTP_URL` is server-only, never uses the `NEXT_PUBLIC_` prefix, and never appears in the browser bundle, in logs, or in error messages. Errors and logs also never contain message bodies.
- **Content.** User-supplied values are escaped before they are placed in a message body.
- **Boundaries.** `@startup/email` is the only code that opens an SMTP connection or imports a mail library. `@startup/auth` sends its messages through it.
- **Mail catcher.** It has no authentication. It is for local development and CI only, never production.

## Acceptance Criteria

- [ ] After the Quick Start with the values from `.env.example`, a password reset request for an existing account delivers a message to the local mail catcher.
- [ ] An end-to-end test signs up, requests a reset, reads the message from the mail catcher, follows the link, sets a new password, and signs in with it. The old password is rejected.
- [ ] A session created before the reset is no longer valid after it.
- [ ] An end-to-end test shows that sign-up delivers a verification message and that following its link marks the address as verified.
- [ ] A reset request for an unknown address returns the same status and body as one for a known address, and delivers no message.
- [ ] A request for a new verification link without a session is rejected.
- [ ] Setting only one of `SMTP_URL` and `EMAIL_FROM` fails environment validation.
- [ ] With `SMTP_URL` and `EMAIL_FROM` empty, the application builds and starts, sign-up and sign-in work, and a reset request returns the "not available" error.
- [ ] `pnpm verify` passes with both variables empty. Unit tests never open a network connection.
- [ ] Unit tests cover the templates (both bodies, and escaping), the configuration error, the delivery error, and that no error message contains the connection string.
- [ ] Searching the built browser output for `SMTP_URL` returns nothing.
- [ ] The E2E workflow runs the mail catcher as a service. Both CI workflows still pass without repository secrets.
- [ ] A new `docs/architecture/email.md` covers configuration, how to add a message, and connection examples for a hosted provider, Amazon SES, and a self-hosted relay.
- [ ] `README.md`, `AGENTS.md`, `.env.example`, and the architecture documents for authentication, package boundaries, deployment, testing, and continuous integration describe email.
- [ ] `docs/template-checklist.md` lists the sender address under the values to replace, and sender domain verification (SPF and DKIM) under the items to configure before production.
- [ ] `pnpm agent:check` passes.
