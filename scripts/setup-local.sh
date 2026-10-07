#!/usr/bin/env bash
set -euo pipefail

# One-time local setup after cloning: dependencies, .env.local with a fresh
# secret, the local database and mail catcher, and the migrations.
#
# Safe to run again. An existing .env.local is kept; only an empty
# BETTER_AUTH_SECRET in it is filled in. No secret is ever printed.

cd "$(dirname "$0")/.."

readonly ENV_FILE=".env.local"

echo "Installing dependencies"
pnpm install --frozen-lockfile

# The secret is generated and written inside that script, so it never passes
# through the shell.
case "$(node scripts/ensure-env-secret.mjs "$ENV_FILE" .env.example)" in
  created) echo "Created $ENV_FILE from .env.example with a generated BETTER_AUTH_SECRET" ;;
  filled) echo "Filled in the empty BETTER_AUTH_SECRET in the existing $ENV_FILE" ;;
  *) echo "Keeping the existing $ENV_FILE" ;;
esac

echo "Starting PostgreSQL and Mailpit"
pnpm db:up

echo "Applying migrations"
pnpm db:migrate

echo
./scripts/check-environment.sh

echo
echo "Ready. Start the application with: pnpm dev"
