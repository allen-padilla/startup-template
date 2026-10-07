// Makes sure .env.local has a non-empty BETTER_AUTH_SECRET, creating the file
// from .env.example when it is missing. Prints `created`, `filled`, or `kept`.
// The secret never leaves this process. Used by scripts/setup-local.sh.

import { randomBytes } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";

import { hasSecret, withSecret } from "./lib/env-file.mjs";

const [target = ".env.local", example = ".env.example"] = process.argv.slice(2);

const exists = existsSync(target);
const text = readFileSync(exists ? target : example, "utf8");

if (exists && hasSecret(text)) {
  console.log("kept");
} else {
  const secret = randomBytes(32).toString("base64");
  writeFileSync(target, withSecret(text, secret), { mode: 0o600 });
  console.log(exists ? "filled" : "created");
}
