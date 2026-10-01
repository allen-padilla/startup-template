# Authentication Pages

## Goal

Implement `docs/specs/auth-pages.md`:

- `/sign-up`, `/sign-in`, `/forgot-password`, `/reset-password`, and a protected `/account` page, built on `@startup/auth/client`
- `getSession()` in `@startup/auth/next`, used by pages and by the billing checkout route
- a same-origin redirect rule for `?redirect=`, shared by server and browser code
- the reset token kept out of PostHog, Sentry, and `Referer`
- "Get Started" linking to `/sign-up`, and new form primitives in `@startup/ui`
- browser end-to-end tests, using Mailpit for reset and verification

The work is split into slices. Each slice passes `pnpm verify` on its own. Slices 3 and 4 also pass `pnpm verify:full`.

## Better Auth 1.7.6 Compared With the Spec

Checked against the installed source in `better-auth/dist`.

| Spec behavior | Better Auth 1.7.6 | Plan |
| --- | --- | --- |
| Sign-up with an existing address says so | `POST /sign-up/email` returns `422` with code `USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL`, because auto sign-in is on. The spec's Decisions table says `USER_ALREADY_EXISTS`. | Map the actual code. The spec is corrected (Slice 0). |
| Failed sign-in shows one message | Unknown address and wrong password both return `401 INVALID_EMAIL_OR_PASSWORD`. | Met. |
| Password length rule | `PASSWORD_TOO_SHORT` and `PASSWORD_TOO_LONG` (`400`). Defaults 8 and 128. | Map both to the stated rule. Also set `minLength` and `maxLength` on the inputs. |
| Reset with a bad token | `POST /reset-password` returns `400 INVALID_TOKEN`. The emailed link redirects with `?error=INVALID_TOKEN`. | Met. |
| Verification outcome on `/account` | Success redirects to `callbackURL` unchanged. Failure appends `error=<code>` to `callbackURL`, keeping its existing query. The codes are `TOKEN_EXPIRED`, `INVALID_TOKEN`, and `USER_NOT_FOUND`. A link for an address that is already verified redirects as a success. | Sign-up and resend use `callbackURL: "/account?verified=1"`. `/account` shows the error message when `error` is present. It shows the confirmation when `verified=1` is present and the address is actually verified. |
| `INVALID_USER` when the link is for another account | Only the change-email flow checks the signed-in user. A normal verification link verifies its own address whoever is signed in, then redirects to `callbackURL` as a success. | The signed-in user's `/account` shows their own state. It shows no confirmation unless their own address is verified. The spec's edge case is corrected (Slice 0). |
| Browser requests are origin-checked | Requests that carry a cookie, and sign-in and sign-up requests that carry Fetch Metadata headers, must send an `Origin` that matches `BETTER_AUTH_URL`. Otherwise they get `403 INVALID_ORIGIN` or `MISSING_OR_NULL_ORIGIN`. | The pages run on the application's origin, so this holds in development and production. Local E2E is the exception: Playwright uses `127.0.0.1:3000`, but `.env.example` sets `http://localhost:3000`. See Slice 4. |
| `callbackURL` and `redirectTo` | Relative paths and the `BETTER_AUTH_URL` origin are accepted. | Pages pass only fixed relative paths. |

## Existing System

- **`@startup/auth`:** has three entry points. `.` exports the server `auth` instance. `./client` exports `authClient = createAuthClient()` from `better-auth/react`. `./next` exports `authHandler`. `./redact` was added by #21 and exports `scrubAuthTokens`. The client calls routes by name: `signUp.email`, `signIn.email`, `requestPasswordReset`, `resetPassword`, `sendVerificationEmail`, and `signOut`. Each returns `{ data, error }`, and `error` has `status`, `code`, and `message`.
- **`apps/web`:**
  - The only page is the landing page, whose "Get Started" is a `<Button>` with no action.
  - `api/billing/checkout/route.ts` calls `auth.api.getSession({ headers: request.headers })`.
  - `instrumentation-client.ts` starts Sentry, and starts PostHog when both `NEXT_PUBLIC_POSTHOG_*` values are set.
  - `next.config.ts` sets no headers.
  - There are no unit tests in `apps/web`.
