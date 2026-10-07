# Agent Workflows

## Purpose

This repository includes a tool-agnostic harness for coding agents. It tells an agent what the repository's invariants are, which procedures to follow for known task types, how to approach a task depending on its mode, where a task currently stands, and how to prove the work is correct.

The guidance is plain Markdown under `AGENTS.md`, `.agents/`, and `docs/`. Two commands, backed by scripts in `scripts/` that need no dependencies, work on it: `pnpm agent:check` checks its structure, and `pnpm agent:status` reports where the work stands. Tool-specific entry points such as `CLAUDE.md` are thin adapters that point back to `AGENTS.md`; they must not become a second source of truth.

## Layers

### `AGENTS.md`

The entry point and the highest-level repository guidance. It holds the repository-wide invariants, the one statement of the verification policy, and pointers to everything else. It does not contain step-by-step procedures.

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

### `docs/specs/`

What should happen: desired product or system behavior, agreed before implementation. See `docs/specs/README.md`.

### `docs/plans/`

How an approved task or spec will be implemented in this repository. Plans are short-lived implementation artifacts. Each slice of a plan records its status below its heading. See `docs/plans/README.md` and [Task State](#task-state).

### `docs/architecture/`

Long-lived system design and boundaries. Architecture docs describe how the system is built and must stay accurate as it evolves; specs and plans do not replace them.

### Tests and `pnpm verify`

Tests, type checking, lint, the production build, and end-to-end tests are the mechanical truth. A passing check outranks a prose claim, and a prose claim that contradicts a failing check is wrong.

### `pnpm agent:check`

`scripts/check-agent-harness.mjs` checks the structure of the harness itself. `pnpm agent:check` runs it after the unit tests of the harness scripts in `scripts/lib/`, which use Node's built-in test runner. `pnpm agent:check` runs first in `pnpm verify`, so a structurally broken harness fails verification locally and in CI.

It checks mechanical facts only:

- `AGENTS.md`, `.agents/rules/repository.md`, `docs/architecture/`, `docs/specs/`, and `docs/plans/` exist
- every directory in `.agents/skills/` has a non-empty `SKILL.md` whose frontmatter has a `description` and a `name` equal to the directory name
- every Markdown file in `.agents/commands/` is non-empty
- `CLAUDE.md` points to `AGENTS.md` and stays a few lines long
- every plan in `docs/plans/` records a valid status for each of its slices, in the format of `docs/plans/README.md`
- the Shared Hotspots table in `parallel-development.md` can be read, and its paths exist
- repository paths written in the harness documentation exist

The reference check reads inline code and Markdown links in `AGENTS.md`, `CLAUDE.md`, `.agents/`, this document, and the `README.md` files in `docs/specs/` and `docs/plans/`. It checks a path only when the whole reference is one path. It skips commands, fenced code blocks, tool-managed sections, external URLs, and ignored or generated paths such as `.env.local`. For a placeholder or glob such as `docs/specs/<feature-name>.md`, it checks the directories before the placeholder.

Only the adapters listed in `ADAPTERS` in the script are checked. When adding an adapter for another tool, add its file name to that list. An adapter that is not listed is not checked.

It does not judge whether guidance is correct or complete, or whether a recorded status is true. That remains a review task.

## Task State

The harness is state-aware: where a task stands is written down and checked, not remembered. A session can end at any point, and the next one starts from the record instead of from an earlier conversation.

Each kind of state has one source:

| State                                                              | Source                                               | Read it with                                 |
| ------------------------------------------------------------------ | ---------------------------------------------------- | -------------------------------------------- |
| What is planned, and each slice's status, branch, and pull request | the list below each slice heading of the plan        | `pnpm agent:status`, or the plan itself      |
| What has actually changed                                          | Git: branches, worktrees, commits, uncommitted files | `pnpm agent:status`, `git status`, `git log` |
| Whether it works                                                   | tests and mechanical checks                          | `pnpm verify`, `pnpm verify:full`, CI        |

Only the status in a plan is written by hand. Git and the checks are facts. When they disagree with the record, they win (see [Precedence](#precedence)), and the record is corrected.

A plan's own status is not stored. It follows from its slices, so the two cannot disagree. A slice's branch can also appear in the plan's optional `Ownership` section. The list below the slice's heading is the one that `pnpm agent:status` and `pnpm agent:check` read.

### Life of a Slice

1. `pending`: planned, not started.
2. `in-progress`: a session has started it on the named branch. It stays here through verification and review.
3. `done`: verification has passed and review found no blockers, recorded in the last commit before the merge, so `main` never shows a `done` slice that was not reviewed.

A slice can also be `blocked` or `dropped`. `docs/plans/README.md` defines the format. The Task State section of `.agents/rules/repository.md` has the rules for keeping a status current.

Status changes travel with the work. They are made on the branch that does the work, so `main` shows what has merged and a task branch shows that task's progress. Each slice keeps its status below its own heading, so slices that are worked on at the same time merge without conflicts. A session that ends in the middle of a slice leaves it `in-progress`, with the work on its branch or in its worktree, and the next session continues from there.

Agents commit only when asked, so uncommitted work and uncommitted status changes exist only in that checkout. A checkpoint that must outlive the checkout needs a commit. Ask for one before ending a session whose checkout will not be kept.

### `pnpm agent:status`

`scripts/agent-status.mjs` prints the current state. It runs Git commands that change nothing, and it reads Markdown. It never fetches and never edits a file. It needs no dependencies, but `pnpm` installs them before running any script, so in a checkout without `node_modules` run `node scripts/agent-status.mjs` directly. It shows:

- each plan in the checkout with the status of its slices, and progress that another active task has recorded but the checkout does not have yet
- active tasks: local branches with commits that `main` does not have, worktrees, and checkouts with no branch checked out, including their uncommitted files
- the shared hotspots each task changes, read from the Shared Hotspots table in `parallel-development.md`
- hotspots and other files that more than one active task changes
- notes where the record and Git disagree, such as a slice that is `in-progress` on a branch that does not exist

Branches are compared with the default branch of `origin` as last fetched, normally `origin/main`, or with the local `main` when there is no `origin`.

`--remote` adds the branches on `origin` as last fetched, such as open dependency updates. `--json` prints the same data for tools. Run it as `pnpm --silent agent:status --json`, so that pnpm prints nothing else.

It reports state and does not judge it, so it always succeeds and is not part of `pnpm verify`. Its output depends on local branches, which CI does not have. `pnpm agent:check` is the part that fails.

It sees one machine. Work that exists only in a checkout on another machine appears once its branch is pushed and fetched.

### Resuming

Every implementation session starts by orienting itself, as step 1 of `.agents/commands/implement.md`: read the state, check it against the repository, then continue, stop, or correct the record.

## Precedence

When guidance conflicts, apply this order, highest first:

1. `AGENTS.md` repository invariants
2. Relevant `docs/architecture/` documents
3. `.agents/rules/`
4. The relevant skill in `.agents/skills/`
5. Workflow guidance in `.agents/commands/`

Actual repository behavior, tests, and mechanical checks are not guidance. They are evidence of what the code does today, and they win over any prose that describes the code wrongly. They do not override an invariant: when the code contradicts `AGENTS.md`, the code is the defect. Stop and report it instead of following either.

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
2. Orient: read the recorded state and check it against the repository (see [Task State](#task-state))
3. Inspect the relevant code, architecture docs, rules, and skills
4. Plan (returned in the conversation, or saved to `docs/plans/<feature-name>.md` when requested)
5. Implement the smallest coherent change
6. Run targeted tests
7. Run `pnpm verify`
8. Run `pnpm verify:full` when required (see Verification)
9. Record the slice's status in the plan, when a plan covers the task
10. Review the diff
11. Report results; the user decides whether to commit

## Small Task Flow

A small, well-scoped change may skip a saved spec and plan, but not verification:

1. Check where the work stands (`pnpm agent:status`)
2. Inspect the relevant code
3. Implement
4. Verify
5. Review the diff

## Parallel Work

When several tasks run at the same time, each task uses its own branch and Git worktree, with one primary owner, and follows the `worktree-task` skill. The main checkout stays on `main` and coordinates. `pnpm agent:status` shows the active tasks and where they overlap. See `parallel-development.md`.

When no parallel work is active, the substantial and small task flows above can run in the current checkout.

## Durable Learning

Work on the repository produces knowledge that later tasks need. The loop is:

1. Implement.
2. Notice reusable, repository-specific knowledge: a constraint, a procedure, a failure mode, or an architectural fact.
3. Record it in the narrowest durable source that fits.
4. Enforce it mechanically when practical, in preference to more prose.

The Durable Knowledge section of `.agents/rules/repository.md` says which source fits which kind of knowledge, and when not to document at all.

## Verification

The Verification section of `AGENTS.md` is the one statement of what must run and when. `testing.md` describes what each command does and what the end-to-end tests need.

## Commits

No workflow, command, or skill commits automatically. `AGENTS.md` states the rule.
