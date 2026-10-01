import { afterEach, describe, expect, it } from "vitest";

import { schema } from "@startup/db";
import { EmailDeliveryError } from "@startup/email";

import { BASE_URL, createTestAuth, linkIn } from "./testing/auth";

type TestAuth = Awaited<ReturnType<typeof createTestAuth>>;

let t: TestAuth;
let open: TestAuth | undefined;

afterEach(async () => {
  await open?.close();
  open = undefined;
});

async function requestReset(email: string, redirectTo = "/reset-password") {
  return t.request("/request-password-reset", { body: { email, redirectTo } });
}

// Follows the emailed link the way a browser would and returns the token from
// the redirect to the product's reset page.
async function tokenFromLink(link: string) {
  const response = await t.request(link.replace(`${BASE_URL}/api/auth`, ""));
  const location = new URL(response.headers.get("location") ?? "", BASE_URL);

  expect(response.status).toBe(302);
  expect(location.origin).toBe(BASE_URL);
  expect(location.pathname).toBe("/reset-password");

  return location.searchParams.get("token") ?? "";
}

async function resetPassword(token: string, newPassword = "second-password-456") {
  return t.request("/reset-password", { body: { token, newPassword } });
}

async function signIn(email: string, password: string) {
  return t.request("/sign-in/email", { body: { email, password } });
}

describe("password reset", () => {
  it("emails a reset link that sets a new password once and ends every session", async () => {
    open = t = await createTestAuth();
    const { cookie } = await t.signUp("ada@example.com");
    t.sent.length = 0;

    const response = await requestReset("ada@example.com");

    expect(response.status).toBe(200);
    expect(t.sent).toHaveLength(1);
    expect(t.sent[0]?.to).toBe("ada@example.com");
    expect(t.sent[0]?.html).toContain("Reset your password");

    const token = await tokenFromLink(linkIn(t.sent[0]));

    expect((await resetPassword(token)).status).toBe(200);
    expect((await signIn("ada@example.com", "second-password-456")).status).toBe(200);
    expect((await signIn("ada@example.com", "first-password-123")).status).toBe(401);
    expect(await t.getSession(cookie)).toBeNull();

    const reused = await resetPassword(token, "third-password-789");

    expect(reused.status).toBe(400);
    expect(await reused.json()).toMatchObject({ code: "INVALID_TOKEN" });
  });

  it("gives an unknown address the same response and sends nothing", async () => {
    open = t = await createTestAuth();
    await t.signUp("ada@example.com");
    t.sent.length = 0;

    const known = await requestReset("ada@example.com");
    const unknown = await requestReset("nobody@example.com");

    expect(unknown.status).toBe(known.status);
    expect(await unknown.json()).toEqual(await known.json());
    expect(t.sent.map((message) => message.to)).toEqual(["ada@example.com"]);
  });

  it("sends a second email for a second request, and each link works once", async () => {
    open = t = await createTestAuth();
    await t.signUp("ada@example.com");
    t.sent.length = 0;

    await requestReset("ada@example.com");
    await requestReset("ada@example.com");

    expect(t.sent).toHaveLength(2);

    const first = await tokenFromLink(linkIn(t.sent[0]));
    const second = await tokenFromLink(linkIn(t.sent[1]));

    expect(first).not.toBe(second);
    expect((await resetPassword(first)).status).toBe(200);
    expect((await resetPassword(second, "third-password-789")).status).toBe(200);
    expect((await resetPassword(first, "fourth-password-012")).status).toBe(400);
  });

  it("rejects an expired link with a generic error", async () => {
    open = t = await createTestAuth();
    await t.signUp("ada@example.com");
    t.sent.length = 0;
    await requestReset("ada@example.com");
    const token = await tokenFromLink(linkIn(t.sent[0]));

    await t.db
      .update(schema.verification)
      .set({ expiresAt: new Date(Date.now() - 1000) });

    const response = await resetPassword(token);

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ code: "INVALID_TOKEN" });

    const link = await t.request(
      linkIn(t.sent[0]).replace(`${BASE_URL}/api/auth`, ""),
    );

    expect(link.headers.get("location")).toContain("error=INVALID_TOKEN");
  });

  it("rejects an altered link", async () => {
    open = t = await createTestAuth();

    const response = await resetPassword("not-a-real-token");

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ code: "INVALID_TOKEN" });
  });

  it("answers the same when delivery fails, and reports no link or token", async () => {
    let attempted = "";

    open = t = await createTestAuth({
      sendEmail: async (message) => {
        attempted = message.text;
        throw new EmailDeliveryError("connection");
      },
    });
    await t.signUp("ada@example.com");

    const response = await requestReset("ada@example.com");

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ status: true });

    const token = /reset-password\/([^?\s]+)/.exec(attempted)?.[1] ?? "";

    expect(token).not.toBe("");
    const reported = t.failures.find((error) => error instanceof EmailDeliveryError);

    expect(reported).toBeDefined();
    expect(JSON.stringify(reported) + String(reported)).not.toContain(token);
  });

  it("only redirects to the application's own origin", async () => {
    open = t = await createTestAuth();
    await t.signUp("ada@example.com");

    expect((await requestReset("ada@example.com", "https://evil.example/steal")).status).toBe(403);
    expect((await requestReset("ada@example.com", "//evil.example/steal")).status).toBe(403);
    expect((await requestReset("ada@example.com", `${BASE_URL}/reset-password`)).status).toBe(200);
  });
});
