#!/usr/bin/env bash
set -euo pipefail

# One-time local setup after cloning: dependencies, .env.local with a fresh
# secret, the local database and mail catcher, and the migrations.
#
# Safe to run again. An existing .env.local is kept; only an empty
# BETTER_AUTH_SECRET in it is filled in. No secret is ever printed.

cd "$(dirname "$0")/.."

readonly ENV_FILE=".env.local"

# Writes $1 from the template $2 with a freshly generated BETTER_AUTH_SECRET.
# The secret goes through the environment, not the command line, so it never
# appears in a process listing.
write_secret() {
  SECRET="$(node -e 'process.stdout.write(require("node:crypto").randomBytes(32).toString("base64"))')" \
  node -e '
    const fs = require("node:fs");
    const [target, template] = process.argv.slice(1);
    const line = `BETTER_AUTH_SECRET=${process.env.SECRET}`;
    const text = fs.readFileSync(template, "utf8");
    const filled = /^BETTER_AUTH_SECRET=.*$/m.test(text)
      ? text.replace(/^BETTER_AUTH_SECRET=.*$/m, line)
      : `${text.replace(/\n*$/, "\n")}${line}\n`;
    fs.writeFileSync(target, filled, { mode: 0o600 });
  ' "$1" "$2"
}

echo "Installing dependencies"
pnpm install --frozen-lockfile

if [ ! -f "$ENV_FILE" ]; then
  echo "Creating $ENV_FILE from .env.example with a generated BETTER_AUTH_SECRET"
  write_secret "$ENV_FILE" .env.example
elif grep -Eq '^BETTER_AUTH_SECRET=[[:space:]]*$' "$ENV_FILE" || ! grep -q '^BETTER_AUTH_SECRET=' "$ENV_FILE"; then
  echo "Filling in the empty BETTER_AUTH_SECRET in the existing $ENV_FILE"
  write_secret "$ENV_FILE" "$ENV_FILE"
else
  echo "Keeping the existing $ENV_FILE"
fi

echo "Starting PostgreSQL and Mailpit"
pnpm db:up

echo "Applying migrations"
pnpm db:migrate

echo
./scripts/check-environment.sh

echo
echo "Ready. Start the application with: pnpm dev"
