#!/usr/bin/env bash
set -euo pipefail

# One-time local setup after cloning: dependencies, .env.local with a fresh
# secret, the local database and mail catcher, and the migrations.
#
# Safe to run again. It never overwrites an existing .env.local and never
# prints a secret.

cd "$(dirname "$0")/.."

readonly ENV_FILE=".env.local"

echo "Installing dependencies"
pnpm install --frozen-lockfile

if [ -f "$ENV_FILE" ]; then
  echo "Keeping the existing $ENV_FILE"
else
  echo "Creating $ENV_FILE from .env.example with a generated BETTER_AUTH_SECRET"
  secret="$(node -e 'process.stdout.write(require("node:crypto").randomBytes(32).toString("base64"))')"
  # The secret goes through the environment, not the command line, so it
  # never appears in a process listing.
  SECRET="$secret" node -e '
    const fs = require("node:fs");
    const example = fs.readFileSync(".env.example", "utf8");
    const local = example.replace(/^BETTER_AUTH_SECRET=.*$/m, `BETTER_AUTH_SECRET=${process.env.SECRET}`);
    fs.writeFileSync(process.argv[1], local, { mode: 0o600 });
  ' "$ENV_FILE"
  unset secret
fi

echo "Starting PostgreSQL and Mailpit"
pnpm db:up

echo "Applying migrations"
pnpm db:migrate

echo
./scripts/check-environment.sh

echo
echo "Ready. Start the application with: pnpm dev"
