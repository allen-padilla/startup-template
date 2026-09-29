# Agent Workflows

## Purpose

This repository includes a tool-agnostic harness for coding agents. It tells an agent what the repository's invariants are, which procedures to follow for known task types, how to approach a task depending on its mode, and how to prove the work is correct.

The harness is plain Markdown under `AGENTS.md`, `.agents/`, and `docs/`. Tool-specific entry points such as `CLAUDE.md` are thin adapters that point back to `AGENTS.md`; they must not become a second source of truth.

## Layers

### `AGENTS.md`

The entry point and the highest-level repository guidance. It holds concise, repository-wide invariants: package manager, package boundaries, server/client separation, secrets, and the core auth, database, billing, testing, and observability constraints. It points to everything else and does not contain step-by-step procedures.

### `.agents/rules/`

Detailed cross-cutting rules that apply to every substantive task. Agents should read `.agents/rules/repository.md` before substantive repository work. Rules expand on `AGENTS.md` with operational detail; they must not contradict it.

### `.agents/skills/`

Repeatable procedures for known task types, one directory per skill with a `SKILL.md`. Each skill has YAML frontmatter (`name`, `description`) saying when to use it. When a task matches a skill, follow the skill instead of improvising.

Current skills:

- `database-migration` — Drizzle/PostgreSQL schema changes
- `add-api-route` — Next.js route handlers in `apps/web`
- `add-environment-variable` — server and browser environment variables
- `add-package` — `@startup/*` workspace packages
- `worktree-task` — tasks in a Git worktree and parallel agent work

### `.agents/commands/`

Workflow modes that define how to approach a task:

- `plan` — produce an implementation plan without modifying files
- `implement` — make a scoped change and verify it
- `debug` — reproduce a failure, find the root cause, and make the smallest fix
- `review` — review a working tree, commit, or branch without modifying files

### `.agents/agents/`

Role definitions (`planner`, `implementer`, `reviewer`) for tools that support specialized agents or subagents. Each role maps onto the matching command and inherits its constraints.

### `docs/specs/`

What should happen: desired product or system behavior, agreed before implementation. See `docs/specs/README.md`.

### `docs/plans/`

How an approved task or spec will be implemented in this repository. Plans are short-lived implementation artifacts. See `docs/plans/README.md`.

### `docs/architecture/`

Long-lived system design and boundaries. Architecture docs describe how the system is built and must stay accurate as it evolves; specs and plans do not replace them.

### Tests and `pnpm verify`

Tests, type checking, lint, the production build, and end-to-end tests are the mechanical truth. A passing check outranks a prose claim, and a prose claim that contradicts a failing check is wrong.

### `pnpm agent:check`

`scripts/check-agent-harness.mjs` checks the structure of the harness itself. It runs first in `pnpm verify`, so a structurally broken harness fails verification locally and in CI.

It checks mechanical facts only:

- `AGENTS.md`, `.agents/rules/repository.md`, `docs/architecture/`, `docs/specs/`, and `docs/plans/` exist
- every directory in `.agents/skills/` has a non-empty `SKILL.md` whose frontmatter has a `description` and a `name` equal to the directory name
- every Markdown file in `.agents/commands/` and `.agents/agents/` is non-empty
- `CLAUDE.md` points to `AGENTS.md` and stays a few lines long
- repository paths written in the harness documentation exist

The reference check reads inline code and Markdown links in `AGENTS.md`, `CLAUDE.md`, `.agents/`, this document, and the `README.md` files in `docs/specs/` and `docs/plans/`. It checks a path only when the whole reference is one path. It skips commands, fenced code blocks, tool-managed sections, external URLs, and ignored or generated paths such as `.env.local`. For a placeholder or glob such as `docs/specs/<feature-name>.md`, it checks the directories before the placeholder.

Only the adapters listed in `ADAPTERS` in the script are checked. When adding an adapter for another tool, add its file name to that list. An adapter that is not listed is not checked.

It does not judge whether guidance is correct or complete. That remains a review task.

## Precedence

When guidance conflicts, apply this order, highest first:

1. Actual repository behavior, tests, and mechanical checks
2. `AGENTS.md` repository invariants
3. Relevant `docs/architecture/` documents
4. `.agents/rules/`
5. The relevant skill in `.agents/skills/`
6. Command and role workflow guidance in `.agents/commands/` and `.agents/agents/`

If two prose documents conflict, do not guess:

- inspect the actual code and tests
- follow the more specific guidance that matches current repository behavior
- report the contradiction so the documentation can be fixed

Never weaken a test, validation, or security constraint to resolve a conflict.

## Choosing a Mode

- **Plan** when the task is large, crosses packages, changes data models or public APIs, or the approach is uncertain. Planning does not modify files. A plan is saved to `docs/plans/` only when explicitly requested.
- **Implement** when the task is clear enough to act on, either directly or from an approved spec or plan.
- **Debug** when something fails and the cause is unknown. Reproduce first and fix the root cause, not the symptom.
- **Review** when a change already exists, whether uncommitted, committed, or on a branch. Review does not modify files unless explicitly asked.

## Substantial Task Flow

For substantial features or cross-system changes:

1. Request, optionally with a spec in `docs/specs/<feature-name>.md`
2. Inspect the relevant code, architecture docs, rules, and skills
3. Plan (returned in the conversation, or saved to `docs/plans/<feature-name>.md` when requested)
4. Implement the smallest coherent change
5. Run targeted tests
6. Run `pnpm verify`
7. Run `pnpm verify:full` when required (see Verification)
8. Review the diff
9. Report results; the user decides whether to commit

## Small Task Flow

A small, well-scoped change may skip a saved spec and plan, but not verification:

1. Inspect the relevant code
2. Implement
3. Verify
4. Review the diff

## Parallel Work

When several tasks run at the same time, each task uses its own branch and Git worktree, with one primary owner, and follows the `worktree-task` skill. The main checkout stays on `main` and coordinates. See `parallel-development.md`.

When no parallel work is active, the substantial and small task flows above can run in the current checkout.

## Durable Learning

Work on the repository produces knowledge that later tasks need. The loop is:

1. Implement.
2. Notice reusable, repository-specific knowledge: a constraint, a procedure, a failure mode, or an architectural fact.
3. Record it in the narrowest durable source that fits.
4. Enforce it mechanically when practical, in preference to more prose.

The Durable Knowledge section of `.agents/rules/repository.md` says which source fits which kind of knowledge, and when not to document at all.

## Verification

`pnpm verify` is required before considering implementation complete. It runs the agent harness check, lint, type checking, fast automated tests, and the production build.

Also run `pnpm verify:full` for changes affecting significant application behavior or complete user workflows, including authentication, billing, routing, and other cross-system or user-facing behavior. It adds Playwright end-to-end tests.

Documentation-only changes do not require `pnpm verify:full` unless the task explicitly asks for it.

See `testing.md`.

## Commits

No workflow, command, role, or skill commits automatically. Commit only when the user explicitly requests it.
