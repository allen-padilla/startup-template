import { describe, expect, it } from "vitest";

import { DEFAULT_REDIRECT, safeRedirectPath } from "./redirect";

describe("safeRedirectPath", () => {
  it.each([
    ["/account", "/account"],
    ["/account?verified=1", "/account?verified=1"],
    ["/account?x=1#top", "/account?x=1#top"],
    ["/account?error=INVALID_TOKEN&verified=1", "/account?error=INVALID_TOKEN&verified=1"],
    ["/boards/123", "/boards/123"],
    ["/", "/"],
  ])("follows %s", (value, expected) => {
    expect(safeRedirectPath(value)).toBe(expected);
  });

  it.each([
    ["a missing value", undefined],
    ["null", null],
    ["an empty value", ""],
    ["an absolute URL", "https://example.com"],
    ["an absolute URL on the same host name", "http://localhost:3000/account"],
    ["a protocol-relative URL", "//example.com"],
    ["a protocol-relative URL with a path", "//example.com/account"],
    ["a slash and a backslash", "/\\example.com"],
    ["two backslashes", "\\\\example.com"],
    ["a percent-encoded protocol-relative URL", "%2F%2Fexample.com"],
    ["a path that decodes to a protocol-relative URL", "/%2F%2Fexample.com"],
    ["a percent-encoded backslash", "/%5Cexample.com"],
    ["a relative path without a leading slash", "account"],
    ["a dot-relative path", "./account"],
    ["a javascript: URL", "javascript:alert(1)"],
    ["a data: URL", "data:text/html,hi"],
    ["a tab inside the slashes", "/\t/example.com"],
    ["a newline", "/account\n"],
    ["a percent-encoded newline", "/account%0A"],
    ["malformed percent-encoding", "/account?x=%E0%A4%A"],
    ["the sign-in page", "/sign-in"],
    ["the sign-in page with a query", "/sign-in?redirect=/account"],
    ["the sign-up page with a trailing slash", "/sign-up/"],
    ["a dot segment that resolves to sign-in", "/./sign-in"],
    ["a percent-encoded sign-in path", "/%73ign-in"],
  ])("falls back for %s", (_, value) => {
    expect(safeRedirectPath(value)).toBe(DEFAULT_REDIRECT);
  });

  it("falls back to the given default", () => {
    expect(safeRedirectPath("//example.com", "/")).toBe("/");
    expect(safeRedirectPath("/account", "/")).toBe("/account");
  });

  it("defaults to the account page", () => {
    expect(DEFAULT_REDIRECT).toBe("/account");
  });
});
