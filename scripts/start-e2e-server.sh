#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/../apps/web"
exec ./node_modules/.bin/next start --hostname 127.0.0.1 --port 3000
