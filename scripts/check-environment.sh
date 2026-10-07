#!/usr/bin/env bash
set -euo pipefail

# Read-only preflight for local development.
#
# Checks the toolchain and the required environment variables. It never
# changes anything and never prints a variable's value.
#
# Required variables are read from the shell environment first, then from
# .env.local, so the check also works for CI-style runs that export values
# instead of using a file.

cd "$(dirname "$0")/.."

readonly REQUIRED_NODE_MAJOR=24
readonly ENV_FILE=".env.local"

failures=0
warnings=0

pass() { printf '  ok    %s\n' "$1"; }
warn() {
  printf '  warn  %s\n' "$1"
  warnings=$((warnings + 1))
}
fail() {
  printf '  FAIL  %s\n' "$1"
  failures=$((failures + 1))
}

# Prints the value of a variable from the shell environment or .env.local.
# Callers must capture the output and never echo it.
read_value() {
  local name="$1"
  local value="${!name:-}"

  if [ -z "$value" ] && [ -f "$ENV_FILE" ]; then
    value="$(sed -n "s/^[[:space:]]*\(export[[:space:]]\{1,\}\)\{0,1\}${name}=//p" "$ENV_FILE" | tail -n 1)"
    value="${value%$'\r'}"
    value="${value%\"}"
    value="${value#\"}"
    value="${value%\'}"
    value="${value#\'}"
  fi

  printf '%s' "$value"
}

echo "Toolchain"

if command -v node >/dev/null 2>&1; then
  node_major="$(node -p 'process.versions.node.split(".")[0]')"
  if [ "$node_major" = "$REQUIRED_NODE_MAJOR" ]; then
    pass "Node.js $REQUIRED_NODE_MAJOR"
  else
    fail "Node.js $REQUIRED_NODE_MAJOR is required, found major version $node_major"
  fi
else
  fail "Node.js is not installed (version $REQUIRED_NODE_MAJOR is required)"
fi

if command -v pnpm >/dev/null 2>&1; then
  pass "pnpm is available"
else
  fail "pnpm is not available. Install it once (for example: npm install -g pnpm). See https://pnpm.io/installation"
fi

if [ -d node_modules ]; then
  pass "dependencies are installed"
else
  fail "dependencies are not installed. Run: pnpm install --frozen-lockfile"
fi

echo "Environment"

if [ -f "$ENV_FILE" ]; then
  pass "$ENV_FILE exists"
else
  warn "$ENV_FILE is missing. Run: cp .env.example $ENV_FILE (or export the required variables)"
fi

for name in DATABASE_URL BETTER_AUTH_URL; do
  if [ -n "$(read_value "$name")" ]; then
    pass "$name is set"
  else
    fail "$name is not set"
  fi
done

secret="$(read_value BETTER_AUTH_SECRET)"
if [ -z "$secret" ]; then
  fail "BETTER_AUTH_SECRET is not set. Generate one with: openssl rand -base64 32"
elif [ "${#secret}" -lt 32 ]; then
  fail "BETTER_AUTH_SECRET is shorter than 32 characters"
else
  pass "BETTER_AUTH_SECRET is set"
fi
unset secret

echo "Email"

# Optional, but both or neither: @startup/env rejects only one of them.
smtp_url_set=""
email_from_set=""
[ -n "$(read_value SMTP_URL)" ] && smtp_url_set=1
[ -n "$(read_value EMAIL_FROM)" ] && email_from_set=1

if [ -n "$smtp_url_set" ] && [ -n "$email_from_set" ]; then
  pass "SMTP_URL and EMAIL_FROM are set"
elif [ -n "$smtp_url_set" ]; then
  fail "SMTP_URL is set without EMAIL_FROM. Set both, or leave both empty to disable email"
elif [ -n "$email_from_set" ]; then
  fail "EMAIL_FROM is set without SMTP_URL. Set both, or leave both empty to disable email"
else
  pass "email is disabled (SMTP_URL and EMAIL_FROM are empty)"
fi

echo "Database"

case "$(read_value DATABASE_URL)" in
  *@localhost[:/]* | *@127.0.0.1[:/]*)
    if ! command -v docker >/dev/null 2>&1; then
      warn "DATABASE_URL is local but Docker is not installed. pnpm db:up needs Docker or a compatible runtime"
    elif ! docker compose version >/dev/null 2>&1; then
      warn "Docker is installed but 'docker compose' is not available"
    elif ! docker info >/dev/null 2>&1; then
      warn "Docker is installed but not running"
    else
      pass "Docker is available for the local database"
    fi
    ;;
  "")
    warn "skipped: DATABASE_URL is not set"
    ;;
  *)
    pass "DATABASE_URL is not local, so Docker is not required"
    ;;
esac

echo

if [ "$failures" -gt 0 ]; then
  echo "Environment check failed: $failures problem(s), $warnings warning(s)."
  exit 1
fi

echo "Environment check passed with $warnings warning(s)."
