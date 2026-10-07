import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";

import { collectStatus, renderStatus } from "./status.mjs";

// These tests build small Git repositories in the temporary directory. They
// never touch the repository they run in, and they ignore the user's Git
// configuration.

const GIT_ENV = {
  ...process.env,
  GIT_CONFIG_GLOBAL: os.devNull,
  GIT_CONFIG_NOSYSTEM: "1",
  GIT_AUTHOR_NAME: "Test",
  GIT_AUTHOR_EMAIL: "test@example.com",
  GIT_COMMITTER_NAME: "Test",
  GIT_COMMITTER_EMAIL: "test@example.com",
};

const HOTSPOTS = [
  "# Parallel Development",
  "",
  "## Shared Hotspots",
  "",
  "| Path           | Why         |",
  "| -------------- | ----------- |",
  "| `package.json` | scripts     |",
  "| `db/schema/*`  | the schema  |",
  "",
].join("\n");

// A plan with one slice per `[id, status, branch]` entry.
function plan(...slices) {
  return [
    "# Feedbox",
    "",
    ...slices.flatMap(([id, status, branch]) => [
      `### Slice ${id}: Part ${id}`,
      "",
      `- Status: ${status}`,
      ...(branch ? [`- Branch: \`${branch}\``] : []),
      "",
      "Details.",
      "",
    ]),
  ].join("\n");
}

