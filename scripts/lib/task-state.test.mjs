import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { matchesHotspot, readHotspots, readPlanStatus } from "./task-state.mjs";

// Builds a plan from `[heading, ...list items]` entries, one per slice.
function plan(...slices) {
  return [
    "# Example",
    "",
    "## Goal",
    "",
    "Something.",
    "",
    "## Slices",
    "",
    ...slices.flatMap(([heading, ...items]) => [`### ${heading}`, "", ...items, "", "Details.", ""]),
  ].join("\n");
}

const messages = (text) => readPlanStatus(text).problems.map((problem) => problem.message);

describe("readPlanStatus", () => {
  it("reads the status, branch, and pull request of each slice", () => {
    const result = readPlanStatus(
      plan(
        ["Slice 0: Amend the spec", "- Status: done", "- Branch: `docs/example-plan`", "- Pull request: #7"],
        ["Slice 1: Schema", "- Status: in-progress", "- Branch: feat/example"],
        ["Slice 2a: Boards", "- Status: blocked", "- Notes: waiting for a price ID"],
        ["Slice 3: Inbox", "- Status: pending", "- Branch: —"],
      ),
    );

    assert.deepEqual(result.problems, []);
    assert.equal(result.own, null);
    assert.deepEqual(
      result.slices.map(({ line, ...slice }) => slice),
      [
        { id: "0", status: "done", branch: "docs/example-plan", pullRequest: "#7", notes: "" },
        { id: "1", status: "in-progress", branch: "feat/example", pullRequest: "", notes: "" },
        { id: "2a", status: "blocked", branch: "", pullRequest: "", notes: "waiting for a price ID" },
        { id: "3", status: "pending", branch: "", pullRequest: "", notes: "" },
      ],
    );
  });

  it("works out the plan's status from its slices", () => {
    const status = (...statuses) =>
      readPlanStatus(
        plan(
          ...statuses.map((value, index) => [
            `Slice ${index + 1}: Part`,
            `- Status: ${value}`,
            "- Branch: feat/example",
          ]),
        ),
      ).status;

    assert.equal(status("pending", "pending"), "planned");
    assert.equal(status("blocked", "pending"), "planned");
    assert.equal(status("done", "pending"), "in-progress");
    assert.equal(status("pending", "in-progress"), "in-progress");
    assert.equal(status("done", "blocked"), "in-progress");
    assert.equal(status("done", "done"), "done");
    assert.equal(status("done", "dropped"), "done");
  });

  it("reads a plan without slices from the list below its title", () => {
    const result = readPlanStatus(
      ["# Small Fix", "", "- Status: in-progress", "- Branch: `fix/small`", "", "## Goal"].join("\n"),
    );

    assert.deepEqual(result.problems, []);
    assert.deepEqual(result.slices, []);
    assert.equal(result.own.status, "in-progress");
    assert.equal(result.own.branch, "fix/small");
    assert.equal(result.status, "in-progress");
  });

  it("reads files with Windows line endings", () => {
    const text = plan(["Slice 1: Schema", "- Status: done", "- Branch: feat/a"]).replaceAll("\n", "\r\n");

    assert.deepEqual(readPlanStatus(text).problems, []);
    assert.equal(readPlanStatus(text).slices[0].branch, "feat/a");
  });

  it("reports the line of each problem", () => {
    const text = plan(["Slice 1: Schema", "- Status: started"]);
    const [problem] = readPlanStatus(text).problems;

    assert.equal(text.split("\n")[problem.line - 1], "- Status: started");
  });

  it("rejects a slice without a status directly below its heading", () => {
    assert.deepEqual(messages(plan(["Slice 1: Schema"])), [
      "slice 1 has no `- Status:` line directly below its heading",
    ]);

    // A status further down belongs to the text, not to the heading.
    const text = ["# Example", "", "### Slice 1: Schema", "", "Details.", "", "- Status: done"].join("\n");
    assert.match(messages(text)[0], /slice 1 has no `- Status:` line/);
  });

  it("rejects an unknown status", () => {
    assert.deepEqual(messages(plan(["Slice 1: Schema", "- Status: merged"])), [
      'slice 1 has status "merged", which is not one of `pending`, `in-progress`, `blocked`, `done`, `dropped`',
    ]);
  });

  it("requires a branch for a slice in progress", () => {
    assert.deepEqual(messages(plan(["Slice 1: Schema", "- Status: in-progress", "- Branch: —"])), [
      "slice 1 is `in-progress` but names no branch. Add `- Branch:`",
    ]);
  });

  it("rejects two headings for the same slice, in any letter case", () => {
    const text = plan(
      ["Slice 2a: Boards", "- Status: pending"],
      ["Slice 2A: Boards again", "- Status: pending"],
    );

    assert.deepEqual(messages(text), ["more than one heading names slice 2a"]);
  });

  it("rejects a slice number it cannot read", () => {
    assert.match(
      messages(plan(["Slice 1.5: Between", "- Status: pending"]))[0],
      /slice "1.5" must be numbered like `Slice 1` or `Slice 2a`/,
    );
  });

  it("requires a status below the title when the plan has no slices", () => {
    assert.match(messages("# Example\n\n## Goal\n")[0], /no slices and no `- Status:` line/);
    assert.match(messages("## Goal\n")[0], /no slices and no `- Status:` line/);
  });

  it("rejects a status below the title when the plan has slices", () => {
    const text = ["# Example", "", "- Status: done", "", "### Slice 1: Schema", "", "- Status: pending"].join(
      "\n",
    );

    assert.match(messages(text)[0], /its status comes from them/);
  });

  it("leaves the plan's status unset when the plan has a problem", () => {
    const text = plan(["Slice 1: Schema", "- Status: done"], ["Slice 2: Boards"]);

    assert.equal(readPlanStatus(text).status, null);
  });

  it("does not read other headings or code examples as slices", () => {
    const text = [
      "# Example",
      "",
      "- Status: pending",
      "",
      "## Slices",
      "",
      "### Slice Order",
      "",
      "```markdown",
      "### Slice 9: An example",
      "",
      "- Status: nonsense",
      "```",
    ].join("\n");

    const result = readPlanStatus(text);
    assert.deepEqual(result.problems, []);
    assert.deepEqual(result.slices, []);
    assert.equal(result.status, "planned");
  });
});

