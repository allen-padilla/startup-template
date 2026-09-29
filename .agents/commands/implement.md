# Implement

Use this workflow for normal implementation tasks.

## 1. Understand

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

The implementation should satisfy the spec and plan, but repository architecture and tests remain authoritative. Do not silently change a spec or plan. If reality requires deviating from it, stop and report the mismatch before proceeding.

## 2. Plan

Before editing, state:

- files likely to change
- approach
- tests required
- risks or unknowns

Keep the plan concise. When an approved plan already exists, confirm it still matches the code instead of re-planning.

## 3. Implement

Make the smallest coherent change that satisfies the task. Follow the matching skill when one applies.

Do not:

- redesign unrelated systems
- weaken validation
- bypass architecture boundaries
- add unrelated dependencies

## 4. Test

Run targeted tests first.

Then run:

`pnpm verify`

`pnpm verify` is required before considering implementation complete. Also run `pnpm verify:full` for changes affecting significant application behavior or complete user workflows, including authentication, billing, routing, and other cross-system or user-facing behavior. Documentation-only changes do not require it.

## 5. Review

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

## 6. Report

Return:

- what changed
- files changed
- tests run
- verification results
- deviations from the spec or plan, if any
- remaining concerns
- whether the task is complete

Do not commit unless explicitly requested.
