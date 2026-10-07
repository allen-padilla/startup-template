---
name: worktree-task
description: Use when implementing a task in a Git worktree, or whenever several agents or tasks are working on this repository at the same time.
---

# Worktree Task

Use this skill for a task that runs in its own worktree. The full workflow, including commands and rationale, is in `docs/architecture/parallel-development.md`.

## Before Starting

Run:

- `pwd`
- `git status`
- `git branch --show-current`
- `git worktree list`
- `pnpm agent:status`

Confirm:

- you are in the worktree assigned to this task, not the main checkout, unless no parallel work is active
- the branch is the task branch, created from the expected base (normally `main`)
- the assigned task and its scope
- no other active worktree or plan in `docs/plans/` owns the files or hotspots this task needs

`pnpm agent:status` lists the active tasks, the hotspots each one changes, the files more than one task changes, and the status of each plan's slices. It works before dependencies are installed. To see everything another active branch changes, run `git diff --stat main...<branch>`.

## Rules

- When parallel work is active, do not implement a task directly on `main`. Small tasks with no parallel work may still use the normal small-task flow in the main checkout.
- One worktree has one task and one primary owner.
- Do not broaden the task's scope or edit nearby files it does not need.
- Before changing a shared hotspot, check whether another active task owns it. The hotspots are listed in `docs/architecture/parallel-development.md`, and include `package.json`, `pnpm-lock.yaml`, `turbo.json`, `AGENTS.md`, `.env.example`, `packages/db/src/schema/*`, and `packages/db/drizzle/*`.
- If another active task needs the same hotspot, schema, or files, stop and report the overlap. Do not race it.
- Do not merge another feature branch into the task branch unless explicitly instructed.

## Setup

In a fresh worktree:

1. If `node_modules` is absent, run `pnpm install --frozen-lockfile`. pnpm reuses its global store, so this is fast.
2. `.env.local` is gitignored and is not copied into new worktrees. Make sure safe local values exist before running `pnpm verify`: create `.env.local` from `.env.example` with a freshly generated `BETTER_AUTH_SECRET`, or export disposable values.
3. Never copy, print, or log secret values from another checkout's `.env.local`. If the task needs real credentials, ask the owner to provide them.

## Sync

Before implementation, and when `main` moves:

- `git fetch origin`
- `git rebase origin/main` for a private task branch that no one else uses
- `git merge origin/main` instead when the branch is shared and rewriting its history would be unsafe

When resolving conflicts, inspect `git status` and keep the intent of both sides. If a conflict in schema files, migration SQL or metadata, `pnpm-lock.yaml`, or `AGENTS.md` is ambiguous, stop and report it instead of guessing.

## Database

- Follow the `database-migration` skill for any schema change, and confirm this task owns schema changes before running `pnpm db:generate` (see the Parallel Work rules in `.agents/rules/repository.md`).
- Never generate a migration independently from the same base as another active schema branch. If that branch lands first, rebase onto the updated `main` and regenerate this task's migration.
- All worktrees share the local PostgreSQL on port `5432`. `pnpm db:migrate` changes the database for every worktree, so migration work is serialized. Do not run `pnpm db:up` from a task worktree while the shared database is running.

## Dependencies

- `package.json` files and `pnpm-lock.yaml` are shared hotspots. Coordinate before changing them.
- After rebasing onto dependency changes, run `pnpm install` to regenerate the lockfile.
- Do not hand-edit lockfile conflict markers unless there is no alternative. Resolve the manifests, then regenerate the lockfile with `pnpm install`.

## Verification

Follow the normal implementation workflow in `.agents/commands/implement.md`:

1. targeted tests for the affected package
2. `pnpm verify`
3. `pnpm verify:full` when the canonical policy in `AGENTS.md` requires it

`pnpm verify` can run in several worktrees at once; E2E runs cannot (see the Parallel Work rules in `.agents/rules/repository.md`). If port `3000` is in use, report it. Do not stop another worktree's server.

## Completion

Follow the Completion section of `.agents/rules/repository.md`. In the report, also include any overlap, hotspot changes, and database state changes.

## Integration

- The task branch merges through the normal pull request workflow. Do not merge while CI checks are pending or failing.
- Do not merge into `main` directly from the worktree unless explicitly instructed.
- The coordinator removes the worktree after the merge. Never remove the worktree you are running inside.
