# Implement

Use this workflow for normal implementation tasks.

## 1. Orient

Find out where the work stands before reading code. A new session starts from the recorded state, not from an earlier conversation.

Run:

- `pnpm agent:status`
- `git status`
- `git log --oneline main..HEAD`

Determine:

- which plan in `docs/plans/` and which slice the task belongs to, when a plan covers it
- that slice's recorded status, branch, and pull request, from the list below its heading in the plan (see `docs/plans/README.md`)
- whether this checkout already holds work on it, as commits on the branch or as uncommitted changes
- whether another active task changes the same files or hotspots

Then check the record against the repository:

- The slice is `in-progress` and this checkout holds work on it: continue that work. Read the existing changes first. Do not start over.
- The slice is `in-progress` on another branch or in another worktree: stop and report it. Another task owns it.
- The slice is `done`: do not redo it. Report it and ask what is wanted.
- The record and the repository disagree: the repository is right. Correct the recorded status and report the difference.

When the task starts a slice, set its status to `in-progress` and add the branch name.

A task that no plan covers has no status to update. Still run the commands above.

## 2. Understand

Read:

- `AGENTS.md`
- `.agents/rules/repository.md`
- the relevant spec in `docs/specs/`, when one exists
- the approved plan in `docs/plans/`, when one exists
- relevant files
- relevant `docs/architecture/*`
- relevant `.agents/skills/*`

Determine:

- existing patterns
- package boundaries
- required tests
- affected architecture

The implementation should satisfy the spec and plan, but repository architecture and tests remain authoritative. Do not silently change a spec or plan. If reality requires deviating from it, stop and report the mismatch before proceeding. Updating a slice's status in a plan is expected and is not a deviation.

## 3. Plan

Before editing, state:

- files likely to change
- approach
- tests required
- risks or unknowns

Keep the plan concise. When an approved plan already exists, confirm it still matches the code instead of re-planning.

## 4. Implement

Make the smallest coherent change that satisfies the task. Follow the matching skill when one applies.

Do not:

- redesign unrelated systems
- weaken validation
- bypass architecture boundaries
- add unrelated dependencies

## 5. Test

Run targeted tests first.

Then run:

`pnpm verify`

`pnpm verify` is required before considering implementation complete. Also run `pnpm verify:full` for changes affecting significant application behavior or complete user workflows, including authentication, billing, routing, and other cross-system or user-facing behavior. Documentation-only changes do not require it.

## 6. Record

When the task implements a plan slice and its required verification has passed:

- set the slice's status to `done` in the plan, and add the pull request once it exists
- run `pnpm agent:check`, because the plan changed after `pnpm verify`

Do not mark a slice `done` before its verification passes. If the session ends first, leave the slice `in-progress`, so the next session continues from the right place.

## 7. Review

Inspect:

- `git status`
- `git diff --stat`
- `git diff`

Check for:

- unrelated edits
- generated junk
- secret exposure
- missing tests
- broken boundaries
- stale documentation

## 8. Report

Return:

- what changed
- files changed
- tests run
- verification results
- the status of the plan's slices after this task, when a plan covers it
- deviations from the spec or plan, if any
- remaining concerns
- whether the task is complete

Do not commit unless explicitly requested.
