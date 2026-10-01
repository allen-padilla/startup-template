# Email

## Purpose

`@startup/email` sends transactional email: one message to one recipient, with a subject, an HTML body, and a plain-text body. Authentication sends password reset and verification messages through it, and products add their own messages, such as receipts, invitations, and digests.

Marketing email, contact lists, unsubscribe management, receiving email, and bounce or complaint webhooks are out of scope.

## Boundaries

`@startup/email` is the only code that opens an SMTP connection or imports a mail library. It owns the `nodemailer` dependency.

- It is server-only. It depends on `@startup/env`.
- Client components must not import it.
- The transport is SMTP only. Every hosted provider and self-hosted relay accepts SMTP, so changing provider is a configuration change. There are no provider-specific HTTP APIs and no provider registry.

## Configuration

| Variable     | Purpose                                                             |
| ------------ | ------------------------------------------------------------------- |
| `SMTP_URL`   | SMTP connection string, including any credentials. Secret.          |
| `EMAIL_FROM` | Sender: `no-reply@example.com` or `Product Name <no-reply@example.com>` |

Both are server-only, validated by `@startup/env`, and optional:

- When both are empty, email is disabled.
- Setting only one fails validation, so the application does not start. The error names the missing variable and never a value.
- A non-empty value must be valid. `SMTP_URL` must be an `smtp://` or `smtps://` URL with a host. `EMAIL_FROM` must be an address or a display name and an address, with no line breaks. Quote a display name that contains special characters such as a comma: `"Startup, Inc." <no-reply@example.com>`.

Neither variable is read at build time, so neither is listed in `turbo.json`.

`.env.example` points both at the local mail catcher, so the Quick Start sends working email without edits. Replace both before deploying: a deployment that still points at `smtp://localhost:1025` fails every send with a delivery error.

### Connection Strings

Use `smtps://` for implicit TLS (usually port `465`) and `smtp://` for a plain connection that upgrades with STARTTLS when the server offers it (usually port `587`).

Percent-encode reserved characters in the username and password. For example, `@` becomes `%40`, `:` becomes `%3A`, and `/` becomes `%2F`:

```text
smtps://user%40example.com:p%40ss%3Aword@smtp.example.com:465
```

Examples, with placeholder credentials:

| Provider                | `SMTP_URL`                                                                       |
| ----------------------- | -------------------------------------------------------------------------------- |
| Hosted provider         | `smtps://<username>:<api-key>@smtp.<provider>.com:465`                           |
| Amazon SES              | `smtp://<smtp-username>:<smtp-password>@email-smtp.<region>.amazonaws.com:587`  |
| Self-hosted relay       | `smtp://relay.internal.example.com:25`, with credentials if the relay needs them |
| Local Mailpit (default) | `smtp://localhost:1025`                                                          |

Amazon SES uses SMTP credentials generated in the SES console, not an AWS access key. Its password must be percent-encoded like any other.

The sender's domain must be verified with the provider, with SPF and DKIM records (and DMARC), or providers reject or junk the messages. See `docs/template-checklist.md`.

## Local Development

`compose.yaml` runs Mailpit, a mail catcher, next to PostgreSQL. `pnpm db:up` starts both.

- SMTP: `localhost:1025`
- Web interface and API: <http://localhost:8025>

Every message sent locally is captured there and nothing leaves the machine. Mailpit has no authentication. It is for local development and CI only, never production.

If port `1025` or `8025` is already in use, `pnpm db:up` fails with `port is already allocated`. Stop the other mail catcher, or find the process with `ss -ltnp`.

## Sending

```ts
import { sendEmail } from "@startup/email";

await sendEmail({ to, subject, html, text });
```

- `sendEmail` uses `SMTP_URL` and `EMAIL_FROM`. `createEmailSender({ smtpUrl, from, timeoutMs, transport })` creates a sender with explicit values or an injected transport.
- `isEmailConfigured()` reports whether both variables are set.
- A send resolves when the SMTP server accepts the message.
- Each send opens its own connection, so nothing is pooled across serverless invocations.
- Every send has a time limit, 10 seconds by default, covering DNS, connecting, and the SMTP conversation.
- Nothing is retried. Whether and when to retry is the caller's decision. A later jobs package can move sends onto a queue without changing templates or callers' messages.

The recipient must be a single address and the subject must not contain line breaks. Invalid messages are rejected before anything is sent.

## Adding a Message

A product adds a message without changing `@startup/auth`:

1. Add a template in `packages/email/src/templates/`, typed as `EmailTemplate<Input>`. It returns the subject and both bodies.
2. Build the HTML body with the `html` tagged template. It escapes every interpolated value, so user-supplied text such as names cannot inject markup. Use `assertHttpUrl` for links.
3. Write the plain-text body with the same content.
4. Export the template from `packages/email/src/index.ts`.
5. Add tests next to the template: both bodies are present, the link appears in both, and user values are escaped.
6. Call it from the owning server code:

   ```ts
   import { inviteEmail, sendEmail } from "@startup/email";

   await sendEmail({ to: invitee.email, ...inviteEmail({ inviter: user.name, url }) });
   ```

Product copy uses `productName` from `src/templates/brand.ts`.

## Failures

Every error extends `EmailError`. Messages never contain the connection string, credentials, the recipient, the subject, or message bodies. Errors have no `cause`, so the underlying transport error, which can contain server responses, never reaches logs or Sentry.

| Error                     | Cause                                                                                   |
| ------------------------- | --------------------------------------------------------------------------------------- |
| `EmailConfigurationError` | sending while a variable is not set. `variables` names them.                            |
| `EmailValidationError`    | an invalid recipient, a line break in the recipient or subject, or an empty body. `field` names it. |
| `EmailDeliveryError`      | `reason` is `timeout`, `connection`, `authentication`, `rejected`, or `unknown`, with `smtpCode` when the server sent one. |

Never log or report message bodies, links, or tokens.

## Testing

`@startup/email` tests never open a network connection:

- Tests inject a transport: a fake, or nodemailer's `streamTransport`, which builds the MIME message in memory.
- `src/testing/no-network.ts` runs before every test and makes `net.connect`, `tls.connect`, `net.Socket.prototype.connect`, and `fetch` fail the test.
- Both variables are empty in `packages/email/vitest.config.ts`.

End-to-end tests read delivered messages from Mailpit. See `testing.md`.
