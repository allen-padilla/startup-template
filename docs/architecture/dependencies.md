# Dependencies

## Goals

Dependency management must:

- install the same versions locally and in CI
- keep each package's dependencies explicit
- make upgrades reviewable
- limit which packages may run code during installation

## Package Manager

Use pnpm only. Do not use npm, yarn, or bun to install or update dependencies.

The pnpm version is pinned in the root `package.json` (`packageManager` and `devEngines.packageManager`). Corepack installs that version. Change the pin deliberately, in its own change.

Only one lockfile and one workspace file exist, both in the repository root. Do not create a nested `pnpm-lock.yaml`, `pnpm-workspace.yaml`, `package-lock.json`, or `yarn.lock`.

## Placement

Dependencies belong in the package that imports them.

```bash
pnpm --filter @startup/<package> add <dependency>
pnpm --filter @startup/<package> add -D <dependency>
```

- A package must declare everything it imports. Do not rely on a dependency that another package happens to install.
- Do not install application or framework dependencies in the root `package.json` for convenience.
- The root holds only repository-wide tooling that is run from the root: currently `turbo` and `@playwright/test`.

## Internal Dependencies

Internal packages depend on each other with `workspace:*`:

```json
"@startup/env": "workspace:*"
```

Import internal packages through their public `exports` entry points. See `package-boundaries.md`.

## Version Specifiers

- Do not use `latest`, `*`, or other open-ended specifiers. `workspace:*` is the only exception.
- Do not depend on Git URLs, tarball URLs, or local file paths.
- Use caret ranges or exact versions. Pin exactly when packages must move together.
- Use the same specifier everywhere a dependency appears in more than one package.

## Aligned Versions

Some dependencies must change together:

| Dependencies                                 | Where                                   | Rule                                                        |
| -------------------------------------------- | --------------------------------------- | ----------------------------------------------------------- |
| `react`, `react-dom`                         | `apps/web`, `packages/ui`               | same exact version in both packages                         |
| `react` peer range                           | `packages/ui` `peerDependencies`        | must include the version `apps/web` installs                |
| `next`, `eslint-config-next`                 | `apps/web`                              | same exact version                                          |
| `@types/react`, `@types/react-dom`           | `apps/web`, `packages/ui`               | same major version as React                                 |
| `drizzle-orm`                                | `packages/db`, `packages/billing`       | same specifier                                              |
| `@types/node`                                | every package that uses it              | major version matches the Node.js version in `.node-version` |

React and Next.js are peers of each other. A Next.js release supports specific React versions, so check the supported range before upgrading either one.

## Upgrades

Dependabot (`.github/dependabot.yml`) discovers routine updates. It opens pull requests weekly for npm packages and GitHub Actions.

- Minor and patch npm updates arrive grouped in one pull request.
- Major updates arrive as separate pull requests. Review each as a breaking change: read the changelog, and run `pnpm verify:full`.
- `@types/node` major updates are ignored. Change that rule together with the Node.js version.
- `eslint` major updates are ignored. ESLint 10 removed APIs that plugins bundled by `eslint-config-next` still call, so `pnpm lint` fails. Remove the rule when `eslint-plugin-react`, `eslint-plugin-import`, and `eslint-plugin-jsx-a11y` support ESLint 10.
- `typescript` 7 and later is ignored. TypeScript 7.0 has no JavaScript API, which `typescript-eslint` requires, so `pnpm lint` fails. Remove the rule when `typescript-eslint` supports TypeScript 7. TypeScript 6 is not ignored.

An ignore rule is temporary. Each one states its removal condition in `.github/dependabot.yml`. Check those conditions when reviewing dependency updates. See Held Upgrades for the `eslint` and `typescript` rules.

Do not combine a major upgrade with feature work. Give it its own branch and pull request.

Update pull requests go through the same checks as any other change. Do not merge one with failing or pending checks.

## Held Upgrades

