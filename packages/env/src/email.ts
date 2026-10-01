import { z } from "zod";

// Line breaks and other control characters would let a value inject SMTP
// headers, so no email setting may contain them.
const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f]/;

// Characters that RFC 5322 only allows in a display name when it is quoted.
const UNQUOTED_NAME_SPECIALS = /[()<>[\]:;@\\,."]/;

const address = z.email();

/**
 * `SMTP_URL`: an `smtp://` or `smtps://` URL with a host. Credentials, when
 * present, are part of the URL and must be percent-encoded.
 */
export const smtpUrl = z.string().refine(
  (value) => {
    if (CONTROL_CHARACTERS.test(value)) return false;

    try {
      const url = new URL(value);

      return (url.protocol === "smtp:" || url.protocol === "smtps:") &&
        url.hostname !== "";
    } catch {
      return false;
    }
  },
  { message: "must be an smtp:// or smtps:// URL with a host" },
);

/**
 * `EMAIL_FROM`: a bare address (`no-reply@example.com`) or a display name and
 * an address (`Startup Template <no-reply@example.com>`). A display name with
 * special characters must be quoted.
 */
export const emailFrom = z.string().refine(isValidEmailFrom, {
  message:
    'must be an address or "Display Name <address>" without line breaks',
});

function isValidEmailFrom(value: string) {
  if (CONTROL_CHARACTERS.test(value)) return false;

  const named = /^(.*?)\s*<([^<>]+)>$/.exec(value.trim());

  if (!named) return address.safeParse(value.trim()).success;

  const [, name = "", email = ""] = named;

  return isValidDisplayName(name) && address.safeParse(email).success;
}

function isValidDisplayName(name: string) {
  if (name === "") return true;

  if (name.startsWith('"') && name.endsWith('"') && name.length >= 2) {
    // Inside quotes, only a backslash-escaped quote may appear.
    return !/(^|[^\\])"/.test(name.slice(1, -1));
  }

  return !UNQUOTED_NAME_SPECIALS.test(name);
}
