# Production image for Coolify or any Docker host. Build from the repository
# root. See docs/architecture/deployment.md.

FROM node:24-alpine AS base
WORKDIR /app
COPY package.json ./
# One source for the pnpm version: the packageManager field.
RUN npm install -g "pnpm@$(node -p "require('./package.json').packageManager.split('@')[1]")"

FROM base AS build
# Fetch dependencies from the lockfile first, so this layer is reused until a
# dependency changes, whatever else changes in the repository.
COPY pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm fetch
COPY . .
RUN pnpm install --frozen-lockfile --offline

# Browser-visible values are inlined into the bundle at build time, so they
# arrive as build arguments. Empty keeps the integration off.
ARG NEXT_PUBLIC_SENTRY_DSN
ARG NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN
ARG NEXT_PUBLIC_POSTHOG_HOST
# Source-map upload needs these two plus the SENTRY_AUTH_TOKEN build secret
# (docker build --secret id=SENTRY_AUTH_TOKEN). Without the secret, upload is
# skipped and the build still succeeds.
ARG SENTRY_ORG
ARG SENTRY_PROJECT

# The build validates the required server variables but never reaches the
# database, so placeholders satisfy it here and never reach the image. The
# real values come from the host at runtime and are read at request time.
RUN --mount=type=secret,id=SENTRY_AUTH_TOKEN,env=SENTRY_AUTH_TOKEN \
    DATABASE_URL=postgresql://build:build@localhost:5432/build \
    BETTER_AUTH_SECRET=build-only-placeholder-that-is-long-enough \
    BETTER_AUTH_URL=http://localhost:3000 \
    pnpm --filter @startup/web build

FROM node:24-alpine
WORKDIR /app
ENV NODE_ENV=production \
    PORT=3000 \
    HOSTNAME=0.0.0.0
# The standalone output holds the server, the bundled workspace packages, and
# only the node_modules they need. Static assets are served by the same server.
COPY --from=build --chown=node:node /app/apps/web/.next/standalone ./
COPY --from=build --chown=node:node /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=build --chown=node:node /app/apps/web/public ./apps/web/public
# With RUN_MIGRATIONS=true, the server applies these before it accepts requests.
COPY --chown=node:node packages/db/drizzle ./packages/db/drizzle
USER node
EXPOSE 3000
CMD ["node", "apps/web/server.js"]
