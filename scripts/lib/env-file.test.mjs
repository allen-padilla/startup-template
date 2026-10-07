import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";

import { hasSecret, withSecret } from "./env-file.mjs";

const ENTRY = path.resolve(import.meta.dirname, "../ensure-env-secret.mjs");
const EXAMPLE = "DATABASE_URL=postgresql://startup:startup@localhost:5432/startup\nBETTER_AUTH_SECRET=\nBETTER_AUTH_URL=http://localhost:3000\n";

describe("hasSecret", () => {
  it("reads the value the way Node's env-file loader does", () => {
    for (const text of [
      "BETTER_AUTH_SECRET=abc",
      "export BETTER_AUTH_SECRET=abc",
      "  BETTER_AUTH_SECRET = abc",
      'BETTER_AUTH_SECRET="abc"',
      "BETTER_AUTH_SECRET=abc # keep",
    ]) {
      assert.equal(hasSecret(text), true, text);
    }

    for (const text of [
      "",
      "BETTER_AUTH_SECRET=",
      'BETTER_AUTH_SECRET=""',
      "BETTER_AUTH_SECRET= # comment",
      "# BETTER_AUTH_SECRET=abc",
      "OTHER=1",
    ]) {
      assert.equal(hasSecret(text), false, JSON.stringify(text));
    }
  });
});

describe("withSecret", () => {
  it("replaces the assignment in place and keeps its prefix", () => {
    assert.equal(withSecret("A=1\nBETTER_AUTH_SECRET=\nB=2\n", "s"), "A=1\nBETTER_AUTH_SECRET=s\nB=2\n");
    assert.equal(withSecret("export BETTER_AUTH_SECRET=old\n", "s"), "export BETTER_AUTH_SECRET=s\n");
    assert.equal(withSecret("  BETTER_AUTH_SECRET = old # c\n", "s"), "  BETTER_AUTH_SECRET=s\n");
  });

  it("appends the assignment when there is none", () => {
    assert.equal(withSecret("A=1", "s"), "A=1\nBETTER_AUTH_SECRET=s\n");
    assert.equal(withSecret("A=1\n\n", "s"), "A=1\nBETTER_AUTH_SECRET=s\n");
    assert.equal(withSecret("# BETTER_AUTH_SECRET=old\n", "s"), "# BETTER_AUTH_SECRET=old\nBETTER_AUTH_SECRET=s\n");
  });
});

describe("ensure-env-secret", () => {
  const run = (directory) =>
    execFileSync(process.execPath, [ENTRY, ".env.local", ".env.example"], {
      cwd: directory,
      encoding: "utf8",
    }).trim();

  const secretOf = (directory) =>
    /^BETTER_AUTH_SECRET=(.*)$/m.exec(readFileSync(path.join(directory, ".env.local"), "utf8"))?.[1] ?? "";

  const fixture = (t) => {
    const directory = mkdtempSync(path.join(os.tmpdir(), "env-secret-"));
    t.after(() => rmSync(directory, { recursive: true, force: true }));
    writeFileSync(path.join(directory, ".env.example"), EXAMPLE);
    return directory;
  };

  it("creates the file from the example, fills an empty secret, and keeps a valid one", (t) => {
    const directory = fixture(t);

    assert.equal(run(directory), "created");
    const created = secretOf(directory);
    assert.ok(created.length >= 40);
    assert.equal(statSync(path.join(directory, ".env.local")).mode & 0o777, 0o600);

    assert.equal(run(directory), "kept");
    assert.equal(secretOf(directory), created);

    writeFileSync(path.join(directory, ".env.local"), EXAMPLE.replace("BETTER_AUTH_SECRET=", "BETTER_AUTH_SECRET= # lost") + "STRIPE_SECRET_KEY=sk_test_keep\n");
    assert.equal(run(directory), "filled");
    const filled = readFileSync(path.join(directory, ".env.local"), "utf8");
    assert.notEqual(secretOf(directory), created);
    assert.match(filled, /^STRIPE_SECRET_KEY=sk_test_keep$/m);
    assert.equal(filled.split("\n").length, EXAMPLE.split("\n").length + 1);
  });

  it("keeps an exported secret", (t) => {
    const directory = fixture(t);
    writeFileSync(path.join(directory, ".env.local"), "export BETTER_AUTH_SECRET=keep-me-exactly-as-written\n");

    assert.equal(run(directory), "kept");
    assert.equal(readFileSync(path.join(directory, ".env.local"), "utf8"), "export BETTER_AUTH_SECRET=keep-me-exactly-as-written\n");
  });
});
