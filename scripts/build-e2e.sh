#!/usr/bin/env bash
# Builds @startup/web for E2E runs. Sentry and PostHog point at the
# observability stub that Playwright starts (tests/e2e/support/
# observability-stub.ts), so E2E runs never report to real projects, even when
# .env.local sets other values. NEXT_PUBLIC_* values are inlined at build time.
# See docs/architecture/testing.md.
set -euo pipefail

cd "$(dirname "$0")/.."

export NEXT_PUBLIC_SENTRY_DSN="http://e2e@127.0.0.1:9999/1"
export NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN="phc_e2e"
export NEXT_PUBLIC_POSTHOG_HOST="http://127.0.0.1:9999"

exec pnpm --filter @startup/web build