function git(directory, ...args) {
  return execFileSync("git", args, {
    cwd: directory,
    env: GIT_ENV,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

function write(directory, file, text) {
  mkdirSync(path.dirname(path.join(directory, file)), { recursive: true });
  writeFileSync(path.join(directory, file), text);
}

function commit(directory, message) {
  git(directory, "add", "-A");
  git(directory, "commit", "--quiet", "-m", message);
}

// Creates `<temporary directory>/main` holding the given files. With
// `initialize`, it is a repository with one commit on `branch`.
function checkout(t, files, { initialize = true, branch = "main" } = {}) {
  const base = realpathSync(mkdtempSync(path.join(os.tmpdir(), "agent-status-")));
  t.after(() => rmSync(base, { recursive: true, force: true }));

  const root = path.join(base, "main");
  mkdirSync(root);
  write(root, "docs/architecture/parallel-development.md", HOTSPOTS);
  for (const [file, text] of Object.entries(files)) write(root, file, text);

  if (initialize) {
    git(root, "init", "--quiet", "-b", branch);
    commit(root, "base");
  }

  return { base, root };
}

// Commits the given files on a new branch, then returns to the first branch.
function branchWith(root, name, files) {
  const start = git(root, "branch", "--show-current");
  git(root, "switch", "--quiet", "-c", name);
  for (const [file, text] of Object.entries(files)) write(root, file, text);
  commit(root, name);
  git(root, "switch", "--quiet", start);
}

const task = (state, branch) => state.tasks.find((item) => item.branch === branch);

describe("collectStatus", () => {
  it("reads plans from a directory that is not a Git checkout", (t) => {
    const { base, root } = checkout(
      t,
      { "docs/plans/feedbox.md": plan(["1", "done", "feat/a"], ["2", "pending"]) },
      { initialize: false },
    );

    // Keeps Git from finding a repository above the temporary directory.
    const ceiling = process.env.GIT_CEILING_DIRECTORIES;
    process.env.GIT_CEILING_DIRECTORIES = base;
    t.after(() => {
      if (ceiling === undefined) delete process.env.GIT_CEILING_DIRECTORIES;
      else process.env.GIT_CEILING_DIRECTORIES = ceiling;
    });

    const state = collectStatus({ root });

    assert.equal(state.plans[0].name, "feedbox");
    assert.equal(state.plans[0].status, "in-progress");
    assert.deepEqual(state.tasks, []);
    assert.match(state.notes.join("\n"), /not a Git checkout/);
  });

  it("lists a branch with the files and hotspots it changes, and not a clean main", (t) => {
    const { root } = checkout(t, { "package.json": "{}", "src/page.ts": "one" });
    branchWith(root, "feat/boards", { "package.json": "{ }", "src/new file.ts": "two" });

    const state = collectStatus({ root });

    assert.equal(state.checkout, "main");
    assert.equal(state.base, "main");
    assert.deepEqual(
      state.tasks.map((item) => item.branch),
      ["feat/boards"],
    );
    assert.equal(task(state, "feat/boards").ahead, 1);
    assert.deepEqual(task(state, "feat/boards").files, ["package.json", "src/new file.ts"]);
    assert.deepEqual(task(state, "feat/boards").hotspots, ["package.json"]);
    assert.deepEqual(state.overlaps, []);
  });

  it("reads uncommitted work and recorded progress from another worktree", (t) => {
    const { base, root } = checkout(t, {
      "docs/plans/feedbox.md": plan(["1", "pending"], ["2", "pending"]),
    });
    const worktree = path.join(base, "boards");
    git(root, "worktree", "add", "--quiet", "-b", "feat/boards", worktree, "main");
    write(worktree, "docs/plans/feedbox.md", plan(["1", "in-progress", "feat/boards"], ["2", "pending"]));
    write(worktree, "src/untracked file.ts", "new");

    const fromMain = collectStatus({ root });
    const boards = task(fromMain, "feat/boards");

    assert.equal(boards.worktree, worktree);
    assert.equal(boards.current, false);
    assert.equal(boards.ahead, 0);
    assert.equal(boards.uncommitted, 2);
    assert.deepEqual(boards.files, ["docs/plans/feedbox.md", "src/untracked file.ts"]);
    assert.deepEqual(boards.records, [{ plan: "feedbox", slice: "1", status: "in-progress" }]);

    // The main checkout still records the slice as pending, and shows the rest.
    assert.equal(fromMain.plans[0].status, "planned");
    assert.deepEqual(fromMain.plans[0].units[0].elsewhere, [
      { branch: "feat/boards", status: "in-progress" },
    ]);

    const fromWorktree = collectStatus({ root: worktree });
    assert.equal(fromWorktree.checkout, "feat/boards");
    assert.equal(fromWorktree.plans[0].status, "in-progress");
    assert.equal(task(fromWorktree, "feat/boards").current, true);
  });

  it("reports hotspots and files that two tasks change, but not plan files", (t) => {
    const { root } = checkout(t, {
      "package.json": "{}",
      "src/page.ts": "one",
      "src/other.ts": "one",
      "docs/plans/feedbox.md": plan(["1", "pending"], ["2", "pending"]),
    });
    branchWith(root, "feat/a", {
      "package.json": "a",
      "src/page.ts": "a",
      "docs/plans/feedbox.md": plan(["1", "in-progress", "feat/a"], ["2", "pending"]),
    });
    branchWith(root, "feat/b", {
      "package.json": "b",
      "src/page.ts": "b",
      "src/other.ts": "b",
      "docs/plans/feedbox.md": plan(["1", "pending"], ["2", "in-progress", "feat/b"]),
    });

    assert.deepEqual(collectStatus({ root }).overlaps, [
      { path: "package.json", hotspot: true, branches: ["feat/a", "feat/b"] },
      { path: "src/page.ts", hotspot: false, branches: ["feat/a", "feat/b"] },
    ]);
  });

  it("counts a moved file at both of its paths", (t) => {
    const { root } = checkout(t, { "db/schema/users.ts": "export const users = 1;\n" });
    git(root, "switch", "--quiet", "-c", "feat/move");
    mkdirSync(path.join(root, "db/tables"));
    git(root, "mv", "db/schema/users.ts", "db/tables/users.ts");
    commit(root, "move");
    git(root, "switch", "--quiet", "main");

    const moved = task(collectStatus({ root }), "feat/move");

    assert.deepEqual(moved.files, ["db/schema/users.ts", "db/tables/users.ts"]);
    assert.deepEqual(moved.hotspots, ["db/schema/*"]);
  });

  it("lists a checkout that has no branch checked out", (t) => {
    const { root } = checkout(t, { "package.json": "{}" });
    git(root, "checkout", "--quiet", "--detach");
    write(root, "package.json", "{ }");

    const state = collectStatus({ root });

    assert.equal(state.checkout, "detached HEAD");
    assert.equal(state.tasks.length, 1);
    assert.match(state.tasks[0].branch, /^detached HEAD at [0-9a-f]{7}$/);
    assert.equal(state.tasks[0].current, true);
    assert.deepEqual(state.tasks[0].hotspots, ["package.json"]);
  });

  it("marks a worktree whose directory is gone", (t) => {
    const { base, root } = checkout(t, { "package.json": "{}" });
    const worktree = path.join(base, "gone");
    git(root, "worktree", "add", "--quiet", "-b", "feat/gone", worktree, "main");
    rmSync(worktree, { recursive: true, force: true });

    const gone = task(collectStatus({ root }), "feat/gone");

    assert.equal(gone.worktreeMissing, true);
    assert.equal(gone.uncommitted, 0);
  });

  it("notes a slice in progress on a branch that does not exist", (t) => {
    const { root } = checkout(t, {
      "docs/plans/feedbox.md": plan(["1", "in-progress", "feat/ghost"]),
    });

    assert.match(
      collectStatus({ root }).notes.join("\n"),
      /feedbox slice 1 is in-progress on feat\/ghost, but no branch with that name exists/,
    );
  });

  it("reports the problems of a plan it cannot read", (t) => {
    const { root } = checkout(t, { "docs/plans/feedbox.md": "# Feedbox\n\n### Slice 1: Part\n" });

    const state = collectStatus({ root });

    assert.equal(state.plans[0].status, null);
    assert.match(state.notes.join("\n"), /docs\/plans\/feedbox\.md:3: slice 1 has no `- Status:` line/);
  });

  it("adds branches on origin only when asked, and only where they add something", (t) => {
    const { root } = checkout(t, { "a.txt": "one" });
    const origin = (name, commitish) =>
      git(root, "update-ref", `refs/remotes/origin/${name}`, git(root, "rev-parse", commitish));
    origin("main", "main");

    // Exists only on origin.
    branchWith(root, "feat/only-remote", { "b.txt": "remote" });
    origin("feat/only-remote", "feat/only-remote");
    git(root, "branch", "--quiet", "-D", "feat/only-remote");

    // Pushed, and identical on origin.
    branchWith(root, "feat/pushed", { "c.txt": "pushed" });
    origin("feat/pushed", "feat/pushed");

    // On origin with one commit that the local branch lacks.
    branchWith(root, "feat/shared", { "a.txt": "two" });
    git(root, "switch", "--quiet", "-c", "ahead", "feat/shared");
    write(root, "a.txt", "three");
    commit(root, "ahead");
    git(root, "switch", "--quiet", "main");
    origin("feat/shared", "ahead");
    git(root, "branch", "--quiet", "-D", "ahead");

    const local = collectStatus({ root });
    assert.equal(local.base, "origin/main");
    assert.deepEqual(
      local.tasks.map((item) => item.branch),
      ["feat/pushed", "feat/shared"],
    );

    const withRemote = collectStatus({ root, remote: true });
    assert.deepEqual(
      withRemote.tasks.map((item) => item.branch),
      ["feat/pushed", "feat/shared", "origin/feat/only-remote", "origin/feat/shared"],
    );
    assert.equal(task(withRemote, "origin/feat/shared").ahead, 2);
    // A branch does not overlap with its own copy on origin.
    assert.deepEqual(withRemote.overlaps, []);
  });

  it("compares with nothing when the repository has no main branch", (t) => {
    const { root } = checkout(t, { "package.json": "{}" }, { branch: "trunk" });
    branchWith(root, "feat/a", { "package.json": "a" });

    const state = collectStatus({ root });

    assert.equal(state.base, null);
    assert.deepEqual(state.tasks, []);
    assert.match(state.notes.join("\n"), /no main branch was found/);
  });
});

describe("renderStatus", () => {
  it("prints plans, tasks, overlaps, and notes, and the state survives JSON", (t) => {
    const { root } = checkout(t, {
      "package.json": "{}",
      "docs/plans/feedbox.md": plan(["1", "done", "feat/a"], ["2", "in-progress", "feat/ghost"]),
      "docs/plans/shipped.md": "# Shipped\n\n- Status: done\n",
    });
    branchWith(root, "feat/a", { "package.json": "a" });
    branchWith(root, "feat/b", { "package.json": "b" });

    const state = collectStatus({ root });
    const text = renderStatus(state);

    assert.deepEqual(JSON.parse(JSON.stringify(state)), state);
    assert.match(text, /^Agent status: on main$/m);
    assert.match(text, /^ {2}feedbox {2}in-progress {2}1 of 2 slices done$/m);
    assert.match(text, /^ {4}slice 2 {2}in-progress {2}feat\/ghost$/m);
    assert.match(text, /^ {2}done: shipped$/m);
    assert.match(text, /^ {2}feat\/a {2}\(no worktree\) {2}1 commit ahead, 1 file changed$/m);
    assert.match(text, /^ {4}hotspots: package\.json$/m);
    assert.match(text, /^ {2}hotspot package\.json: feat\/a, feat\/b$/m);
    assert.match(text, /^Notes$/m);
  });

  it("prints the notes recorded for a slice", (t) => {
    const { root } = checkout(t, {
      "docs/plans/feedbox.md": [
        "# Feedbox",
        "",
        "### Slice 1: Boards",
        "",
        "- Status: blocked",
        "- Notes: waiting for a price ID",
        "",
      ].join("\n"),
    });

    const text = renderStatus(collectStatus({ root }));

    assert.match(text, /^ {4}slice 1 {2}blocked {2}note: waiting for a price ID$/m);
  });
});
