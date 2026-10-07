// Collects where the work stands, for `pnpm agent:status`: what the plans
// record, and what Git shows.
//
// Read-only. It runs Git commands that change nothing, with optional locks
// turned off so it never contends with another agent's Git command, and it
// reads Markdown. It never fetches and never reads environment files.
// See docs/architecture/agent-workflows.md.

import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import { matchesHotspot, readHotspots, readPlanStatus } from "./task-state.mjs";

const PLANS_DIRECTORY = "docs/plans";
const HOTSPOTS_DOCUMENT = "docs/architecture/parallel-development.md";

const LOCAL = "refs/heads/";
const ORIGIN = "refs/remotes/origin/";

const MAX_LISTED_FILES = 20;

const unique = (values) => [...new Set(values)];
const linesOf = (output) => (output ?? "").split("\n").filter(Boolean);
const entriesOf = (output) => (output ?? "").split("\0").filter(Boolean);

// Returns a function that runs Git in `directory` and returns its output, or
// null when the command fails.
function gitIn(directory) {
  return (...args) => {
    try {
      return execFileSync("git", args, {
        cwd: directory,
        encoding: "utf8",
        env: { ...process.env, GIT_OPTIONAL_LOCKS: "0" },
        stdio: ["ignore", "pipe", "ignore"],
        maxBuffer: 64 * 1024 * 1024,
      });
    } catch {
      return null;
    }
  };
}

// A view reads harness documents from a checkout on disk or from a commit, so
// a task's own record of its progress can be read without checking it out.
function directoryView(directory) {
  return {
    list(folder) {
      try {
        return readdirSync(path.join(directory, folder));
      } catch {
        return [];
      }
    },
    read(file) {
      try {
        return readFileSync(path.join(directory, file), "utf8");
      } catch {
        return null;
      }
    },
  };
}

function commitView(git, ref) {
  return {
    list: (folder) => entriesOf(git("ls-tree", "-z", "--name-only", `${ref}:${folder}`)),
    read: (file) => git("show", `${ref}:${file}`),
  };
}

function plansIn(view) {
  return view
    .list(PLANS_DIRECTORY)
    .filter((name) => name.endsWith(".md") && name !== "README.md")
    .sort()
    .flatMap((name) => {
      const file = `${PLANS_DIRECTORY}/${name}`;
      const text = view.read(file);
      if (text === null) return [];

      const { status, slices, own, problems } = readPlanStatus(text);
      // A plan without slices is one unit of work with no slice number.
      const units = own ? [{ id: null, ...own }] : slices;
      return [{ name: name.replace(/\.md$/, ""), file, status, units, problems }];
    });
}

function listWorktrees(git) {
  const worktrees = [];

  for (const line of linesOf(git("worktree", "list", "--porcelain"))) {
    const latest = worktrees.at(-1);
    if (line.startsWith("worktree ")) {
      worktrees.push({
        path: line.slice("worktree ".length),
        head: null,
        branch: null,
        bare: false,
        prunable: false,
      });
    } else if (!latest) {
      continue;
    } else if (line.startsWith("HEAD ")) {
      latest.head = line.slice("HEAD ".length);
    } else if (line.startsWith(`branch ${LOCAL}`)) {
      latest.branch = line.slice(`branch ${LOCAL}`.length);
    } else if (line === "bare") {
      latest.bare = true;
    } else if (line.startsWith("prunable")) {
      latest.prunable = true;
    }
  }

  return worktrees.filter((worktree) => !worktree.bare);
}

// Modified, staged, and untracked files in a checkout.
function uncommittedFiles(directory) {
  const entries = entriesOf(
    gitIn(directory)("status", "--porcelain", "-z", "--untracked-files=all"),
  );
  const files = [];

  for (let index = 0; index < entries.length; index += 1) {
    files.push(entries[index].slice(3));
    // A rename or copy is followed by the path it came from.
    if (/[RC]/.test(entries[index].slice(0, 2))) {
      index += 1;
      files.push(entries[index]);
    }
  }

  return unique(files.filter(Boolean));
}

