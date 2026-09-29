# Repository Rules

## General

- Read `AGENTS.md` before making changes.
- Read relevant files before editing them.
- Prefer existing patterns over introducing new abstractions.
- Keep changes scoped to the requested task.
- Do not modify unrelated files.
- Do not commit unless explicitly requested.

## Architecture

- Applications may depend on packages.
- Packages must not depend on applications.
- Respect package public APIs.
- Avoid imports from another package's internal source paths.
- Read relevant documentation in `docs/architecture/` before structural changes.

## Dependencies

- Use pnpm only.
- Add dependencies to the package that imports them.
- Do not add root dependencies merely for convenience.
- Do not disable pnpm build-script protection globally.
- Do not introduce a dependency when the existing stack already solves the problem adequately.

## Environment

- Never commit or print secrets.
- Treat all `NEXT_PUBLIC_*` variables as public.
- Client code must not import server-only environment modules.
- Do not weaken environment validation to make builds pass.

## Database

- Database schema changes must use the database migration skill.
- Never hand-write generated migrations unless explicitly required by the migration tooling/workflow.
- Review generated SQL before applying it.
- Stop on unexplained destructive SQL.

## Authentication

- Use the existing Better Auth integration.
- Do not create parallel authentication systems.
- Client components must not import server auth, database, or secret-bearing modules.

## Billing

- Server Stripe functionality belongs in `@startup/billing`.
- Stripe secrets are server-only.
- Billing entitlement rules belong in the billing package.
- Do not infer paid access from checkout redirects.
- Verified webhook-synchronized state is authoritative.

## Testing

- Do not delete, skip, or weaken tests to make a change pass.
- Prefer externally meaningful behavior over implementation-detail assertions.
- Run `pnpm verify` before considering work complete.
- Run `pnpm verify:full` for significant user-facing or cross-system changes.

## Completion

Before reporting completion:

1. Review the diff.
2. Run the required verification.
3. Check for accidental files.
4. Check for secret exposure.
5. Report what changed and any remaining concerns.