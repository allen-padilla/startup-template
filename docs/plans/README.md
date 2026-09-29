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

## Ownership

Larger or concurrent tasks may add an optional `Ownership` section, so parallel tasks can check for overlap:

- Branch:
- Worktree:
- Primary owner:
- Expected files:
- Shared hotspots:
- Coordination notes:

Trivial fixes do not need it. See `docs/architecture/parallel-development.md`.