- **Next.js 16.3:** `searchParams` and `headers()` are async. The installed docs are in `apps/web/node_modules/next/dist/docs/`. Read the relevant pages there before writing pages, redirects, or `next.config.ts` headers. Behavior may differ from older versions.
- **`@startup/ui`:** exports `Button` only, built with `cva`. Its tests run in Vitest without a DOM. `apps/web/src/app/globals.css` already scans `packages/ui/src` for Tailwind classes.
- **PostHog:** `posthog-js` 1.434 supports `before_send`, which can modify or drop each event. With `defaults: "2026-05-30"`, pageviews are captured on load and on history changes.
- **Sentry:** query parameters whose names contain `token` are always filtered. `scrubAuthTokens` also runs on every error and span, since #21.
- **E2E:**
  - `pnpm test:e2e` builds with a Sentry DSN pointing at `tests/e2e/support/sentry-stub.ts` on `127.0.0.1:9999`, which Playwright starts with the app.
  - Mailpit helpers are in `tests/e2e/support/mailpit.ts`.
  - The helpers for a unique address and client IP are private to `email.spec.ts`.
  - CI sets `BETTER_AUTH_URL=http://127.0.0.1:3000`.

## Slices

### Slice 0: Amend the Spec (done)

Corrected two statements in `docs/specs/auth-pages.md` that did not match Better Auth 1.7.6, with the spec owner's approval:

- Decisions, "Sign-up with an existing address": the API answers `422 USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL`.
- Verification Links and Edge Cases: a normal verification link never returns `INVALID_USER`. A link for another account verifies that account's address, and `/account` shows the signed-in account's own state, with no confirmation unless that address is verified. List the error codes as `TOKEN_EXPIRED`, `INVALID_TOKEN`, and `USER_NOT_FOUND`, all shown as the invalid-link message.

### Slice 1: Session Helper and Redirect Rule in `@startup/auth`

**`packages/auth/src/next.ts`**
- Add `getSession()`. It awaits `headers()` from `next/headers` and returns `auth.api.getSession({ headers })`, the session or `null`.
- Wrap it in React's `cache` so a layout and a page in the same request share one lookup.
- Export `type Session = NonNullable<Awaited<ReturnType<typeof getSession>>>`.
- It never redirects or throws for a missing session.

