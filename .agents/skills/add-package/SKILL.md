---
name: add-package
description: Create a new @startup/* workspace package under packages/, or restructure an existing package's manifest, exports, or dependencies.
---

# Add Package

Use this skill whenever a task creates a new shared workspace package or changes an existing package's `package.json`, public exports, or internal dependencies.

## Source of truth

- `pnpm-workspace.yaml` — workspace globs (`apps/*`, `packages/*`)
- `packages/*/package.json` — existing package conventions
- `packages/typescript-config/` — shared TypeScript configuration (`base.json`, `nextjs.json`)
- `turbo.json` — task graph
- `docs/architecture/package-boundaries.md` — dependency direction and the "Current Packages" list

## Current conventions

Inspect `packages/env`, `packages/billing`, and `packages/ui` before choosing a shape. At the time of writing, packages:

- are named `@startup/<name>` and live in `packages/<name>/`
- are `"private": true`, `"version": "0.0.0"`, `"type": "module"`
- ship TypeScript source with no build step: `exports` maps entry points directly to `./src/*.ts`
- expose a `.` entry point and add subpath entry points only for a distinct audience, such as `./client` for browser-safe code or `./next` for Next.js adapters
- have a `tsconfig.json` that extends `@startup/typescript-config/base.json` with `noEmit: true`
- define `typecheck: tsc --noEmit`, and `test: vitest run` only when they contain tests

If an existing package does something differently, follow the existing package and report the discrepancy.

## Procedure

1. Confirm a new package is justified.
   - Use one for a reusable capability or shared infrastructure that more than one surface needs, or that must be isolated (for example, server-only code that owns a third-party SDK).
   - Otherwise, extend an existing package or keep the code in the app.

2. Choose placement and name: `packages/<name>/`, package name `@startup/<name>`.

3. Create `package.json` following the current conventions above.
   - Define intentional `exports`. Consumers import only from those entry points, never from `@startup/<name>/src/...`.
   - Keep server-only and browser-safe code in separate entry points when both exist.

4. Declare dependencies in the package that imports them.
   - Internal packages use `"@startup/<other>": "workspace:*"`.
   - Add `@startup/typescript-config` (`workspace:*`), `typescript`, and any `@types/*` to `devDependencies`.
   - Install from the root with a filter, for example:

     `pnpm --filter @startup/<name> add <dependency>`

   - Do not add runtime dependencies to the root `package.json`.
   - Packages must never depend on `apps/*` or import application code.
   - Do not add dependencies that need install scripts without reviewing `allowBuilds` in `pnpm-workspace.yaml`. Never disable build-script protection globally.

5. Create `tsconfig.json` extending `@startup/typescript-config/base.json`, with `noEmit: true` and `include` covering `src/`. Server packages add `"types": ["node"]` (see `packages/env/tsconfig.json`). Add `jsx` and DOM `lib` settings only for React packages (see `packages/ui/tsconfig.json`).

6. Add scripts that Turbo will pick up by name.
   - Always add `typecheck`.
   - Add `test` only when the package has tests. If the tests import `@startup/env` directly or indirectly, provide a deterministic test env in `vitest.config.ts` (see `packages/billing/vitest.config.ts`).
   - Do not add placeholder scripts, and do not add `turbo.json` entries or `outputs` for tasks that produce no artifacts.

7. Wire consumers.
   - Add `"@startup/<name>": "workspace:*"` to each consumer's `package.json` and run `pnpm install` from the root.
   - Import only through the public entry points.

8. Update documentation.
   - Add the package to "Current Packages" in `docs/architecture/package-boundaries.md`, covering its purpose, entry points, server-only vs browser-safe status, and internal dependencies.
   - Add a new `docs/architecture/<subsystem>.md` only when the package introduces a genuinely new architectural subsystem.

9. Run package-level checks:

   `pnpm --filter @startup/<name> typecheck`

   `pnpm --filter @startup/<name> test` (when tests exist)

10. Inspect dependency placement.
    - Review `git diff pnpm-lock.yaml package.json packages/*/package.json apps/*/package.json`.
    - Check for dependencies accidentally added to the root, duplicated across packages without need, or added with mismatched versions of an existing dependency.

11. Run:

    `pnpm verify`

    Also run `pnpm verify:full` when the package changes significant application behavior or complete user workflows, including authentication, billing, routing, and other cross-system or user-facing behavior.

## Report

- package name, location, and entry points
- dependencies added and where
- consumers updated
- docs updated
- package-level and repository verification results
- remaining concerns
