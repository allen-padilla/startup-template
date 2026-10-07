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

See `docs/architecture/dependencies.md`.

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
- Authenticate server-side with `getSession()` from `@startup/auth/next`; never trust client-asserted identity.
- Client components must not import server auth, database, or secret-bearing modules.

## Billing

- Server Stripe functionality belongs in `@startup/billing`.
- Stripe secrets are server-only.
- Entitlement rules belong in `@startup/billing`.
- Do not infer paid access from checkout redirects.
- Verified webhook-synchronized state is authoritative.

## Email

See `docs/architecture/email.md`.

- Only `@startup/email` opens SMTP connections or imports a mail library. Other code sends through it.
- `SMTP_URL` is a server-only secret. `SMTP_URL` and `EMAIL_FROM` are set together or both left empty.
- Message templates live in `@startup/email`, render both an HTML and a plain-text body, and escape user-supplied values.
- Errors, logs, Sentry, and PostHog never receive message bodies, links, or tokens.
- Tests never open network connections; inject a transport.

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

## Durable Knowledge

When implementation reveals a reusable, repository-specific constraint, procedure, failure mode, or architectural fact, record it in the narrowest durable location that fits. Do not leave it only in the conversation or in a temporary plan.

- Reusable task procedure: `.agents/skills/`
- Cross-cutting repository invariant: `.agents/rules/repository.md`
- Long-lived architecture or rationale: `docs/architecture/`
- Desired product behavior: `docs/specs/`
- Task-specific implementation approach: `docs/plans/`
- Mechanically enforceable behavior: code, types, tests, lint rules, or CI, in preference to more prose

Limits:

- Do not document every incidental discovery.
- Do not duplicate existing guidance. Correct the existing source instead of creating another one.
- Information that is obvious from the code usually does not need prose.
- Do not use task plans as a permanent store for architectural knowledge.

## Task State

See the Task State section of `docs/architecture/agent-workflows.md` for how the parts fit together, and `docs/plans/README.md` for how a plan records status.

- The status recorded in a plan in `docs/plans/` says where that work stands. A conversation does not.
- Start a task by reading the state: run `pnpm agent:status`, then check it against `git status` and the branch's commits.
- When the record and the repository disagree, the repository is right. Correct the record and report the difference.
- Set a slice to `in-progress` when work on it starts, and to `done` only after its required verification passes.
- Change a slice's status on the same branch as the work it describes, so the state and the code merge together.
- Change only the status of your own slice.

## Completion

Before reporting completion:

1. Run the required verification.
2. When the task implements a plan slice, update that slice's status in the plan, then run `pnpm agent:check`.
3. Review the diff (`git status`, `git diff --stat`, `git diff`).
4. Check for accidental or generated files.
5. Check for secret exposure.
6. Report what changed, verification results, and any remaining concerns.

Do not commit unless explicitly requested.

## CI

- Do not weaken GitHub Actions or required checks to make a change pass.
- Keep CI aligned with repository commands such as `pnpm verify` and `pnpm test:e2e`.
- Never place production secrets directly in workflow files.
- Use disposable test values and GitHub secrets only when necessary.

## Parallel Work

Follow the `worktree-task` skill. See `docs/architecture/parallel-development.md`.

- When parallel work is active, each task has one branch, one worktree, and one primary owner.
- The main checkout stays on `main` and coordinates: creating worktrees, reviewing branches, merging, and cleanup.
- Small tasks with no parallel work may still follow the normal small-task flow in the main checkout.
- Do not edit files outside the assigned task scope merely because they are nearby.
- Before modifying a shared hotspot, check whether another active task owns it. `pnpm agent:status` lists the hotspots each active task changes.
- If two active tasks require the same files or schema, report the overlap instead of racing.
- Only one active task may own schema and migration changes at a time.
- `package.json` files and `pnpm-lock.yaml` are shared dependency hotspots. Regenerate the lockfile with `pnpm install` rather than hand-merging it.
- With the current local infrastructure, database migrations and E2E runs (`pnpm test:e2e`, `pnpm verify:full`) are serialized across worktrees: they share the local database and port `3000`.
- Do not merge another feature branch into your task branch unless explicitly instructed.
- Integration happens through the normal PR workflow. Do not commit or merge unless explicitly requested.