**`packages/auth/src/redirect.ts`, new browser-safe entry point `@startup/auth/redirect`**
- Add `safeRedirectPath(value: string | null | undefined, fallback = "/account"): string`.
- Accept `value` only when all of these hold:
  - It is a string that starts with exactly one `/`.
  - It contains no `\` and no control characters, checked on both the raw value and its decoded form. A value that does not decode falls back.
  - Resolving it against a fixed base origin keeps that origin.
  - Its pathname is not `/sign-in` or `/sign-up`.
- Return the resolved pathname, search, and hash, or `fallback` otherwise.
- Like `redact.ts`, it has no imports.
- Add the entry to `packages/auth/package.json` `exports`.

**`apps/web/src/app/api/billing/checkout/route.ts`**
- Use `getSession()`. Behavior is unchanged.

**Documentation**
- `.agents/rules/repository.md` and `.agents/skills/add-api-route/SKILL.md`: authenticate with `getSession()` from `@startup/auth/next`, and never trust client-asserted identity.
- `docs/architecture/package-boundaries.md`: the new `./next` export and the `./redirect` entry.
- `docs/architecture/authentication.md`: `getSession()`, and the redirect rule under Redirects.

**Tests**
- `packages/auth/src/redirect.test.ts` covers every unsafe form in the spec's Redirect Target section:
  - `https://…`, `//host`, `/\host`, `\\host`
  - percent-encoded `//` and `\`
  - no leading `/`, `javascript:`, control characters, and malformed percent-encoding
  - `/sign-in` and `/sign-up`, with and without a query
  - empty and missing values
- It also covers safe paths, which keep their query and fragment.
- `getSession()` is not unit-tested, because it needs a Next.js request scope. Slice 4's E2E tests cover it through `/account` and checkout.

### Slice 2: Form Primitives in `@startup/ui`

`packages/ui/src/components/`, exported from `src/index.ts`:

- `input.tsx`: `Input`, a styled `<input>` that forwards all attributes. It sets `aria-invalid` styling.
- `label.tsx`: `Label`, a styled `<label>`.
- `form-message.tsx`: `FormMessage` with `tone: "error" | "success" | "info"`.
  - Errors render with `role="alert"`, and the others with `role="status"`, so messages are announced.
  - It renders nothing for empty children.
- `button.tsx`: also export `buttonVariants`, so a Next.js `Link` can be styled as a button.

Plain styling that matches `Button`. Tests render each component with `react-dom/server` (`renderToStaticMarkup`) and check the roles and the forwarded attributes. No new dependencies.

### Slice 3: Pages

All under `apps/web/src/app/`. Each page is a server component that reads `searchParams` and the session, and renders a client form component (`"use client"`) that calls `authClient`. Client components import only `@startup/auth/client`, `@startup/auth/redirect`, `@startup/ui`, and `posthog-js`.

**Shared code: `apps/web/src/lib/auth.ts`**
- Constants: `VERIFY_CALLBACK = "/account?verified=1"`, the `/sign-in?password=changed` notice URL, and the password limits.
- `authErrorMessage(error)` maps a client error to the spec's copy:
  - `429`: too many requests.
  - `EMAIL_NOT_AVAILABLE`: email unavailable.
  - `INVALID_EMAIL_OR_PASSWORD`: invalid credentials.
  - `USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL`: already exists.
  - `PASSWORD_TOO_SHORT` and `PASSWORD_TOO_LONG`: the length rule.
  - Anything else: the generic message.
- It never shows `error.message` from the server.

**Shared layout: `apps/web/src/app/(auth)/layout.tsx`**
- A route group for the four signed-out pages.
- It gives them one centered column. The group keeps the URLs unchanged.

**Form behavior**
- Forms use `useActionState`, so the submit button is disabled while the request is pending.
- After success they navigate with `window.location.assign(...)`. A full navigation re-renders server components with the new cookie and avoids a stale client router cache, for example after sign-out.

**Pages**

| Route | Server page | Client form |
| --- | --- | --- |
| `/sign-up` | `target = safeRedirectPath(redirect)`. A signed-in visitor goes to `redirect(target)`. | Name, Email, Password. `signUp.email({ name, email, password, callbackURL: VERIFY_CALLBACK })`, then go to `target`. For the "already exists" message, also link to `/sign-in` and `/forgot-password`. |
| `/sign-in` | Same redirect handling. `?password=changed` shows the "password changed" notice. | Email, Password. `signIn.email(...)`, then go to `target`. Links to sign-up (keeping `redirect`) and forgot-password. |
| `/forgot-password` | No session check. | Email. `requestPasswordReset({ email, redirectTo: "/reset-password" })`. On `200`, show the one generic message. |
| `/reset-password` | Reads `token` and `error`. With `error` or no `token`, it renders the invalid-link message and a link to `/forgot-password`. Otherwise it renders the form with `token` as a prop. | On mount, `history.replaceState(null, "", "/reset-password")`. New and confirm passwords are compared before sending. `resetPassword({ newPassword, token })`. `INVALID_TOKEN` shows the invalid-link message. Success goes to `/sign-in?password=changed`. |
| `/account` | Not in the group. With no session, it calls `redirect("/sign-in?redirect=" + encodeURIComponent("/account" + query))`, keeping `verified` and `error`. It shows the email and the verified status. `error` shows the invalid-link message. `verified=1` with `emailVerified` shows the confirmation. | `ResendVerification` (only while unverified) calls `sendVerificationEmail({ email, callbackURL: VERIFY_CALLBACK })` and shows the sent message. `SignOutButton` calls `signOut()`, then `posthog.reset()` when PostHog is loaded, then goes to `/`. |

`/account`, `/sign-in`, and `/sign-up` read the session, which makes them dynamic. Confirm in the build output that none is prerendered (`○`).

**Landing page:** `apps/web/src/app/page.tsx` renders `<Link href="/sign-up" className={buttonVariants({ size: "lg" })}>Get Started</Link>`. Update `tests/e2e/home.spec.ts` to look for a link, so E2E stays green in this slice.

**`apps/web/next.config.ts`**
- Add `headers()` with `Referrer-Policy: no-referrer` for `/reset-password`.

**`apps/web/src/instrumentation-client.ts`**
- Add `before_send: (event) => (event ? scrubAuthTokens(event) : event)` to `posthog.init`.
- It covers the first pageview on `/reset-password`, sent before the page removes the token, and `$set_once` properties such as `$initial_current_url`.
- Sentry is already covered by #21.

**Metadata:** each page sets a `title`.

**Manual check:** run `pnpm dev`, sign up, follow the verification email from Mailpit, sign out, reset the password, and confirm that every message in the spec appears.

### Slice 4: End-to-End Tests and Documentation

**E2E environment**

- **Origin:** Playwright's app `webServer` gets `env: { ...process.env, BETTER_AUTH_URL: "http://127.0.0.1:3000" }`.
  - Without it, local browser requests from `127.0.0.1` fail the origin check while CI passes.
  - `next.config.ts` loads `.env.local` without overriding variables that are already set, so this wins.
  - `BETTER_AUTH_URL` is read at runtime, so the build does not need it.
- **PostHog stub:** rename `tests/e2e/support/sentry-stub.ts` to `observability-stub.ts` and serve PostHog from it too.
  - Decode bodies sent with `compression=gzip-js` in the query string, as well as `Content-Encoding: gzip`.
  - Answer every `GET` other than `/received` with `{}`.
- **Build script:** move the build environment into `scripts/build-e2e.sh`, which `test:e2e` calls. It sets three variables, then builds `@startup/web`:
  - `NEXT_PUBLIC_SENTRY_DSN`
  - `NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN=phc_e2e`
  - `NEXT_PUBLIC_POSTHOG_HOST=http://127.0.0.1:9999`
