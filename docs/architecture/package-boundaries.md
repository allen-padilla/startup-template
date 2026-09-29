# Package Boundaries

## Applications

`apps/` contains deployable applications.

Applications may depend on packages.

Packages must not depend on applications.

## Packages

`packages/` contains reusable capabilities and shared infrastructure.

Packages should expose intentional public APIs rather than requiring consumers to import arbitrary internal files.

## Dependency Direction

Allowed:

packages → external dependencies

apps → packages → external dependencies

Not allowed:

packages → apps

## Current Packages

### @startup/typescript-config

Shared TypeScript configuration for the repository.

This package contains configuration only and must not contain application runtime code.

### @startup/ui

Shared React UI components and design-system primitives.

Applications may depend on this package.

The package must not depend on application code.

Consumers should import from the package's public API rather than internal source paths.

Shared UI primitives belong here when they are reusable across application surfaces.