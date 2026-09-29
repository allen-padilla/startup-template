# Plan

Create an implementation plan. Planning is read-only: do not modify files unless explicitly asked to save the plan.

## Read

- `AGENTS.md`
- `.agents/rules/repository.md`
- the relevant spec in `docs/specs/<feature-name>.md`, when one exists
- relevant architecture docs
- relevant source code
- relevant tests
- relevant skills

If a spec exists, the plan must satisfy it. If the spec conflicts with repository architecture or current behavior, report the conflict instead of silently deviating.

## Output

Return the plan with these sections.

### Goal

What needs to change, referencing the spec when one exists.

### Existing System

What currently exists that matters.

### Proposed Changes

For each change:

- file/package
- responsibility
- reason

### Data / API Changes

Any schema changes, migrations, routes, public package APIs, or environment variables. Write "None" when there are none.

### Tests

What should be added or updated.

### Risks

Potential failure modes or compatibility concerns.

### Verification

Commands that should be run: targeted tests, `pnpm verify`, and `pnpm verify:full` when the change affects significant application behavior or complete user workflows.

## Saving a Plan

- By default, return the plan in the response without modifying files.
- Write a plan file only when the user explicitly asks to create or save one. Save it as `docs/plans/<feature-name>.md` (lowercase kebab-case), following `docs/plans/README.md`.

Do not implement unless explicitly asked.
