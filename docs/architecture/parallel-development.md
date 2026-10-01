# Parallel Development

## Purpose

Several coding agents, or an agent and a human, may work on this repository at the same time. Git worktrees give each concurrent task its own checkout, so agents never edit the same working tree or overwrite each other's uncommitted changes.

This document covers how concurrent tasks are isolated, owned, kept up to date, integrated, and cleaned up. It uses plain Git. No helper scripts or orchestration tools are required.

## Core Model

When parallel work is active, each task has:

- one branch
- one worktree
- one primary owner

The owner is the agent or person responsible for the task's changes. Other tasks do not edit that worktree.

When no parallel work is active, a small, well-scoped task may still use the normal small-task flow in the main checkout. See `agent-workflows.md`.

## Main Checkout as Coordinator

The main checkout, `~/dev/startup-template`, stays on `main`. Once several tasks are running at the same time, it is used primarily for:

- updating `main`
- creating worktrees
- reviewing task branches
- coordinating ownership of shared files
- merging pull requests
- cleaning up worktrees

Feature implementation happens in task worktrees. This keeps `main` clean and makes the main checkout a stable place to review and integrate from.

## Worktree Location

Worktrees live in `~/dev/worktrees/`, outside the main checkout:

`~/dev/worktrees/startup-template-<task>`

For example, `~/dev/worktrees/startup-template-profile-settings`.

Never create a worktree inside `~/dev/startup-template`. A nested worktree shows up as untracked files in the main checkout and can be scanned by repository tooling.

## Branch Naming

Use a short prefix that describes the change:

- `feat/<task>`
- `fix/<task>`
- `chore/<task>`
- `docs/<task>`

Use the same `<task>` in the branch and worktree names, so each worktree maps to its branch at a glance.

## Creating a Worktree

From the main checkout:

```bash
cd ~/dev/startup-template
git switch main
git pull

git worktree add -b feat/<task> \
  ~/dev/worktrees/startup-template-<task> \
  main

git worktree list
```

- Create task branches from an up-to-date `main`.
- Do not use `--force`. If the branch or path already exists, Git refuses; find out why instead of overriding it.
- Do not reuse or overwrite an existing worktree path.

## Fresh Worktree Setup

### Dependencies

Each worktree has its own `node_modules`. After creating a worktree, install from its root:

```bash
pnpm install --frozen-lockfile
```

pnpm hard-links packages from its global content-addressable store, so installing into a new worktree is fast and uses little extra disk space. Do not symlink `node_modules` directories between checkouts.

### Environment

`.env.local` is gitignored, so a new worktree does not have one. Without it, `pnpm verify` fails at the production build step because `@startup/env` rejects the missing required variables.

Before verifying, provide safe local values in the worktree, either:

- create `.env.local` from `.env.example` and fill in the required values, generating a new `BETTER_AUTH_SECRET` with `openssl rand -base64 32`, or
- export disposable values for the session, such as the CI values in `continuous-integration.md`.

Optional integrations (Stripe, Sentry, PostHog) can stay unset.

Agents must not copy, print, or log secret values from another checkout's `.env.local`. If a task needs real credentials, such as Stripe test-mode keys, the owner provides them.

## Ownership and Overlap

Before editing, the task owner checks for overlap:

- `git worktree list` for active tasks
- relevant plans in `docs/plans/`
- the files other active branches change, when needed: `git diff --stat main...<branch>`
- whether another task already owns a shared hotspot the task needs

If two active tasks need the same hotspot, schema, or files:

1. stop
2. report the overlap
3. agree on which task owns the change
4. let the other task wait or rebase after it lands

Do not race another task to the same files.

## Shared Hotspots

These files are shared by the whole repository. Concurrent edits conflict easily or are hard to merge correctly:

| Path                         | Why it needs coordination                                     |
| ---------------------------- | ------------------------------------------------------------- |
| `package.json`               | root scripts and dependencies used by every package and CI    |
| `pnpm-lock.yaml`             | generated from all manifests; conflicts are hard to hand-merge |
| `pnpm-workspace.yaml`        | workspace membership and allowed install scripts              |
| `turbo.json`                 | task graph, caching, and environment pass-through             |
| `AGENTS.md`                  | repository-wide agent invariants, plus a tool-managed block    |
| `.env.example`               | the documented environment contract                           |
| `packages/db/src/schema/*`   | the database schema that migrations are generated from         |
| `packages/db/drizzle/*`      | ordered migrations and generated snapshot metadata            |
| `apps/web/next.config.ts`    | build, environment loading, and Sentry configuration          |

Only one active task should change a hotspot at a time. When a task must touch one, say so in its plan or report.

## Lower-Conflict Areas

These usually run in parallel safely:

- separate feature directories or routes
- different packages
- separate documentation files
- separate test files

Parallel tasks still conflict when they both change a shared file, even in these areas.

## Updating from Main

For a private task branch that no one else has checked out or built on:

```bash
git fetch origin
git rebase origin/main
```

For a branch already shared with other people or agents, merge instead, so their history is not rewritten:

```bash
git fetch origin
git merge origin/main
```

Do not merge another feature branch into a task branch unless explicitly instructed.

If a conflict happens:

