// Authentication links carry tokens in their URLs: the password reset link in
// its path (`/reset-password/<token>`), and other links in a `token` query
// parameter. Observability hooks pass everything they send through
// `scrubAuthTokens`, so tokens never leave the application.
//
// Browser-safe: this module has no imports.

/** Matches the value Sentry uses for the data it filters itself. */
export const REDACTED = "[Filtered]";

// The reset link's path segment, also when percent-encoded inside another URL.
const RESET_PATH_TOKEN = /((?:\/|%2F)reset-password(?:\/|%2F))[^/?#&\s"'%]+/gi;

// The value of any query parameter whose name contains "token".
const TOKEN_QUERY_VALUE = /([?&][^=&#\s"']*token[^=&#\s"']*=)[^&#\s"']+/gi;

export function redactAuthTokens(text: string): string {
  return text
    .replace(RESET_PATH_TOKEN, `$1${REDACTED}`)
    .replace(TOKEN_QUERY_VALUE, `$1${REDACTED}`);
}

/**
 * Returns a copy of `value` with tokens redacted from every string in it, at
 * any depth. Objects other than plain objects and arrays are kept as they are.
 */
export function scrubAuthTokens<T>(value: T): T {
  return scrub(value, new WeakMap()) as T;
}

function scrub(value: unknown, seen: WeakMap<object, unknown>): unknown {
  if (typeof value === "string") return redactAuthTokens(value);
  if (typeof value !== "object" || value === null) return value;

  const copied = seen.get(value);
  if (copied !== undefined) return copied;

  if (Array.isArray(value)) {
    const copy: unknown[] = [];
    seen.set(value, copy);
    for (const item of value) copy.push(scrub(item, seen));
    return copy;
  }

  const prototype: unknown = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) return value;

  const copy: Record<string, unknown> = {};
  seen.set(value, copy);
  for (const [key, item] of Object.entries(value)) copy[key] = scrub(item, seen);
  return copy;
}
