#!/usr/bin/env node

// Prints where the work stands: what the plans record, and what Git shows.
//
//   pnpm agent:status                   plans, active branches and worktrees, overlaps
//   pnpm agent:status --remote          also branches on origin, as last fetched
//   pnpm --silent agent:status --json   the same data as JSON
//
// Read-only: see scripts/lib/status.mjs. It exits 0 unless it is called with
// an unknown option, because it reports state and does not judge it.
// `pnpm agent:check` is the command that fails.
// See docs/architecture/agent-workflows.md.

import path from "node:path";

import { collectStatus, renderStatus } from "./lib/status.mjs";

const OPTIONS = ["--remote", "--json", "--help"];

const USAGE = `Usage: pnpm agent:status [--remote] [--json]

  --remote   also list branches on origin, as last fetched
  --json     print the same data as JSON. Run it as
             "pnpm --silent agent:status --json", so pnpm prints nothing else
`;

const options = process.argv.slice(2);
const unknown = options.filter((option) => !OPTIONS.includes(option));

if (unknown.length > 0) {
  console.error(`Unknown option: ${unknown.join(" ")}\n\n${USAGE}`);
  process.exit(2);
}

if (options.includes("--help")) {
  console.log(USAGE);
} else {
  const state = collectStatus({
    root: path.resolve(import.meta.dirname, ".."),
    remote: options.includes("--remote"),
  });
  console.log(options.includes("--json") ? JSON.stringify(state, null, 2) : renderStatus(state));
}
