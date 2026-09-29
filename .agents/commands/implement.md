# Implement

Use this workflow for normal implementation tasks.

## 1. Understand

Read:

- `AGENTS.md`
- relevant files
- relevant `docs/architecture/*`
- relevant `.agents/skills/*`

Determine:

- existing patterns
- package boundaries
- required tests
- affected architecture

## 2. Plan

Before editing, state:

- files likely to change
- approach
- tests required
- risks or unknowns

Keep the plan concise.

## 3. Implement

Make the smallest coherent change that satisfies the task.

Do not:

- redesign unrelated systems
- weaken validation
- bypass architecture boundaries
- add unrelated dependencies

## 4. Test

Run targeted tests first.

Then run:

`pnpm verify`

For significant application behavior, also run:

`pnpm verify:full`

## 5. Review

Inspect:

`git diff`

Check for:

- unrelated edits
- generated junk
- secret exposure
- missing tests
- broken boundaries

## 6. Report

Return:

- what changed
- files changed
- tests run
- verification results
- remaining concerns
- whether the task is complete

Do not commit unless explicitly requested.