describe("readHotspots", () => {
  const document = [
    "# Parallel Development",
    "",
    "## Ownership",
    "",
    "| Path | Why |",
    "| ---- | --- |",
    "| `not/this/table` | wrong section |",
    "",
    "## Shared Hotspots",
    "",
    "Intro.",
    "",
    "| Path                       | Why it needs coordination |",
    "| -------------------------- | ------------------------- |",
    "| `package.json`             | root scripts              |",
    "| `packages/db/src/schema/*` | the schema                |",
    "",
    "Only the first table counts.",
    "",
    "| Path           | Why       |",
    "| -------------- | --------- |",
    "| `not/this/one` | too late  |",
    "",
    "## Lower-Conflict Areas",
  ].join("\n");

  it("reads the first column of the first table below Shared Hotspots", () => {
    assert.deepEqual(
      readHotspots(document).map((hotspot) => hotspot.pattern),
      ["package.json", "packages/db/src/schema/*"],
    );
  });

  it("returns nothing when the section or table is missing", () => {
    assert.deepEqual(readHotspots("# Parallel Development\n"), []);
    assert.deepEqual(readHotspots("## Shared Hotspots\n\nNo table here.\n"), []);
  });
});

describe("matchesHotspot", () => {
  it("matches a file exactly", () => {
    assert.equal(matchesHotspot("package.json", "package.json"), true);
    assert.equal(matchesHotspot("package.json", "packages/db/package.json"), false);
  });

  it("matches everything below a directory pattern", () => {
    assert.equal(matchesHotspot("packages/db/drizzle/*", "packages/db/drizzle/0001.sql"), true);
    assert.equal(
      matchesHotspot("packages/db/drizzle/*", "packages/db/drizzle/meta/_journal.json"),
      true,
    );
    assert.equal(matchesHotspot("packages/db/drizzle/*", "packages/db/drizzle.config.ts"), false);
  });
});
