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
    const email = template({ name: "Ada", url });

    expect(email.subject).toContain(productName);
    expect(email.subject).not.toMatch(/[\r\n]/);
    expect(email.text).toContain("Hi Ada,");
    expect(email.text).toContain(url);
    expect(email.html).toContain("Hi Ada,");
    expect(email.html).toContain(`href="${escapeHtml(url)}"`);
  });

  it("escapes user-supplied values in the HTML body", () => {
    const email = template({
      name: `<img src=x onerror="alert(1)">`,
      url,
    });

    expect(email.html).not.toContain("<img");
    expect(email.html).toContain("&lt;img src=x onerror=&quot;alert(1)&quot;&gt;");
  });

  it("escapes a link that tries to break out of its attribute", () => {
    const email = template({
      name: "Ada",
      url: `https://example.com/"><script>alert(1)</script>`,
    });

    expect(email.html).not.toContain("<script>");
  });

  it("rejects links that are not absolute http or https URLs", () => {
    for (const link of ["javascript:alert(1)", "/reset-password", "data:text/html,x"]) {
      expect(() => template({ name: "Ada", url: link })).toThrow(TypeError);
    }
  });
});
