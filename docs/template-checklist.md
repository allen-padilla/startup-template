# Template Checklist

Use this list after creating a new project from the template.

Creating a repository from a GitHub template copies the files only. It does not copy repository settings, secrets, branch protection, or Git history.

## Names and Identity

The template keeps three kinds of names separate:

| Name       | Value in the template | Meaning                                                                                    |
| ---------- | --------------------- | ------------------------------------------------------------------------------------------ |
| Maintainer | Allen                 | the brand that maintains the template: the closing README line and `package.json` `author` |
| Template   | Startup Template      | the placeholder product name in the README, the application metadata, and the landing page |
| Product    | none                  | chosen for each project created from the template                                          |

- Give every product its own name. A product maintained by Allen may add a "by Allen" attribution, such as "RepoGuide by Allen". The product name itself stays independent: "RepoGuide", not "Allen RepoGuide".
- Customize the product metadata for each project. The "Startup Template" values are placeholders, not a brand.
- The GitHub owner `@allen-padilla` is the maintainer's GitHub account, which is separate from the display brand. It appears in `.github/CODEOWNERS` and in documentation.
- `@startup/*` is an intentional reusable template scope. It names the template, not a brand. Keep it unless you rename it deliberately (see [Optional](#optional)).
- If you reuse the template and you are not Allen, replace the maintainer values and the GitHub owner with your own.

## Replace Immediately

These values identify the template or its maintainer. Replace them before the first real commit.

- [ ] **`.github/CODEOWNERS`**: replace `@allen-padilla` with your own user or team, unless the new repository is also owned by that account. Until you do, GitHub requests review from someone outside your project, or reports an invalid owner.
- [ ] **Root `package.json`**:
  - `name`: currently `startup-template`
  - `description`
  - `license`: currently `MIT`, the template's license. Set your project's license, or `UNLICENSED` for proprietary code.
  - `author`: currently `Allen`, the template maintainer
- [ ] **`LICENSE`**: the template's MIT license, copyright Allen. MIT requires keeping this notice in copies of the template, including proprietary ones. Keep it, for example renamed to `LICENSE-TEMPLATE`, and add your own license for your project.
- [ ] **`README.md`**: the title, the introduction, the clone command, and the closing "Maintained by Allen." line.
- [ ] **Email sender and copy**: `EMAIL_FROM` in your environments, on a domain you own, and `productName` in `packages/email/src/templates/brand.ts`, which email subjects and footers use. When you add a message, never put text a user typed in mail to an address that is not verified. See the Content section of `docs/architecture/email.md`.
- [ ] **Application metadata** in `apps/web/src/app/layout.tsx`: `title` and `description`, both currently about the template.
- [ ] **Landing page** in `apps/web/src/app/page.tsx`: placeholder content.
- [ ] **Icon** at `apps/web/src/app/favicon.ico`: the Next.js default.
- [ ] **`apps/web/README.md`**: mentions the template by name.

## Configure Before Production

These have working local defaults, or are left to each product. Each needs a real value or a decision before the application serves users. See `docs/architecture/deployment.md`.

- [ ] **Host**: a Coolify resource, or any Docker host, built from the root `Dockerfile` with port `3000`, health check `/up`, and automatic deployment on push turned off. Mark `NEXT_PUBLIC_*` and `SENTRY_*` values as build variables, set `RUN_MIGRATIONS=true` for a single instance, and add `COOLIFY_WEBHOOK_URL` and `COOLIFY_TOKEN` as GitHub secrets so `deploy.yml` deploys green commits. See `docs/architecture/deployment.md`.
- [ ] **Deployment URL**: your production domain.
- [ ] **`BETTER_AUTH_URL`**: the production origin. The local default is `http://localhost:3000`.
- [ ] **`BETTER_AUTH_SECRET`**: a new value for each environment. Never reuse the CI placeholder or a value from another project.
- [ ] **`DATABASE_URL`**: a managed PostgreSQL database with its own credentials.
- [ ] **Stripe products and prices**: create the product and its recurring price in your Stripe account, in test mode and again in live mode. Set `STRIPE_PRICE_PRO_MONTHLY` to the Price ID.
- [ ] **Stripe webhook endpoint**: `https://<your-domain>/api/billing/webhook`, with its signing secret in `STRIPE_WEBHOOK_SECRET`.
- [ ] **Stripe API key**: `STRIPE_SECRET_KEY`. Use test-mode keys everywhere except production.
- [ ] **Sentry organization and project**: `NEXT_PUBLIC_SENTRY_DSN`, and `SENTRY_ORG`, `SENTRY_PROJECT`, and `SENTRY_AUTH_TOKEN` for source maps.
- [ ] **SMTP provider**: `SMTP_URL` for a hosted provider, Amazon SES, or your own relay. Never the local Mailpit. See `docs/architecture/email.md`.
- [ ] **Sender domain verification**: SPF and DKIM records for the domain in `EMAIL_FROM`, plus a DMARC policy. Without them, providers reject messages or deliver them as spam.
- [ ] **PostHog project**: `NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN`, and `NEXT_PUBLIC_POSTHOG_HOST` for your region. The example host is the US region.
- [ ] **Security headers**: review the values in `apps/web/next.config.ts`. Relax `Permissions-Policy` or the framing headers only if the product needs the camera, microphone, or location, or must be embedded in another site. Add `includeSubDomains` and `preload` to `Strict-Transport-Security` only once every subdomain serves HTTPS. See `docs/architecture/deployment.md`.
- [ ] **Client IP**: per-client rate limits, including 10 sign-ups per hour, depend on a trustworthy `x-forwarded-for`. Behind your own proxy or load balancer, configure `advanced.ipAddress` in `packages/auth/src/auth.ts`. Users behind one shared IP, such as an office NAT, share the sign-up limit. See `docs/architecture/deployment.md`.
- [ ] **Privacy policy and terms**: the template has neither. Publish both and link them where users sign up. Say what the product collects and which services process it, such as your host, your database provider, Stripe, your SMTP provider, Sentry, and PostHog.
- [ ] **Analytics consent**: when configured, PostHog starts on every page load and stores an identifier in a cookie and local storage (`apps/web/src/instrumentation-client.ts`). For visitors in the EU and UK, ask for consent first, and let PostHog track them or store anything only after they agree.
- [ ] **Account deletion**: the template has no way to delete an account. Add one, and cancel the user's Stripe subscription in the same flow: deleting a user removes the local billing rows but cancels nothing in Stripe. See `docs/architecture/billing.md`.
- [ ] **Online cancellation**: subscribers cannot cancel in the application. Give them a way to cancel online, such as Stripe's customer portal. See Known Limitations in `docs/architecture/billing.md`.
- [ ] **Branding**: colors and fonts in `apps/web/src/app/globals.css` and `layout.tsx`, and shared components in `packages/ui`.

## Configure in GitHub

Repository settings are not part of the template.

- [ ] **Branch protection or rulesets** for `main`, when your plan supports them. Require the `Lint, Typecheck, Test, Build` and `Playwright` checks. They are not available for private repositories on the GitHub Free plan. There, the checks are advisory and the rule is manual. See `docs/architecture/continuous-integration.md`.
- [ ] **Dependabot**: `.github/dependabot.yml` is copied with the template and starts opening pull requests. Enable Dependabot alerts and security updates in the repository settings.
- [ ] **Actions**: confirm that both workflows run on your first pull request. They need no repository secrets.
- [ ] **Secret scanning and push protection**, when available for your plan.

## Optional

- [ ] **Package scope `@startup/*`**: safe to keep. The packages are private and are never published, so the scope is only an internal name. To rename it, make one dedicated change:
  1. Find every use with `git grep -l "@startup/"`.
  2. Replace the scope in every `package.json`, import, configuration file, and document, including `AGENTS.md` and `.agents/`.
  3. Run `pnpm install` to regenerate the lockfile.
  4. Run `pnpm verify:full`.
- [ ] **Plan name**: the billing code assumes one paid plan, "Pro monthly". Renaming `STRIPE_PRICE_PRO_MONTHLY` or adding plans is a code change. Follow the `add-environment-variable` skill and `docs/architecture/billing.md`.
- [ ] **Checkout paths in documentation**: `docs/architecture/parallel-development.md` uses `~/dev/startup-template` for the main checkout and `~/dev/worktrees/startup-template-<task>` for worktrees. Update them to match where your project lives.
- [ ] **CAPTCHA on sign-up and password reset**: the per-client limit does not stop sign-ups spread across many IP addresses. Better Auth has a `captcha` plugin for Cloudflare Turnstile, Google reCAPTCHA, and hCaptcha. It needs a provider account and new environment variables: follow the `add-environment-variable` skill.
- [ ] **A full Content-Security-Policy**: the template sends only `frame-ancestors 'none'`. A useful `script-src` policy must allow the Next.js, Sentry, and PostHog scripts by hash or by per-request nonce, and needs `connect-src` entries for the Sentry and PostHog hosts. Nonces are generated in a Next.js `proxy.ts` and make every page render dynamically. Roll it out with `Content-Security-Policy-Report-Only` first.
- [ ] **Agent adapters**: `CLAUDE.md` points Claude Code to `AGENTS.md`. Add an equally thin adapter for any other tool your team uses, and list it in `ADAPTERS` in `scripts/check-agent-harness.mjs`. `pnpm agent:check` checks only the adapters in that list.

## Safe to Keep

These defaults are intentional. Leave them unless you have a reason to change them.

| Default                                                        | Where                                                       | Why it is safe                                                              |
| -------------------------------------------------------------- | ----------------------------------------------------------- | --------------------------------------------------------------------------- |
| Local database user, password, and name `startup`              | `compose.yaml`, `.env.example`, both CI workflows           | used only by the local container, which `compose.yaml` publishes on `127.0.0.1` only, and the disposable CI database |
| `postgresql://startup:startup@localhost:5432/startup`          | `.env.example`, both CI workflows                           | reaches only a local or CI database                                         |
| `http://localhost:3000` and `http://127.0.0.1:3000`            | `.env.example`, `playwright.config.ts`, CI workflows, tests | local development and test addresses                                        |
| Mailpit and `SMTP_URL=smtp://localhost:1025`                   | `compose.yaml`, `.env.example`                              | a local mail catcher with no authentication; never use it in production     |
| `ci-only-secret-that-is-long-enough-for-validation`            | both CI workflows                                           | a placeholder that only satisfies validation; never use it anywhere else    |
| Test secrets in `packages/billing`                             | `vitest.config.ts` and test files                           | placeholders; the tests never contact Stripe or a real database             |
| `@startup/*` package names                                     | every package                                               | internal and private                                                        |
| Node.js 24 and the pinned pnpm version                         | `.node-version`, `package.json`, CI workflows               | change them deliberately and together                                       |

If you change the local database credentials, change them in `compose.yaml`, `.env.example`, both workflows in `.github/workflows/`, and `docs/architecture/continuous-integration.md` in the same change.

Never use any of these defaults for a database or service that is reachable from a network.

## Verify the New Project

After the replacements:

```bash
./scripts/check-environment.sh
pnpm verify:full
git grep -n -i -E "allen|startup-template|startup template"
```

The last command lists the remaining references to the template and its maintainer. Review each one.
