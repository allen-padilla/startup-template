import { describe, expect, it } from "vitest";

import { serverSchema } from "./server";

const required = {
  DATABASE_URL: "postgresql://unused@127.0.0.1:5432/unused",
  BETTER_AUTH_SECRET: "test-only-secret-that-is-at-least-32-chars",
  BETTER_AUTH_URL: "http://localhost:3000",
};

const smtpUrl = "smtps://user:s3cr%40t-password@smtp.example.com:465";
const sender = "Startup Template <no-reply@example.com>";

function parse(email: { SMTP_URL?: string; EMAIL_FROM?: string }) {
  return serverSchema.safeParse({ ...required, ...email });
}

function errorText(email: { SMTP_URL?: string; EMAIL_FROM?: string }) {
  const result = parse(email);

  expect(result.success).toBe(false);

  return result.error?.message ?? "";
}

describe("email configuration", () => {
  it("is disabled when both variables are empty or unset", () => {
    for (const email of [{}, { SMTP_URL: "", EMAIL_FROM: "" }]) {
      const result = parse(email);

      expect(result.success).toBe(true);
      expect(result.data?.SMTP_URL).toBeUndefined();
      expect(result.data?.EMAIL_FROM).toBeUndefined();
    }
  });

  it("accepts a valid connection string and sender", () => {
    for (const from of [
      sender,
      "no-reply@example.com",
      "<no-reply@example.com>",
      '"Startup, Inc." <no-reply@example.com>',
    ]) {
      const result = parse({ SMTP_URL: smtpUrl, EMAIL_FROM: from });

      expect(result.success, from).toBe(true);
    }

    expect(
      parse({ SMTP_URL: "smtp://localhost:1025", EMAIL_FROM: sender }).success,
    ).toBe(true);
  });

  it("rejects one variable without the other and names the missing one", () => {
    const withoutSender = errorText({ SMTP_URL: smtpUrl });

    expect(withoutSender).toContain("EMAIL_FROM is required");
    expect(withoutSender).not.toContain("s3cr");

    const withoutUrl = errorText({ EMAIL_FROM: sender });

    expect(withoutUrl).toContain("SMTP_URL is required");
    expect(withoutUrl).not.toContain("no-reply@example.com");
  });

  it("rejects a connection string that is not an SMTP URL", () => {
    for (const value of [
      "not a url",
      "https://smtp.example.com",
      "smtp://",
      "smtp://smtp.example.com\r\nRCPT TO:<x@example.com>",
    ]) {
      expect(errorText({ SMTP_URL: value, EMAIL_FROM: sender })).toContain(
        "SMTP_URL",
      );
    }
  });

  it("rejects an invalid sender, including line breaks", () => {
    for (const value of [
      "not an address",
      "Startup Template no-reply@example.com",
      "Startup, Inc. <no-reply@example.com>",
      "Startup <no-reply@example.com>\r\nBcc: x@example.com",
      "no-reply@example.com\n",
    ]) {
      expect(errorText({ SMTP_URL: smtpUrl, EMAIL_FROM: value })).toContain(
        "EMAIL_FROM",
      );
    }
  });

  it("never includes a value in a validation error", () => {
    const message = errorText({
      SMTP_URL: "smtps://user:s3cr%40t-password@",
      EMAIL_FROM: sender,
    });

    expect(message).not.toContain("s3cr");
    expect(message).not.toContain("user:");
  });
});