Two major upgrades are held because the lint setup does not support them yet. Both were last checked on 2026-09-29.

| Dependency   | Held at | Blocked by                                                              | Release condition                                  |
| ------------ | ------- | ----------------------------------------------------------------------- | -------------------------------------------------- |
| `eslint`     | 9.x     | `eslint-plugin-react`, `eslint-plugin-import`, `eslint-plugin-jsx-a11y` | each declares ESLint 10 in its `eslint` peer range |
| `typescript` | below 7 | `typescript-eslint`                                                     | its `typescript` peer range includes 7.x           |

A hold ends only when the installed dependency graph is clean:

- `pnpm peers check` reports no issues.
- No `--force`, peer dependency override, or pnpm peer rule hides an unsupported peer range.
- No rule is disabled, and lint coverage is not reduced, to make the upgrade pass.

When a release condition is met, upgrade in its own branch, run `pnpm verify:full`, and remove the matching ignore rule from `.github/dependabot.yml` in the same change.

### ESLint 10

ESLint 9 reached end of life on 2026-08-06. End this hold as soon as its release condition is met.

`eslint-config-next` bundles the three blocking plugins. Their latest releases accept ESLint 9 at most: `eslint-plugin-react` 7.37.5, `eslint-plugin-import` 2.32.0, and `eslint-plugin-jsx-a11y` 6.10.2. `eslint-config-next` 16.3.7 and 16.4.0-canary.52 depend on the same releases.

With ESLint 10 installed:

- `pnpm lint` crashes. While detecting the React version, `eslint-plugin-react` calls `context.getFilename()`, which ESLint 10 removed.
- Setting `settings.react.version` explicitly avoids that crash, and the default rule set then reports the same findings as under ESLint 9. It is not an accepted fix. `pnpm peers check` still reports three unmet peers, and these `eslint-plugin-react` rules still crash when enabled: `react/jsx-filename-extension`, `react/forward-ref-uses-ref`, `react/jsx-curly-spacing`, `react/jsx-tag-spacing`, and `react/jsx-equals-spacing`.

### TypeScript 7

TypeScript 7.0 has no JavaScript API. `typescript-eslint` needs one and refuses to load, so `pnpm lint` fails. Its latest release, 8.71.0, accepts `typescript` below 6.1.

Type checking, `next build`, and the tests pass on TypeScript 7. Only linting blocks the upgrade.

Do not install TypeScript 6 and TypeScript 7 side by side to work around this. `next build` runs the compiler from the package named `typescript`, so it would type-check with TypeScript 6 while `pnpm typecheck` used TypeScript 7.

When upgrading, set `target` and `lib` explicitly in `packages/typescript-config/base.json`. Both are unset there, and TypeScript 7 changes their defaults.

## Install Scripts

pnpm does not run a dependency's install scripts unless the dependency is approved. Approvals live in `allowBuilds` in `pnpm-workspace.yaml`.

- Do not disable this protection globally.
- Do not approve a package only to silence a warning. Approve it when the package needs its script to work, and set it to `false` when it does not.
- Review the `allowBuilds` diff when a change adds a dependency that has install scripts.

## Lockfile

`pnpm-lock.yaml` is generated. Do not edit it by hand.

- Commit lockfile changes together with the `package.json` changes that cause them.
- CI installs with `pnpm install --frozen-lockfile`, so a stale lockfile fails the pull request.
- Resolve a lockfile conflict by resolving the `package.json` files first, then running `pnpm install` to regenerate the lockfile. See `parallel-development.md`.

## Adding a Dependency

Before adding one, check that the existing stack does not already solve the problem.

Some dependencies have a single owning package. Do not import them anywhere else:

- `stripe`: `@startup/billing`
- `better-auth`: `@startup/auth`
- `drizzle-orm` and `pg`: `@startup/db`, plus the `@startup/billing` tests

Use the `add-package` skill when creating or restructuring a workspace package.