- inspect `git status` and the conflicting changes
- resolve each conflict deliberately, keeping the intent of both sides
- do not resolve architectural conflicts by picking one side blindly

If a conflict in a hotspot is ambiguous, stop and report it instead of guessing. This applies especially to:

- migration SQL and `packages/db/drizzle/meta/*`
- schema files
- `pnpm-lock.yaml`
- `AGENTS.md`

Re-run `pnpm install --frozen-lockfile` and `pnpm verify` after updating.

## Database Migration Ownership

Only one active task or worktree may own schema and migration changes at a time.

Drizzle numbers migrations in sequence and records each one in `packages/db/drizzle/meta/_journal.json` with a schema snapshot. Two branches that run `pnpm db:generate` from the same base both create the next migration number. Each branch's snapshot also assumes it is the only change, and the journal entries conflict. Merging both produces colliding or inconsistent migration history, even when Git reports no text conflict.

To avoid this:

1. Serialize schema-changing tasks, or designate one schema owner when several tasks need schema changes.
2. Land the owner's schema change on `main` first.
3. Rebase or merge the second task onto the updated `main`.
4. Discard the second task's generated migration by restoring `packages/db/drizzle/` to the updated `main` version, then run `pnpm db:generate` again from the new base. Do not hand-merge migration files or journal entries.

If the discarded migration was already applied to the shared local database, report it. The local schema no longer matches the committed migrations.

Follow the `database-migration` skill for the migration itself.

### Shared Local Database

All worktrees currently use the same local PostgreSQL service on `localhost:5432` and the same Mailpit mail catcher on `localhost:1025` and `localhost:8025`, from the main checkout's Docker Compose project. Messages from every worktree arrive in the same Mailpit inbox.

- Running `pnpm db:migrate` in one worktree changes the database every other worktree uses.
- Do not run migration work from more than one worktree at a time against the shared local database.
- Do not run `pnpm db:up` from task worktrees while the main checkout's database is running. Docker Compose names the project after the directory, so it would start second PostgreSQL and Mailpit containers that fail to bind their ports.
- Coordinate database work explicitly, and report when a local database contains migrations from an unmerged branch.

## Lockfile and Dependency Coordination

`pnpm-lock.yaml` is generated from every `package.json` in the workspace, so it is a shared hotspot.

- Avoid running several dependency-heavy tasks at the same time when practical.
- If two branches change package manifests, land one first, then rebase or merge the other onto the updated `main`.
- After rebasing, run `pnpm install` to regenerate the lockfile from the combined manifests, then commit the result with the manifest changes.
- Prefer regenerating the lockfile over hand-editing conflict markers. When a rebase stops on a lockfile conflict, resolve the `package.json` conflicts first, then take either side of `pnpm-lock.yaml` and run `pnpm install` to rebuild it.

CI installs with `--frozen-lockfile`, so a stale lockfile fails the pull request.

## Ports and End-to-End Tests

Playwright starts the production server on `127.0.0.1:3000` and sets `reuseExistingServer: false`. The E2E environment's `BETTER_AUTH_URL` also assumes port `3000`, and E2E runs use the shared local database.

- Only one `pnpm test:e2e` or `pnpm verify:full` run at a time may own port `3000`.
- Serialize concurrent E2E runs until the test infrastructure is made port-aware.
- This is a deliberate, safe limitation. A second concurrent run fails loudly because the port is taken. It does not silently test another worktree's server.

`pnpm verify` needs no port or database, so it can run in several worktrees at once.

Interactive dev servers in several worktrees need distinct ports. Each worktree's `BETTER_AUTH_URL` must match the port that worktree's server uses.

## Pull Request Integration

Each task integrates through the normal pull request workflow:

1. Implement and verify in the task worktree.
2. Commit only when explicitly requested.
3. Push the task branch.
4. Open a pull request into `main`.
5. CI runs Verify and Playwright. See `continuous-integration.md`.
6. Review.
7. Merge.
8. Clean up the worktree.

Branch protection is not available on the current private-repository plan, so GitHub does not enforce the required checks. Do not merge while checks are pending or failing. This rule is manual until GitHub enforcement becomes available.

Do not merge a task branch directly into `main` from a worktree unless explicitly instructed.

## Reviewing from the Coordinator

The coordinator can review a task branch without entering its worktree:

```bash
git diff --stat main...feat/<task>
git diff main...feat/<task>
git log --oneline main..feat/<task>
```

Use the repository `review` command (`.agents/commands/review.md`) or the `reviewer` role for a full review. Verification reflects the checked-out working tree, so run `pnpm verify` inside the task worktree, not in the main checkout.

## Cleanup

After the pull request is merged, clean up from the main checkout:

```bash
cd ~/dev/startup-template
git switch main
git pull

git worktree remove ~/dev/worktrees/startup-template-<task>
git worktree prune
git worktree list
```

Then delete the merged local branch with `git branch -d feat/<task>`.

- Do not use `--force` by default.
- `git worktree remove` refuses when the worktree has modified or untracked files. Inspect them before deciding what to do. They may be unfinished work.
- `git branch -d` refuses to delete an unmerged branch. Do not switch to `-D` without confirming the work is not needed. After a squash merge, verify that the pull request is merged before using `-D`.
- Do not remove a worktree while an agent is still running inside it. An agent never removes its own worktree.