- **Shared helpers:** move `uniqueAddress` and `uniqueIp` from `email.spec.ts` to `tests/e2e/support/identity.ts`.
- **Browser fixture:** add a `test.extend` fixture that gives each test a browser context with its own `x-forwarded-for` IP.

**`tests/e2e/auth-pages.spec.ts`**

Covers every end-to-end criterion in the spec. The full reset flow uses two browser contexts, so the session ended by the reset is observed in the first one. For failures that the E2E server cannot produce, the test fulfills the API request with `page.route`: `503 EMAIL_NOT_AVAILABLE`, because email is configured on the E2E server, and `429`. The API behavior behind both is already covered by `@startup/auth` tests.

The reset token test:

- Open `/reset-password?token=<unique value>`.
- Wait at the stub for this page's PostHog `$pageview`.
- Assert that no body sent to the stub contains the value, using the boolean form from #21.
- Assert that the response carries `Referrer-Policy: no-referrer` and that the address bar no longer has the token.

To make the browser's Sentry pageload deterministic, send a sampled `sentry-trace` header on the document request. The server then renders sampled trace metadata, which the browser continues. Confirm this works. If it does not, the Sentry part of the check rests on #21's server test and the existing scrubbing.

**Documentation**

- `docs/architecture/authentication.md`: replace "The template ships the authentication API only" with the pages, their redirect rule, and `VERIFY_CALLBACK`.
- `docs/architecture/observability.md`:
  - PostHog `before_send` with `scrubAuthTokens`.
  - `Referrer-Policy` and token removal on `/reset-password`.
  - `posthog.reset()` on sign-out.
