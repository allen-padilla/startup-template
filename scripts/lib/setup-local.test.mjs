import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";

const SCRIPTS = path.resolve(import.meta.dirname, "..");
const EXAMPLE = 'DATABASE_URL = "postgresql://unused@db.example.test/app"\nexport BETTER_AUTH_URL = "http://localhost:3000" # local\nBETTER_AUTH_SECRET = "public-test-placeholder-at-least-32-characters" # keep\n';

function fixture(t) {
  const directory = mkdtempSync(path.join(os.tmpdir(), "setup-local-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  for (const name of ["scripts/lib", "bin", "node_modules"]) {
    mkdirSync(path.join(directory, name), { recursive: true });
  }
  for (const name of ["setup-local.sh", "check-environment.sh", "ensure-env-secret.mjs", "lib/env-file.mjs"]) {
    copyFileSync(path.join(SCRIPTS, name), path.join(directory, "scripts", name));
  }
  const log = path.join(directory, "commands.log");
  writeFileSync(path.join(directory, "bin/pnpm"), '#!/bin/sh\nif [ "$1" = "--version" ]; then echo 12.6.0; exit 0; fi\nprintf "%s\\n" "$*" >> "$SETUP_COMMAND_LOG"\n', { mode: 0o755 });
  const env = { ...process.env, PATH: `${path.join(directory, "bin")}:${path.dirname(process.execPath)}:${process.env.PATH}`, SETUP_COMMAND_LOG: log };
  for (const name of ["DATABASE_URL", "BETTER_AUTH_URL", "BETTER_AUTH_SECRET", "SMTP_URL", "EMAIL_FROM"]) delete env[name];
  return {
    write(name, text) { writeFileSync(path.join(directory, name), text); },
    run(script, overrides = {}) {
      return spawnSync("bash", [`scripts/${script}`], { cwd: directory, env: { ...env, ...overrides }, encoding: "utf8" });
    },
    commands() { return readFileSync(log, "utf8").trim().split("\n"); },
  };
}

describe("local setup", () => {
  it("stops before database commands if the environment file cannot be created", (t) => {
    const local = fixture(t);
    // Neither file exists, so the actual environment helper fails to read it.
    const result = local.run("setup-local.sh");
    assert.notEqual(result.status, 0);
    assert.deepEqual(local.commands(), ["install --frozen-lockfile"]);
    assert.doesNotMatch(result.stdout, /Ready\./);
  });

  it("accepts Node dotenv syntax and completes setup", (t) => {
    const local = fixture(t);
    local.write(".env.example", EXAMPLE);
    const result = local.run("setup-local.sh");
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(local.commands(), ["install --frozen-lockfile", "db:up", "db:migrate"]);
    assert.match(result.stdout, /Environment check passed/);
    assert.doesNotMatch(result.stdout + result.stderr, /public-test-placeholder/);
  });

  it("rejects invalid configuration before starting services or migrating", (t) => {
    const local = fixture(t);
    local.write(".env.local", EXAMPLE.replace("public-test-placeholder-at-least-32-characters", "short"));
    const result = local.run("setup-local.sh");
    assert.notEqual(result.status, 0);
    assert.match(result.stdout, /BETTER_AUTH_SECRET is shorter than 32/);
    assert.deepEqual(local.commands(), ["install --frozen-lockfile"]);
  });

  it("respects shell overrides, including explicitly disabled email", (t) => {
    const local = fixture(t);
    local.write(".env.local", EXAMPLE + 'SMTP_URL=smtp://mail.example.test\nEMAIL_FROM="Test <no-reply@example.test>"\n');
    const result = local.run("check-environment.sh", { SMTP_URL: "", EMAIL_FROM: "" });
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /email is disabled/);
  });
});
