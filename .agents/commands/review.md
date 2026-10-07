# Review

Review a change as if reviewing a pull request.

Do not modify files during review unless explicitly asked.

## Identify the Target

Determine what is being reviewed. Do not assume every review is of uncommitted changes. If the target is unclear, ask.

### Uncommitted working tree

- `git status`
- `git diff --stat`
- `git diff`

Include staged changes with `git diff --cached` when relevant.

### A specific commit

- `git show --stat <commit>`
- `git show <commit>`

### A branch or range

- `git diff --stat <base>...<head>`
- `git diff <base>...<head>`
- `git log --oneline <base>..<head>`

Then read the relevant spec or plan when one exists, the relevant architecture docs, and the affected tests.

## Review For

### Correctness
- Does the implementation satisfy the requested behavior, spec, or plan?
- Are error paths handled?
- Are edge cases covered?

### Architecture
- Are package boundaries respected?
- Is logic located in the right package?
- Is server-only code kept off the client?

### Security
- Are secrets protected?
- Are authenticated actions actually authenticated?
- Is user-controlled input trusted incorrectly?
- Are webhook/signature boundaries preserved?

### Data
- Are DB changes migration-backed?
- Are uniqueness/idempotency constraints appropriate?
- Could changes cause data loss?

### Testing
- Are meaningful tests present?
- Were tests weakened?
- Is important behavior untested?

### Maintenance
- Is code unnecessarily clever?
- Are there duplicate abstractions?
- Is documentation now stale?
- When the change implements a plan slice, does the status recorded for that slice in the plan match what the change actually does? A slice is `done` only when verification has passed and the review found no blockers (see the Task State section of `.agents/rules/repository.md`).

## Verification

Run:

`pnpm verify`

Also run `pnpm verify:full` when the Verification section of `AGENTS.md` requires it.

Verification reflects the checked-out working tree. When reviewing a commit or branch that is not checked out, say so rather than reporting unrelated results.

## Output

Return findings ordered by severity:

- blocker
- important
- minor

Then report:

- review target
- verification results
- remaining risk
- whether the change is ready to commit or merge
