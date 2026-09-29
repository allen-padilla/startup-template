# Repository Rules

These rules apply to all substantive work in this repository. They add operational detail to the invariants in `AGENTS.md` and must not contradict it. See `docs/architecture/agent-workflows.md` for precedence.

## General

- Read `AGENTS.md` before making changes.
- Read relevant files before editing them.
- Prefer existing patterns over introducing new abstractions.
- Keep changes scoped to the requested task.
- Do not modify unrelated files.
- Do not commit unless explicitly requested.

## Architecture

- Applications may depend on packages. Packages must not depend on applications.
- Import other packages only through their public `exports` entry points, never through internal `src/` paths.
- Read relevant documentation in `docs/architecture/` before structural or cross-package changes.
- When a change alters documented architecture, update the relevant architecture doc in the same change.

## Dependencies

- Use pnpm only.
- Add dependencies to the package that imports them, using `pnpm --filter <package> add <dependency>`.
- Use `workspace:*` for internal `@startup/*` dependencies.
- Do not add root dependencies merely for convenience.
- Do not disable pnpm build-script protection globally. Review `allowBuilds` in `pnpm-workspace.yaml` for dependencies that need install scripts.
- Do not introduce a dependency when the existing stack already solves the problem adequately.
- Use the `add-package` skill for new or restructured packages.

## Environment

- Never commit or print secret values.
- Treat all `NEXT_PUBLIC_*` variables as public.
- Server code reads `@startup/env`; browser code reads `@startup/env/client`. Client code must not import `@startup/env` directly or transitively.
- Do not weaken environment validation to make builds pass.
- Use the `add-environment-variable` skill for new or changed variables.

## Database

- Schema changes must use the `database-migration` skill.
- Generate migrations with `pnpm db:generate`; do not hand-write or hand-edit generated migrations unless the migration workflow requires repairing migration state.
- Review generated SQL before applying it.
- Stop and report on unexplained destructive SQL.

## Authentication

- Use the existing Better Auth integration in `@startup/auth`.
- Do not create parallel authentication, session, or cookie-handling systems.
- Authenticate server-side with `auth.api.getSession({ headers })`; never trust client-asserted identity.
- Client components must not import server auth, database, or secret-bearing modules.

## Billing

- Server Stripe functionality belongs in `@startup/billing`.
- Stripe secrets are server-only.
- Entitlement rules belong in `@startup/billing`.
- Do not infer paid access from checkout redirects.
- Verified webhook-synchronized state is authoritative.

## API Routes

- Use the `add-api-route` skill for new or materially changed route handlers.
- Keep domain logic in the owning `@startup/*` package; route handlers authenticate, validate, delegate, and map results to HTTP.

## Observability

- Sentry and PostHog must not receive secrets, credentials, raw auth tokens, or unnecessary personal data.
- Observability must remain optional for local development unless the architecture explicitly changes.

## Testing and Verification

- Do not delete, skip, or weaken tests to make a change pass.
- Prefer externally meaningful behavior over implementation-detail assertions.
- Run targeted tests for the affected package first.
- `pnpm verify` is required before considering implementation complete.
- Also run `pnpm verify:full` for changes affecting significant application behavior or complete user workflows, including authentication, billing, routing, and other cross-system or user-facing behavior. Documentation-only changes do not require it.

## Completion

Before reporting completion:

1. Run the required verification.
2. Review the diff (`git status`, `git diff --stat`, `git diff`).
3. Check for accidental or generated files.
4. Check for secret exposure.
5. Report what changed, verification results, and any remaining concerns.

Do not commit unless explicitly requested.