- `docs/architecture/testing.md`:
  - the new suite
  - the observability stub now serving PostHog too
  - `scripts/build-e2e.sh`
  - the `BETTER_AUTH_URL` override
- `README.md`: remove slice 1, the sign-up, sign-in, and sign-out pages, from the Feedbox slice table. Renumber the table and the "slices 1, 3, 4, and 6" sentence that follows it.

## Data and API Changes

- **Schema and migrations:** none.
- **Environment variables:** none in `@startup/env`. The E2E build sets existing `NEXT_PUBLIC_*` variables to stub values.
- **Public package APIs:**
  - `@startup/auth/next`: `getSession()` and `Session`
  - `@startup/auth/redirect`: `safeRedirectPath()`
  - `@startup/ui`: `Input`, `Label`, `FormMessage`, and `buttonVariants`
- **Routes:**
  - new pages `/sign-up`, `/sign-in`, `/forgot-password`, `/reset-password`, and `/account`
  - no new API routes
  - `Referrer-Policy` on `/reset-password`

## Ownership

- Branch: `feat/auth-pages`
- Worktree: `~/dev/worktrees/startup-template-auth-pages`
- Expected files:
  - `packages/auth/src/{next,redirect}.ts`
  - `packages/ui/src/components/*`
  - `apps/web/src/app/**`
  - `apps/web/src/lib/auth.ts`
  - `apps/web/next.config.ts`
  - `apps/web/src/instrumentation-client.ts`
  - `tests/e2e/**`
  - `scripts/build-e2e.sh`
  - the documents listed above
- Shared hotspots:
  - root `package.json` (`test:e2e`)
  - `packages/auth/package.json` (`exports`)
  - `playwright.config.ts`
  - `.agents/rules/repository.md`
- No schema or migration changes.

## Risks

- **Origin mismatch in local E2E.** Without the `BETTER_AUTH_URL` override, every browser test fails locally with `403` while CI passes. Slice 4 adds the override before any browser test.
- **`history.replaceState` and the App Router.** Next.js supports native `replaceState` and keeps `useSearchParams` in sync, but this is the first use in the repository. Check that the form keeps its token after the URL changes. If it does not, read the token once into state before replacing the URL.
- **PostHog session replay.** If a project enables session replay, recordings may include the page URL before the token is removed. It is not yet known whether replay data passes through `before_send` in posthog-js 1.434. Check it in Slice 3. If it does not, start PostHog with replay disabled when the first page is `/reset-password`.
- **PostHog payload format.** The stub must decode PostHog's compressed bodies, or the token check passes without having seen anything. The test therefore waits for this page's `$pageview` before asserting.
- **Sign-up reveals existing accounts.** Accepted and recorded in the spec.
- **Rate limits in E2E.** Better Auth limits sign-in per IP. Each test uses its own IP through the fixture, and the limits are not raised.
- **`cache` in route handlers.** React `cache` deduplicates only during server component rendering. In route handlers `getSession()` runs once per call, which is correct but not deduplicated.
- **Name length.** Better Auth does not limit `name`. The input sets `maxLength={100}`, and the server accepts what Better Auth accepts. Product code can add validation later.

## Verification

Per slice:

1. Slice 1: `pnpm --filter @startup/auth test`, then `pnpm verify`.
2. Slice 2: `pnpm --filter @startup/ui test`, then `pnpm verify`.
3. Slice 3:
   - `pnpm verify`
   - the manual check above
   - `pnpm verify:full`
   - confirm that no client component imports `@startup/auth` (the root entry), `@startup/auth/next`, `@startup/db`, `@startup/email`, or `@startup/env`, by searching the files that start with `"use client"`
4. Slice 4:
   - `pnpm verify:full`
   - `pnpm agent:check`
   - temporarily remove `before_send` and confirm that the reset token test fails, then restore it

Before opening the pull request, check `git status` and the full diff, and confirm that no secret or `.env.local` value is included.
