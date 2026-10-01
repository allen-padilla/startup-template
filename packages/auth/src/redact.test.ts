import { describe, expect, it } from "vitest";

import { REDACTED, redactAuthTokens, scrubAuthTokens } from "./redact";

const TOKEN = "AbC123xyz789TokenValue";

describe("redactAuthTokens", () => {
  it.each([
    ["a reset link path", `/api/auth/reset-password/${TOKEN}`],
    ["a reset link with a query", `/api/auth/reset-password/${TOKEN}?callbackURL=%2Freset-password`],
    ["a full reset link URL", `http://127.0.0.1:3000/api/auth/reset-password/${TOKEN}#top`],
    ["a percent-encoded reset path", `/next?to=%2Fapi%2Fauth%2Freset-password%2F${TOKEN}`],
    ["a token query parameter", `/reset-password?token=${TOKEN}`],
    ["a later token query parameter", `/api/auth/verify-email?callbackURL=%2Faccount&token=${TOKEN}`],
    ["a parameter name containing token", `/x?resetToken=${TOKEN}&a=1`],
    ["an upper-case parameter name", `/x?TOKEN=${TOKEN}`],
    ["text around a URL", `GET /api/auth/reset-password/${TOKEN} failed`],
  ])("removes the token from %s", (_, text) => {
    const redacted = redactAuthTokens(text);

    expect(redacted).not.toContain(TOKEN);
    expect(redacted).toContain(REDACTED);
  });

  it("keeps the rest of the URL", () => {
    expect(
      redactAuthTokens(`/api/auth/reset-password/${TOKEN}?callbackURL=%2Freset-password`),
    ).toBe(`/api/auth/reset-password/${REDACTED}?callbackURL=%2Freset-password`);
    expect(redactAuthTokens(`/reset-password?token=${TOKEN}&next=1#form`)).toBe(
      `/reset-password?token=${REDACTED}&next=1#form`,
    );
  });

  it.each([
    "/api/auth/reset-password",
    "/api/auth/request-password-reset",
    "/reset-password",
    "/reset-password?error=INVALID_TOKEN",
    "/api/auth/get-session",
  ])("leaves %s unchanged", (text) => {
    expect(redactAuthTokens(text)).toBe(text);
  });
});

describe("scrubAuthTokens", () => {
  it("redacts strings at any depth in a copy", () => {
    const event = {
      name: "GET /api/auth/[...all]",
      attributes: {
        "url.full": { value: `http://127.0.0.1:3000/api/auth/reset-password/${TOKEN}`, type: "string" },
        "http.target": { value: `/api/auth/reset-password/${TOKEN}`, type: "string" },
        "http.status_code": { value: 302, type: "integer" },
      },
      breadcrumbs: [{ data: { to: `/reset-password?token=${TOKEN}` } }],
    };

    const scrubbed = scrubAuthTokens(event);

    expect(JSON.stringify(scrubbed)).not.toContain(TOKEN);
    expect(scrubbed.name).toBe(event.name);
    expect(scrubbed.attributes["http.status_code"].value).toBe(302);
    expect(event.attributes["http.target"].value).toContain(TOKEN);
  });

  it("handles circular references", () => {
    const event: Record<string, unknown> = { url: `/api/auth/reset-password/${TOKEN}` };
    event.self = event;

    const scrubbed = scrubAuthTokens(event);

    expect(scrubbed.url).not.toContain(TOKEN);
    expect(scrubbed.self).toBe(scrubbed);
  });

  it("keeps values that are not strings, arrays, or plain objects", () => {
    const date = new Date(0);

    expect(scrubAuthTokens({ date, count: 1, ok: true, none: null })).toEqual({
      date,
      count: 1,
      ok: true,
      none: null,
    });
  });
});