function findBase(git) {
  const exists = (ref) => git("rev-parse", "--verify", "--quiet", `${ref}^{commit}`) !== null;

  // The default branch of origin, when Git knows it.
  const head = git("symbolic-ref", "--quiet", "refs/remotes/origin/HEAD")?.trim();
  const candidates = unique([head, `${ORIGIN}main`, `${LOCAL}main`].filter(Boolean));
  const ref = candidates.find(exists);
  if (!ref) return null;

  const name = ref.startsWith(ORIGIN) ? ref.slice(ORIGIN.length) : ref.slice(LOCAL.length);
  return { ref, name, label: ref.startsWith(ORIGIN) ? `origin/${name}` : name };
}

/**
 * Collects the state of the checkout at `root`.
 *
 * - `plans`: each plan in the checkout, with the status of its units of work
 * - `tasks`: active branches and checkouts, with the files and hotspots they
 *   change and the plan progress they record
 * - `overlaps`: hotspots and other files that more than one task changes
 * - `notes`: where the record and Git disagree, and what could not be read
 *
 * With `remote`, branches on origin are included as last fetched.
 */
export function collectStatus({ root, remote = false }) {
  const git = gitIn(root);
  const here = directoryView(root);
  const notes = [];

  const plans = plansIn(here);
  for (const plan of plans) {
    for (const { line, message } of plan.problems) {
      notes.push(`${plan.file}${line ? `:${line}` : ""}: ${message}`);
    }
  }

  const hotspots = readHotspots(here.read(HOTSPOTS_DOCUMENT) ?? "").map(
    (hotspot) => hotspot.pattern,
  );
  if (hotspots.length === 0) {
    notes.push(`no hotspots could be read from ${HOTSPOTS_DOCUMENT}, so none are reported`);
  }

  const state = { checkout: null, base: null, plans, tasks: [], overlaps: [], notes };

  const top = git("rev-parse", "--show-toplevel")?.trim();
  if (!top) {
    notes.push("not a Git checkout, so branches, worktrees, and overlaps are not shown");
    return state;
  }

  const base = findBase(git);
  state.base = base?.label ?? null;
  if (!base) {
    notes.push(
      "no main branch was found here or on origin, so branches are not compared with a base",
    );
  }
  if (git("rev-parse", "--is-shallow-repository")?.trim() === "true") {
    notes.push("this is a shallow clone, so commit counts and changed files may be incomplete");
  }

  const worktrees = listWorktrees(git);
  const branchNames = (prefix) =>
    linesOf(git("for-each-ref", "--format=%(refname)", prefix)).map((ref) =>
      ref.slice(prefix.length),
    );
  const localBranches = branchNames(LOCAL);
  const originBranches = branchNames(ORIGIN).filter((name) => name !== "HEAD");

  const currentWorktree = worktrees.find((worktree) => worktree.path === top) ?? null;
  state.checkout = git("branch", "--show-current")?.trim() || "detached HEAD";

  // Every place work can be: local branches, checkouts with no branch (a
  // detached HEAD, or a rebase in progress), and, when asked, origin.
  const candidates = [
    ...localBranches.map((name) => ({
      label: name,
      name,
      ref: `${LOCAL}${name}`,
      remote: false,
      worktree: worktrees.find((worktree) => worktree.branch === name) ?? null,
    })),
    ...worktrees
      .filter((worktree) => worktree.branch === null && worktree.head)
      .map((worktree) => ({
        label: `detached HEAD at ${worktree.head.slice(0, 7)}`,
        name: null,
        ref: worktree.head,
        remote: false,
        worktree,
      })),
    ...(remote ? originBranches : [])
      .filter((name) => name !== base?.name)
      // A branch that also exists locally is listed once, unless origin has
      // commits that the local branch lacks.
      .filter(
        (name) =>
          !localBranches.includes(name) ||
          Number(git("rev-list", "--count", `${LOCAL}${name}..${ORIGIN}${name}`)?.trim() ?? 0) > 0,
      )
      .map((name) => ({
        label: `origin/${name}`,
        name,
        ref: `${ORIGIN}${name}`,
        remote: true,
        worktree: null,
      })),
  ];

  for (const { label, name, ref, remote: isRemote, worktree } of candidates) {
    const current = worktree !== null && worktree === currentWorktree;
    const missing = worktree !== null && (worktree.prunable || !existsSync(worktree.path));
    const directory = worktree && !missing ? worktree.path : null;

    let ahead = 0;
    let committed = [];
    if (base) {
      ahead = Number(git("rev-list", "--count", `${base.ref}..${ref}`)?.trim() ?? 0);
      // Without rename detection a moved file counts at both of its paths.
      const diff = git("diff", "--name-only", "-z", "--no-renames", `${base.ref}...${ref}`);
      if (diff === null && ahead > 0) {
        notes.push(`${label} has no common history with ${base.label}, so its files are not listed`);
      }
      committed = entriesOf(diff);
    }
    const uncommitted = directory ? uncommittedFiles(directory) : [];

    // A task is active when it has work that the base branch does not have,
    // or when a worktree has been created for it.
    const active =
      ahead > 0 ||
      uncommitted.length > 0 ||
      (worktree !== null && name !== null && base !== null && name !== base.name);
    if (!active) continue;

    const files = unique([...committed, ...uncommitted]).sort();

    // What this task records about its own work, read from its own checkout
    // or commit: status changes travel with the work.
    const records =
      name === null
        ? []
        : plansIn(directory ? directoryView(directory) : commitView(git, ref)).flatMap((plan) =>
            plan.units
              .filter((unit) => unit.branch === name)
              .map((unit) => ({ plan: plan.name, slice: unit.id, status: unit.status })),
          );

    state.tasks.push({
      branch: label,
      name,
      remote: isRemote,
      current,
      worktree: worktree?.path ?? null,
      worktreeMissing: missing,
      ahead,
      uncommitted: uncommitted.length,
      files,
      hotspots: hotspots.filter((pattern) => files.some((file) => matchesHotspot(pattern, file))),
      records,
    });
  }

  for (const plan of plans) {
    for (const unit of plan.units) {
      // Progress that another task has recorded and this checkout lacks.
      unit.elsewhere = state.tasks
        .filter((task) => !task.current)
        .flatMap((task) =>
          task.records
            .filter(
              (record) =>
                record.plan === plan.name &&
                record.slice === unit.id &&
                record.status !== unit.status,
            )
            .map((record) => ({ branch: task.branch, status: record.status })),
        );

      if (
        unit.status === "in-progress" &&
        unit.branch &&
        !localBranches.includes(unit.branch) &&
        !originBranches.includes(unit.branch)
      ) {
        const what = unit.id === null ? plan.name : `${plan.name} slice ${unit.id}`;
        notes.push(
          `${what} is in-progress on ${unit.branch}, ` +
            "but no branch with that name exists here or on origin as last fetched",
        );
      }
    }
  }

  // Hotspots and other files that more than one task changes. A branch and
  // its copy on origin are one task. Plan files are left out: each slice keeps
  // its status below its own heading, so parallel slices merge cleanly.
  const isPlan = (file) => file.startsWith(`${PLANS_DIRECTORY}/`);
  const isHotspot = (file) => hotspots.some((pattern) => matchesHotspot(pattern, file));
  const tasksWith = (test) => {
    const matching = state.tasks.filter(test);
    const distinct = unique(matching.map((task) => task.name ?? task.branch));
    return distinct.length > 1 ? matching.map((task) => task.branch) : null;
  };

  for (const pattern of hotspots) {
    const branches = tasksWith((task) => task.hotspots.includes(pattern));
    if (branches) state.overlaps.push({ path: pattern, hotspot: true, branches });
  }

  const others = unique(state.tasks.flatMap((task) => task.files))
    .filter((file) => !isPlan(file) && !isHotspot(file))
    .sort();
  for (const file of others) {
    const branches = tasksWith((task) => task.files.includes(file));
    if (branches) state.overlaps.push({ path: file, hotspot: false, branches });
  }

  return state;
}

