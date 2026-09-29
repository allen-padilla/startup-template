# Review

Review the current working tree as if reviewing a pull request.

## Inspect

Run:

- `git status`
- `git diff --stat`
- `git diff`

Read relevant architecture docs and affected tests.

## Review For

### Correctness
- Does the implementation satisfy the requested behavior?
- Are error paths handled?
- Are edge cases obvious?

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

## Verification

Run:

`pnpm verify`

Run `pnpm verify:full` when appropriate.

## Output

Return findings ordered by severity:

- blocker
- important
- minor

Then report:

- verification results
- remaining risk
- whether the change is ready to commit

Do not modify files during review unless explicitly asked.