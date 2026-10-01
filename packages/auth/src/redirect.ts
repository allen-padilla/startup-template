// The rule for `?redirect=` after sign-in and sign-up: only a relative path on
// the application's own origin is followed. Anything else falls back to the
// default without an error, so there is nothing to probe. See
// docs/specs/auth-pages.md.
//
// Browser-safe: this module has no imports.

export const DEFAULT_REDIRECT = "/account";

// Any origin works here: the check is whether resolving a path changes it.
const BASE = "http://redirect.invalid";

// A signed-in visitor to these pages is sent on to the redirect target, so
// they are never targets themselves.
const AUTH_PAGES = new Set(["/sign-in", "/sign-up"]);

const CONTROL_CHARACTER = /[\u0000-\u001f\u007f]/;

/**
 * Returns `value` as a same-origin path, with its query and fragment, or
 * `fallback` when it is missing or unsafe.
 */
export function safeRedirectPath(
  value: string | null | undefined,
  fallback = DEFAULT_REDIRECT,
): string {
  if (typeof value !== "string" || !isPlainPath(value)) return fallback;

  // Percent-encoded forms of `//` and `\` are as unsafe as the plain ones.
  const decoded = decode(value);
  if (decoded === undefined || !isPlainPath(decoded)) return fallback;

  const url = new URL(value, BASE);
  if (url.origin !== BASE) return fallback;

  const page = decode(url.pathname)?.replace(/\/+$/, "");
  if (page === undefined || AUTH_PAGES.has(page)) return fallback;

  return `${url.pathname}${url.search}${url.hash}`;
}

function isPlainPath(path: string): boolean {
  return (
    path.startsWith("/") &&
    !path.startsWith("//") &&
    !path.includes("\\") &&
    !CONTROL_CHARACTER.test(path)
  );
}

function decode(text: string): string | undefined {
  try {
    return decodeURIComponent(text);
  } catch {
    return undefined;
  }
}