/** Formats the result of `collectStatus` as text. */
export function renderStatus(state) {
  const home = os.homedir();
  const short = (directory) =>
    directory === home || directory.startsWith(`${home}${path.sep}`)
      ? `~${directory.slice(home.length)}`
      : directory;
  const count = (number, noun) => `${number} ${noun}${number === 1 ? "" : "s"}`;

  const out = [];
  out.push(`Agent status${state.checkout ? `: on ${state.checkout}` : ""}`);
  if (state.base) {
    const fetched = state.base.startsWith("origin/") ? " as last fetched" : "";
    out.push(`Branches are compared with ${state.base}${fetched}.`);
  }

  out.push("", "Plans, as recorded in this checkout");
  for (const plan of state.plans.filter((item) => item.status !== "done")) {
    const slices = plan.units.filter((unit) => unit.id !== null);
    const done = slices.filter((unit) => unit.status === "done").length;
    const progress = slices.length > 0 ? `  ${done} of ${count(slices.length, "slice")} done` : "";
    out.push(`  ${plan.name}  ${plan.status ?? "(see Notes)"}${progress}`);

    for (const unit of plan.units) {
      const parts = [
        unit.id === null ? "status" : `slice ${unit.id}`,
        unit.status,
        unit.branch,
        unit.pullRequest,
      ];
      for (const other of unit.elsewhere ?? []) {
        parts.push(`(${other.status} on ${other.branch})`);
      }
      if (unit.notes) parts.push(`note: ${unit.notes}`);
      out.push(`    ${parts.filter(Boolean).join("  ")}`);
    }
  }
  const finished = state.plans.filter((plan) => plan.status === "done").map((plan) => plan.name);
  if (finished.length > 0) out.push(`  done: ${finished.join(", ")}`);
  if (state.plans.length === 0) out.push("  none");

  out.push("", "Active tasks");
  for (const task of state.tasks) {
    const place = task.current
      ? "this checkout"
      : task.worktreeMissing
        ? `worktree missing: ${short(task.worktree)}`
        : task.worktree
          ? short(task.worktree)
          : task.remote
            ? "on origin"
            : "no worktree";
    const facts = [`${count(task.ahead, "commit")} ahead`, `${count(task.files.length, "file")} changed`];
    if (task.uncommitted > 0) facts.push(`${task.uncommitted} uncommitted`);
    out.push(`  ${task.branch}  (${place})  ${facts.join(", ")}`);

    if (task.hotspots.length > 0) out.push(`    hotspots: ${task.hotspots.join(", ")}`);

    for (const plan of unique(task.records.map((record) => record.plan))) {
      const recorded = task.records
        .filter((record) => record.plan === plan)
        .map((record) =>
          record.slice === null ? record.status : `slice ${record.slice} ${record.status}`,
        );
      out.push(`    records: ${plan} ${recorded.join(", ")}`);
    }
  }
  if (state.tasks.length === 0) out.push("  none");

  out.push("", "Overlaps between active tasks");
  const hotspotOverlaps = state.overlaps.filter((overlap) => overlap.hotspot);
  const fileOverlaps = state.overlaps.filter((overlap) => !overlap.hotspot);
  for (const overlap of hotspotOverlaps) {
    out.push(`  hotspot ${overlap.path}: ${overlap.branches.join(", ")}`);
  }
  for (const overlap of fileOverlaps.slice(0, MAX_LISTED_FILES)) {
    out.push(`  ${overlap.path}: ${overlap.branches.join(", ")}`);
  }
  if (fileOverlaps.length > MAX_LISTED_FILES) {
    out.push(`  and ${fileOverlaps.length - MAX_LISTED_FILES} more files. Use --json for all of them.`);
  }
  if (state.overlaps.length === 0) out.push("  none");

  if (state.notes.length > 0) {
    out.push("", "Notes");
    for (const note of state.notes) out.push(`  ${note}`);
  }

  return out.join("\n");
}
