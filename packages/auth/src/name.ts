// The rule for a user's name, enforced by the server on sign-up and profile
// update and shared with the sign-up form.
//
// Browser-safe: this module has no imports.

export const NAME_MAX_LENGTH = 100;

// Control characters (C0, DEL, and C1, so tab, CR, LF, and NEL among them) and
// the Unicode line and paragraph separators.
const FORBIDDEN = /[\u0000-\u001f\u007f-\u009f\u2028\u2029]/;

/**
 * Returns `value` trimmed when it is a valid name: a string of 1 to
 * `NAME_MAX_LENGTH` characters after trimming, on one line, with no control
 * characters. Returns `undefined` otherwise.
 */
export function normalizeName(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;

  const name = value.trim();

  if (name.length === 0 || name.length > NAME_MAX_LENGTH || FORBIDDEN.test(name)) {
    return undefined;
  }

  return name;
}
