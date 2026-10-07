import { parseEnv } from "node:util";

/**
 * Whether the dotenv text sets a non-empty `BETTER_AUTH_SECRET`, reading it
 * the way Node's `--env-file` does, so `export`, spacing, quotes, and
 * trailing comments count the same as they do at runtime.
 */
export function hasSecret(text) {
  return Boolean(parseEnv(text).BETTER_AUTH_SECRET);
}

/**
 * Returns the dotenv text with `BETTER_AUTH_SECRET` set to `secret`.
 *
 * Append the effective assignment: Node uses the last duplicate key. This
 * preserves existing text, including multiline values that contain a line
 * resembling an assignment, without needing another dotenv parser.
 */
export function withSecret(text, secret) {
  const line = `BETTER_AUTH_SECRET=${secret}`;

  return `${text}${text && !text.endsWith("\n") ? "\n" : ""}${line}\n`;
}
