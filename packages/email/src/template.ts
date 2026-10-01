/** What a template renders: the subject and both bodies of one message. */
export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
}

/** A message template: typed input in, a rendered message out. */
export type EmailTemplate<Input> = (input: Input) => RenderedEmail;

const HTML_ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

/** Escapes a value for HTML text and quoted attribute values. */
export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => HTML_ESCAPES[character]!);
}

/** HTML that is already safe, such as the result of `html`. */
export class SafeHtml {
  constructor(readonly value: string) {}

  toString() {
    return this.value;
  }
}

type HtmlValue = string | number | SafeHtml | readonly HtmlValue[];

/**
 * Builds HTML from a template literal. Every interpolated value is escaped,
 * except `SafeHtml` from a nested `html` call.
 */
export function html(
  strings: TemplateStringsArray,
  ...values: HtmlValue[]
): SafeHtml {
  return new SafeHtml(
    strings.reduce(
      (result, string, index) =>
        result + string + (index < values.length ? render(values[index]!) : ""),
      "",
    ),
  );
}

function render(value: HtmlValue): string {
  if (value instanceof SafeHtml) return value.value;
  if (Array.isArray(value)) return value.map(render).join("");

  return escapeHtml(String(value));
}

/**
 * Returns `url` when it is an absolute `http:` or `https:` URL. Templates use
 * it for links, so a message never carries a `javascript:` or relative link.
 */
export function assertHttpUrl(url: string): string {
  let protocol: string;

  try {
    protocol = new URL(url).protocol;
  } catch {
    throw new TypeError("Email links must be absolute URLs.");
  }

  if (protocol !== "https:" && protocol !== "http:") {
    throw new TypeError("Email links must use http or https.");
  }

  return url;
}
