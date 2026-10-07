#!/usr/bin/env node

// Read-only structural check of the agent harness.
//
// Checks mechanical facts only: required files, skill frontmatter, non-empty
// commands and roles, thin tool adapters, repository-local references in the
// harness documentation, the status recorded in each implementation plan, and
// the Shared Hotspots table. It does not judge the quality of the guidance or
// whether a recorded status is true.
//
// It reads Markdown and directory listings. It never reads environment files
// or environment variables. See docs/architecture/agent-workflows.md.

import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import { readHotspots, readPlanStatus } from "./lib/task-state.mjs";

const root = path.resolve(import.meta.dirname, "..");

const REQUIRED_PATHS = [
  { path: "AGENTS.md", kind: "file" },
  { path: ".agents/rules/repository.md", kind: "file" },
  { path: "docs/architecture", kind: "directory" },
  { path: "docs/specs", kind: "directory" },
  { path: "docs/plans", kind: "directory" },
];

const SKILLS_DIRECTORY = ".agents/skills";
const COMMANDS_DIRECTORY = ".agents/commands";
const ROLES_DIRECTORY = ".agents/agents";

// Every Markdown file here except README.md is a plan that records its status.
const PLANS_DIRECTORY = "docs/plans";
// `pnpm agent:status` reads its Shared Hotspots table.
const HOTSPOTS_DOCUMENT = "docs/architecture/parallel-development.md";

// Tool-specific entry points. Each must stay a pointer to AGENTS.md.
const ADAPTERS = ["CLAUDE.md"];
const ADAPTER_MAX_LINES = 10;

// Documents whose references are checked, plus every Markdown file in .agents/.
const REFERENCE_SOURCES = [
  "AGENTS.md",
  ...ADAPTERS,
  "docs/architecture/agent-workflows.md",
  "docs/specs/README.md",
  "docs/plans/README.md",
];

// A reference is checked when it starts with one of these directories...
const REPOSITORY_DIRECTORIES = new Set([
  ".agents",
  ".github",
  "apps",
  "docs",
  "packages",
  "scripts",
  "tests",
]);

// ...or names one of these files in the repository root.
const ROOT_FILES = new Set([
  ".env.example",
  ".node-version",
  "AGENTS.md",
  "CLAUDE.md",
  "README.md",
  "compose.yaml",
  "package.json",
  "playwright.config.ts",
  "pnpm-lock.yaml",
  "pnpm-workspace.yaml",
  "turbo.json",
]);

// Paths below these directories are generated or ignored, so a fresh checkout
// does not have them.
const GENERATED_SEGMENTS = new Set([
  ".next",
  ".turbo",
  "node_modules",
  "playwright-report",
  "test-results",
]);

// Paths that documentation uses as examples of a naming scheme. They are not
// expected to exist. Prefer a placeholder such as `docs/specs/<feature-name>.md`
// over adding an entry here.
const ILLUSTRATIVE_PATHS = new Set(["docs/specs/team-invitations.md"]);

const failures = [];

function fail(location, message) {
  const repeated = failures.some(
    (failure) => failure.location === location && failure.message === message,
  );
  if (!repeated) failures.push({ location, message });
}

const directoryCache = new Map();

function entriesOf(directory) {
  if (!directoryCache.has(directory)) {
    let entries = null;
    try {
      entries = readdirSync(path.join(root, directory), { withFileTypes: true });
    } catch {
      // Missing or unreadable: reported by the caller as "does not exist".
    }
    directoryCache.set(directory, entries);
  }
  return directoryCache.get(directory);
}

// Returns "file", "directory", or null. Names are compared exactly, so the
// result does not depend on the case sensitivity of the file system.
function kindOf(relativePath) {
  let directory = "";
  let kind = "directory";

  for (const segment of relativePath.split("/").filter(Boolean)) {
    if (kind !== "directory") return null;
    const entry = entriesOf(directory)?.find((item) => item.name === segment);
    if (!entry) return null;
    kind = entry.isDirectory() ? "directory" : "file";
    directory = directory ? `${directory}/${segment}` : segment;
  }

  return kind;
}

