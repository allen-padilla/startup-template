import { parseEnv } from "node:util";

const SECRET_LINE = /^([ \t]*(?:export[ \t]+)?)BETTER_AUTH_SECRET[ \t]*=.*$/m;

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
 * An existing assignment is replaced in place, keeping its `export` prefix
 * and indentation; otherwise the line is appended. Every other line is left
 * as it is.
 */
export function withSecret(text, secret) {
  const line = `BETTER_AUTH_SECRET=${secret}`;

  return SECRET_LINE.test(text)
    ? text.replace(SECRET_LINE, `$1${line}`)
    : `${text.replace(/\n*$/, "\n")}${line}\n`;
}
