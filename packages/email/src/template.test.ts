import { describe, expect, it } from "vitest";

import { escapeHtml, html } from "./template";
import { productName } from "./templates/brand";
import { emailVerificationEmail } from "./templates/email-verification";
import { passwordResetEmail } from "./templates/password-reset";

const url =
  "http://localhost:3000/api/auth/reset-password/tok3n?callbackURL=%2Freset&x=1";

describe("html", () => {
  it("escapes every interpolated value", () => {
    expect(escapeHtml(`<a href="x">'&'</a>`)).toBe(
      "&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;",
    );
    expect(html`<p>${"<script>"}</p>`.value).toBe("<p>&lt;script&gt;</p>");
  });

  it("does not escape nested html twice", () => {
    expect(html`<div>${html`<b>${"&"}</b>`}</div>`.value).toBe(
      "<div><b>&amp;</b></div>",
    );
  });
});

describe.each([
  ["password reset", passwordResetEmail],
  ["email verification", emailVerificationEmail],
])("%s template", (_, template) => {
  it("renders a subject and both bodies containing the link", () => {
    const email = template({ url });

    expect(email.subject).toContain(productName);
    expect(email.subject).not.toMatch(/[\r\n]/);
    expect(email.text).toContain(url);
    expect(email.html).toContain(`href="${escapeHtml(url)}"`);
  });

  // The address may not belong to whoever typed the name, so the message
  // greets without it and takes no user-supplied text at all.
  it("greets without a name", () => {
    const email = template({ url });

    expect(email.text.startsWith("Hi,\n")).toBe(true);
    expect(email.html).toContain(">Hi,</p>");
    expect(template({ url, name: "Ada" } as never)).toEqual(email);
  });

  it("escapes a link that tries to break out of its attribute", () => {
    const email = template({
      url: `https://example.com/"><script>alert(1)</script>`,
    });

    expect(email.html).not.toContain("<script>");
  });

  it("rejects links that are not absolute http or https URLs", () => {
    for (const link of ["javascript:alert(1)", "/reset-password", "data:text/html,x"]) {
      expect(() => template({ url: link })).toThrow(TypeError);
    }
  });
});
