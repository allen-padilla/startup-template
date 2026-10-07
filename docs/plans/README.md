# Implementation Plans

Plans describe how to implement an approved spec or task as concrete repository changes.

Plans are implementation artifacts, not permanent architecture documentation. When an implementation changes the system's design, update `docs/architecture/` as well.

Plans are written only when explicitly requested; otherwise agents return plans in the conversation. Completed plans may be kept for historical context or removed when no longer useful.

## Naming

`docs/plans/<feature-name>.md`, using lowercase kebab-case. When a spec exists, use the same `<feature-name>` as the spec.

## Suggested Outline

- Goal and spec reference
- Existing system
- Changes (packages/files, implementation order)
- Data/API changes (schema, migrations, routes, public APIs, env vars)
- Tests
- Risks (including migration and rollout concerns)
- Verification

Omit sections that do not apply rather than leaving them empty.

## Status

A plan records where its work stands, so a new session does not depend on an earlier conversation. Each slice carries its status in a list directly below its heading:

```markdown
### Slice 2: Boards

- Status: in-progress
- Branch: `feat/feedbox-boards`
- Pull request: #34
```

- `Status` is required. It is `pending`, `in-progress`, `blocked`, `done`, or `dropped` (no longer needed).
- `Branch` is required while a slice is `in-progress`. Add `Pull request` once one exists.
- `Notes` is optional. Use it to say why a slice is `blocked`, or what is left.
- Slice headings are numbered, such as `Slice 1` or `Slice 2a`. Each number is used once.
- A plan that is not split into slices carries the same list directly below its title, and nowhere else.

The plan's own status is not written down. It follows from the slices: planned until a slice starts, done once every slice is `done` or `dropped`, and in progress in between. `pnpm agent:status` shows it.

Keep it current:

- Set a slice to `in-progress` when work on it starts. Set it to `done` only after its required verification passes.
- Change the status on the same branch as the work, so the state and the code merge together. `main` then shows what has merged, and a task branch shows its own progress. `pnpm agent:status` shows both.
- Change only the status of your own slice. Each status sits below its own heading, so slices that are worked on at the same time merge without conflicts.
- If the recorded status and the repository disagree, the repository is right. Correct the status and report the difference.

`pnpm agent:check` fails when a slice has no status directly below its heading, a status is not one of the values above, an `in-progress` slice names no branch, two headings name the same slice, a plan without slices has no status below its title, or a plan with slices also has one there. It checks the format, not whether the status is true. See `docs/architecture/agent-workflows.md`.

## Ownership

Larger or concurrent tasks may add an optional `Ownership` section, so parallel tasks can check for overlap:

- Branch:
- Worktree:
- Primary owner:
- Expected files:
- Shared hotspots:
- Coordination notes:

Trivial fixes do not need it. See `docs/architecture/parallel-development.md`.