function read(relativePath) {
  return readFileSync(path.join(root, relativePath), "utf8").replace(/^﻿/, "");
}

function markdownFilesIn(directory) {
  const found = [];
  for (const entry of entriesOf(directory) ?? []) {
    const entryPath = `${directory}/${entry.name}`;
    if (entry.isDirectory()) found.push(...markdownFilesIn(entryPath));
    else if (entry.name.endsWith(".md")) found.push(entryPath);
  }
  return found.sort();
}

// Reads the top-level `key: value` pairs of a YAML frontmatter block. Returns
// null when the document has no closed frontmatter block.
function parseFrontmatter(text) {
  const lines = text.split(/\r?\n/);
  if (lines[0]?.trim() !== "---") return null;

  const end = lines.findIndex((line, index) => index > 0 && line.trim() === "---");
  if (end === -1) return null;

  const fields = {};
  let key = null;

  for (const line of lines.slice(1, end)) {
    const pair = /^([A-Za-z][\w-]*):\s*(.*)$/.exec(line);
    if (pair) {
      key = pair[1];
      fields[key] = pair[2].trim();
    } else if (key && /^\s+\S/.test(line)) {
      // Continuation of a folded, literal, or multi-line value.
      fields[key] = `${fields[key]} ${line.trim()}`.trim();
    }
  }

  for (const [name, value] of Object.entries(fields)) {
    fields[name] = value
      .replace(/^[>|][+-]?(\s+|$)/, "")
      .replace(/^(["'])(.*)\1$/, "$2")
      .trim();
  }

  return fields;
}

function checkRequiredPaths() {
  for (const required of REQUIRED_PATHS) {
    const kind = kindOf(required.path);
    if (kind === null) {
      fail(required.path, `required ${required.kind} does not exist`);
    } else if (kind !== required.kind) {
      fail(required.path, `must be a ${required.kind}, found a ${kind}`);
    }
  }
}

function checkSkills() {
  const skills = (entriesOf(SKILLS_DIRECTORY) ?? []).filter((entry) => entry.isDirectory());

  for (const skill of skills) {
    const file = `${SKILLS_DIRECTORY}/${skill.name}/SKILL.md`;

    if (kindOf(file) !== "file") {
      fail(`${SKILLS_DIRECTORY}/${skill.name}`, "skill directory has no SKILL.md");
      continue;
    }

    const text = read(file);
    if (text.trim() === "") {
      fail(file, "file is empty");
      continue;
    }

    const frontmatter = parseFrontmatter(text);
    if (frontmatter === null) {
      fail(file, "YAML frontmatter is missing: the file must start with a `---` block");
      continue;
    }

    if (!frontmatter.name) {
      fail(file, "frontmatter has no `name`");
    } else if (frontmatter.name !== skill.name) {
      fail(
        file,
        `frontmatter \`name\` is "${frontmatter.name}", but the directory is "${skill.name}"`,
      );
    }

    if (!frontmatter.description) fail(file, "frontmatter has no `description`");
  }

  return skills.length;
}

function checkNonEmptyMarkdown(directory) {
  const files = markdownFilesIn(directory);
  for (const file of files) {
    if (read(file).trim() === "") fail(file, "file is empty");
  }
  return files.length;
}

function checkAdapters() {
  for (const adapter of ADAPTERS) {
    if (kindOf(adapter) !== "file") continue;

    const text = read(adapter);
    if (text.trim() === "") {
      fail(adapter, "file is empty");
      continue;
    }

    if (!text.includes("AGENTS.md")) {
      fail(adapter, "adapter must point to AGENTS.md");
    }

    const lineCount = text.split(/\r?\n/).filter((line) => line.trim() !== "").length;
    if (lineCount > ADAPTER_MAX_LINES) {
      fail(
        adapter,
        `adapter has ${lineCount} non-blank lines, more than the ${ADAPTER_MAX_LINES} allowed. ` +
          "Keep guidance in AGENTS.md and .agents/, not in the adapter",
      );
    }
  }
}

// The format is documented in docs/plans/README.md.
function checkPlans() {
  const plans = (entriesOf(PLANS_DIRECTORY) ?? [])
    .filter((entry) => !entry.isDirectory() && entry.name.endsWith(".md"))
    .filter((entry) => entry.name !== "README.md")
    .map((entry) => `${PLANS_DIRECTORY}/${entry.name}`)
    .sort();

  for (const plan of plans) {
    for (const { line, message } of readPlanStatus(read(plan)).problems) {
      fail(line ? `${plan}:${line}` : plan, message);
    }
  }

  return plans.length;
}

function checkHotspots() {
  if (kindOf(HOTSPOTS_DOCUMENT) !== "file") {
    fail(HOTSPOTS_DOCUMENT, "required file does not exist");
    return;
  }

  const hotspots = readHotspots(read(HOTSPOTS_DOCUMENT));
  if (hotspots.length === 0) {
    fail(
      HOTSPOTS_DOCUMENT,
      "no table of paths found below `## Shared Hotspots`. `pnpm agent:status` reads it",
    );
  }

  for (const { pattern, line } of hotspots) {
    const location = `${HOTSPOTS_DOCUMENT}:${line}`;
    const directory = pattern.endsWith("/*") ? pattern.slice(0, -2) : null;

    if (/[*?<>{}]/.test(directory ?? pattern)) {
      fail(location, `hotspot \`${pattern}\` must be one path, or a directory followed by \`/*\``);
    } else if (directory !== null && kindOf(directory) !== "directory") {
      fail(location, `hotspot \`${pattern}\` names a directory that does not exist`);
    } else if (directory === null && kindOf(pattern) === null) {
      fail(location, `hotspot \`${pattern}\` points to a path that does not exist`);
    } else if (directory === null && kindOf(pattern) === "directory") {
      fail(location, `hotspot \`${pattern}\` is a directory. Write it as a directory followed by \`/*\``);
    }
  }
}

// Blanks out fenced code blocks and tool-managed sections, keeping line
// numbers stable. Tool-managed sections (`<!-- BEGIN:name -->` to
// `<!-- END:name -->`) are written by other tools and may describe paths
// outside this repository.
function scannableLines(text) {
  let fence = null;
  let managed = false;

  return text.split(/\r?\n/).map((line) => {
    if (fence) {
      if (line.trim().startsWith(fence)) fence = null;
      return "";
    }

    const opening = /^\s*(`{3,}|~{3,})/.exec(line);
    if (opening) {
      fence = opening[1];
      return "";
    }

    if (managed) {
      if (/<!--\s*END:[^>]*-->/.test(line)) managed = false;
      return "";
    }

    if (/<!--\s*BEGIN:[^>]*-->/.test(line)) {
      managed = true;
      return "";
    }

    return line;
  });
}

// Turns an inline code span into a path to check, or null when the span is
// not an obvious repository path.
function pathFromCodeSpan(span) {
  // Spans with whitespace are commands or prose, not a single path.
  if (/\s/.test(span)) return null;

  const segments = span.split("/");
  if (segments.some((segment) => GENERATED_SEGMENTS.has(segment))) return null;

  if (segments.length === 1) {
    if (ROOT_FILES.has(span)) return { path: span };
    if (/^[\w.-]+\.md$/.test(span)) return { markdownName: span };
    return null;
  }

  if (!REPOSITORY_DIRECTORIES.has(segments[0])) return null;
  if (ILLUSTRATIVE_PATHS.has(span)) return null;

  // Placeholders and globs: only the literal leading directories can be checked.
  const firstPattern = segments.findIndex((segment) => /[<>*{}]/.test(segment));
  if (firstPattern !== -1) {
    return { path: segments.slice(0, firstPattern).join("/"), kind: "directory" };
  }

  return span.endsWith("/")
    ? { path: span.replace(/\/+$/, ""), kind: "directory" }
    : { path: span };
}

// Turns a Markdown link target into a path to check, or null for external
// links and same-document anchors.
function pathFromLink(target, source) {
  if (/^[a-z][a-z0-9+.-]*:/i.test(target) || target.startsWith("#")) return null;

  let local = target.replace(/[?#].*$/, "");
  try {
    local = decodeURIComponent(local);
  } catch {
    // Keep the undecoded form.
  }
  if (local === "") return null;

  const base = local.startsWith("/") ? "" : path.posix.dirname(source);
  const resolved = path.posix.normalize(path.posix.join(base, local));
  if (resolved === ".." || resolved.startsWith("../")) return { outside: true };
  if (resolved.split("/").some((segment) => GENERATED_SEGMENTS.has(segment))) return null;

  return { path: resolved.replace(/\/+$/, "") };
}

function checkReference(reference, location, written, markdownNames) {
  if (reference.outside) {
    fail(location, `link \`${written}\` points outside the repository`);
    return;
  }

  if (reference.markdownName) {
    if (!markdownNames.has(reference.markdownName)) {
      fail(location, `reference \`${written}\` does not match any Markdown file in the repository`);
    }
    return;
  }

  const kind = kindOf(reference.path);
  if (kind === null) {
    const missing = reference.path === written ? "" : ` (\`${reference.path}\`)`;
    fail(location, `reference \`${written}\` points to a path that does not exist${missing}`);
  } else if (reference.kind && kind !== reference.kind) {
    fail(location, `reference \`${written}\` must be a ${reference.kind}, found a ${kind}`);
  }
}

function checkReferences() {
  const sources = [
    ...new Set([...REFERENCE_SOURCES, ...markdownFilesIn(".agents")]),
  ].filter((source) => kindOf(source) === "file");

  const markdownNames = new Set(
    [
      ...(entriesOf("") ?? [])
        .filter((entry) => !entry.isDirectory() && entry.name.endsWith(".md"))
        .map((entry) => entry.name),
      ...markdownFilesIn(".agents"),
      ...markdownFilesIn("docs"),
    ].map((file) => path.posix.basename(file)),
  );

  let checked = 0;

  for (const source of sources) {
    scannableLines(read(source)).forEach((line, index) => {
      const location = `${source}:${index + 1}`;

      for (const [, span] of line.matchAll(/`([^`\n]+)`/g)) {
        const reference = pathFromCodeSpan(span);
        if (!reference) continue;
        checked += 1;
        checkReference(reference, location, span, markdownNames);
      }

      for (const [, target] of line.matchAll(/\[[^\]\n]*\]\(\s*<?([^)\s>]+)>?[^)\n]*\)/g)) {
        const reference = pathFromLink(target, source);
        if (!reference) continue;
        checked += 1;
        checkReference(reference, location, target, markdownNames);
      }
    });
  }

  return { documents: sources.length, references: checked };
}

checkRequiredPaths();
const skills = checkSkills();
const commands = checkNonEmptyMarkdown(COMMANDS_DIRECTORY);
const roles = checkNonEmptyMarkdown(ROLES_DIRECTORY);
checkAdapters();
const plans = checkPlans();
checkHotspots();
const { documents, references } = checkReferences();

if (failures.length > 0) {
  console.error("Agent harness");
  for (const { location, message } of failures) {
    console.error(`  FAIL  ${location}: ${message}`);
  }
  console.error();
  console.error(`Agent harness check failed: ${failures.length} problem(s).`);
  process.exit(1);
}

console.log(
  `Agent harness check passed: ${skills} skills, ${commands} commands, ${roles} roles, ` +
    `${plans} plans, ${references} references in ${documents} documents.`,
);
