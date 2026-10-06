// Reads task state from the harness documentation:
//
// - the status recorded in an implementation plan (docs/plans/README.md)
// - the Shared Hotspots table (docs/architecture/parallel-development.md)
//
// Pure functions over Markdown text. They read no files and run no commands,
// so `scripts/check-agent-harness.mjs` and `scripts/lib/status.mjs` share one
// definition of the format. See docs/architecture/agent-workflows.md.

export const STATUSES = ["pending", "in-progress", "blocked", "done", "dropped"];

// Work that needs nothing more.
const CLOSED = new Set(["done", "dropped"]);
// Work that shows the plan has begun.
const STARTED = new Set(["in-progress", "done"]);

const SLICE_ID = /^\d+[a-z]?$/;

// Splits Markdown into lines, marking the ones inside fenced code blocks so
// that headings and lists in examples are not read as the document's own.
function linesOf(text) {
  let fence = null;

  return text.split(/\r?\n/).map((line, index) => {
    const number = index + 1;

    if (fence) {
      if (line.trim().startsWith(fence)) fence = null;
      return { number, text: line, code: true };
    }

    const opening = /^\s*(`{3,}|~{3,})/.exec(line);
    if (opening) {
      fence = opening[1];
      return { number, text: line, code: true };
    }

    return { number, text: line, code: false };
  });
}

function headingOf(line) {
  if (line.code) return null;
  const match = /^(#{1,6})\s+(.*?)\s*#*\s*$/.exec(line.text);
  return match ? { level: match[1].length, title: match[2] } : null;
}

// A value without code formatting. Dashes mean "nothing yet".
function valueOf(text) {
  const value = (text ?? "").trim().replace(/^`(.*)`$/, "$1").trim();
  return /^[-–—]*$/.test(value) ? "" : value;
}

function list(values) {
  return values.map((value) => `\`${value}\``).join(", ");
}

// The `- Key: value` list directly below the heading at `index`, as a map from
// lower-case key to value. Blank lines before the list are allowed. The list
// ends at the first line that is not a `- Key: value` item.
function fieldsBelow(lines, index) {
  const fields = new Map();

  let next = index + 1;
  while (next < lines.length && !lines[next].code && lines[next].text.trim() === "") next += 1;

  for (; next < lines.length; next += 1) {
    const item = lines[next].code
      ? null
      : /^\s*[-*]\s+([A-Za-z][A-Za-z ]*?)\s*:\s*(.*)$/.exec(lines[next].text);
    if (!item) break;

    const key = item[1].toLowerCase();
    if (!fields.has(key)) fields.set(key, { value: valueOf(item[2]), line: lines[next].number });
  }

  return fields;
}

// Whether the work as a whole is planned, in progress, or done.
function overallStatus(units) {
  if (units.length === 0) return null;
  if (units.every((unit) => CLOSED.has(unit.status))) return "done";
  if (units.some((unit) => STARTED.has(unit.status))) return "in-progress";
  return "planned";
}

/**
 * Reads the status recorded in an implementation plan.
 *
 * Each slice carries a `- Status:` list directly below its `Slice <n>` heading.
 * A plan without slices carries one directly below its title.
 *
 * Returns:
 *
 * - `slices`: `{ id, status, branch, pullRequest, notes, line }` for each slice
 * - `own`: the same fields, without `id`, for a plan that has no slices
 * - `status`: `planned`, `in-progress`, or `done`, worked out from the above,
 *   or null when the plan has a problem
 * - `problems`: `{ line, message }`; empty when the plan is valid
 */
export function readPlanStatus(text) {
  const lines = linesOf(text);
  const problems = [];
  const problem = (line, message) => problems.push({ line, message });

  // Reads the list below a heading. Returns null when it holds no valid status.
  const unitBelow = (index, name) => {
    const fields = fieldsBelow(lines, index);
    const status = fields.get("status");
    if (!status) return null;

    if (!STATUSES.includes(status.value)) {
      problem(
        status.line,
        `${name} has status "${status.value}", which is not one of ${list(STATUSES)}`,
      );
      return null;
    }

    const unit = {
      status: status.value,
      branch: fields.get("branch")?.value ?? "",
      pullRequest: fields.get("pull request")?.value ?? "",
      notes: fields.get("notes")?.value ?? "",
      line: status.line,
    };
    if (unit.status === "in-progress" && !unit.branch) {
      problem(status.line, `${name} is \`in-progress\` but names no branch. Add \`- Branch:\``);
    }

    return unit;
  };

  const slices = [];
  let sliceHeadings = 0;
  let title = null;

  lines.forEach((line, index) => {
    const heading = headingOf(line);
    if (!heading) return;

    if (heading.level === 1 && title === null) title = index;

    const numbered = /^Slice\s+(\d\S*)/i.exec(heading.title);
    if (!numbered) return;
    sliceHeadings += 1;

    const id = numbered[1].replace(/[:.,;–—-]+$/, "").toLowerCase();
    if (!SLICE_ID.test(id)) {
      problem(line.number, `slice "${id}" must be numbered like \`Slice 1\` or \`Slice 2a\``);
      return;
    }
    if (slices.some((slice) => slice.id === id)) {
      problem(line.number, `more than one heading names slice ${id}`);
      return;
    }

    const before = problems.length;
    const unit = unitBelow(index, `slice ${id}`);
    if (unit) {
      slices.push({ id, ...unit });
    } else if (problems.length === before) {
      problem(line.number, `slice ${id} has no \`- Status:\` line directly below its heading`);
    }
  });

  // A plan without slices is one unit of work, with its status below the title.
  let own = null;
  const beforeTitle = problems.length;
  const titled = title === null ? null : unitBelow(title, "plan");

  if (sliceHeadings === 0) {
    own = titled;
    if (!own && problems.length === beforeTitle) {
      problem(
        title === null ? null : lines[title].number,
        "plan has no slices and no `- Status:` line directly below its title. " +
          "See docs/plans/README.md",
      );
    }
  } else if (titled) {
    problem(
      titled.line,
      "plan has slices, so its status comes from them. Remove the `- Status:` line below the title",
    );
  }

  const status = problems.length > 0 ? null : overallStatus(own ? [own] : slices);

  return { status, slices, own, problems };
}

function isTableRow(line) {
  return !line.code && line.text.trim().startsWith("|");
}

function cellsOf(line) {
  const cells = line.text.trim().split(/(?<!\\)\|/).map((cell) => cell.trim());
  cells.shift();
  if (cells.at(-1) === "") cells.pop();
  return cells;
}

/**
 * Reads the first column of the table below `## Shared Hotspots`: one path, or
 * a directory followed by `/*`, per row. Returns `{ pattern, line }` entries.
 */
export function readHotspots(text) {
  const lines = linesOf(text);

  const start = lines.findIndex((line) => {
    const heading = headingOf(line);
    return heading?.level === 2 && heading.title.toLowerCase() === "shared hotspots";
  });
  if (start === -1) return [];

  const hotspots = [];
  let header = true;

  for (let index = start + 1; index < lines.length; index += 1) {
    const heading = headingOf(lines[index]);
    if (heading && heading.level <= 2) break;

    if (!isTableRow(lines[index])) {
      // The first table ends where its rows end.
      if (!header) break;
      continue;
    }

    const cells = cellsOf(lines[index]);
    if (header) {
      header = false;
    } else if (!cells.every((cell) => /^:?-+:?$/.test(cell))) {
      const pattern = valueOf(cells[0]);
      if (pattern) hotspots.push({ pattern, line: lines[index].number });
    }
  }

  return hotspots;
}

/** Whether a repository-relative file path falls under a hotspot pattern. */
export function matchesHotspot(pattern, file) {
  return pattern.endsWith("/*")
    ? file.startsWith(pattern.slice(0, -1))
    : file === pattern;
}
