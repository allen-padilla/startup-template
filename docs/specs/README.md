# Feature Specs

Specs describe what should happen: desired product or system behavior, agreed before implementation.

Use a spec when a task is large enough that behavior should be agreed on before code changes. Small, well-scoped changes do not need one.

Specs should avoid prescribing implementation details unless those details are architectural requirements. How the behavior will be built belongs in a plan (`docs/plans/`); long-lived system design belongs in `docs/architecture/`.

## Naming

`docs/specs/<feature-name>.md`, using lowercase kebab-case (for example `docs/specs/team-invitations.md`).

## Suggested Outline

- Problem
- Goals
- Non-goals
- Behavior (user and system)
- Edge cases
- Security/privacy
- Acceptance criteria

Omit sections that do not apply rather than leaving them empty.
