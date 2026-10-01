import { afterEach, describe, expect, it, vi } from "vitest";

import { EmailDeliveryError } from "@startup/email";

import { BASE_URL, createTestAuth, linkIn } from "./testing/auth";

type TestAuth = Awaited<ReturnType<typeof createTestAuth>>;

let t: TestAuth;
let open: TestAuth | undefined;

afterEach(async () => {
  await open?.close();
  open = undefined;
  vi.restoreAllMocks();
});

function follow(link: string) {
  return t.request(link.replace(`${BASE_URL}/api/auth`, ""));
}

describe("email verification", () => {
  it("sends a link on sign-up that marks the address as verified", async () => {
    open = t = await createTestAuth();
    const { response, cookie } = await t.signUp("ada@example.com");

    expect(response.status).toBe(200);
    expect(t.sent).toHaveLength(1);
    expect(t.sent[0]?.to).toBe("ada@example.com");
    expect((await t.getSession(cookie))?.user.emailVerified).toBe(false);

    const verified = await follow(linkIn(t.sent[0]));

    expect(verified.status).toBe(302);
    expect(verified.headers.get("location")).toBe("/");
    expect((await t.getSession(cookie))?.user.emailVerified).toBe(true);
  });

  it("does not block sign-in for an unverified address", async () => {
    open = t = await createTestAuth();
    await t.signUp("ada@example.com");

    const response = await t.request("/sign-in/email", {
      body: { email: "ada@example.com", password: "first-password-123" },
    });

    expect(response.status).toBe(200);
  });

  it("lets sign-up succeed when the email cannot be sent", async () => {
    open = t = await createTestAuth({
      sendEmail: () => Promise.reject(new EmailDeliveryError("timeout")),
    });

    const { response, cookie } = await t.signUp("ada@example.com");

    expect(response.status).toBe(200);
    expect(await t.getSession(cookie)).not.toBeNull();
    expect(t.failures).toHaveLength(1);
    expect(t.failures[0]).toBeInstanceOf(EmailDeliveryError);
  });

  it("rejects an altered link", async () => {
    open = t = await createTestAuth();

    const response = await t.request("/verify-email?token=altered");

    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({ code: "INVALID_TOKEN" });
  });

  it("lets only a signed-in user request a new link", async () => {
    open = t = await createTestAuth();
    const { cookie } = await t.signUp("ada@example.com");
    t.sent.length = 0;

    const anonymous = await t.request("/send-verification-email", {
      body: { email: "ada@example.com" },
    });

    expect(anonymous.status).toBe(401);
    expect(t.sent).toHaveLength(0);

    const signedIn = await t.request("/send-verification-email", {
      body: { email: "ada@example.com" },
      cookie,
    });

    expect(signedIn.status).toBe(200);
    expect(t.sent).toHaveLength(1);
  });
});

describe("when email is not configured", () => {
  it("keeps sign-up and sign-in working and warns once", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    open = t = await createTestAuth({ sendEmail: undefined });

    expect((await t.signUp("ada@example.com")).response.status).toBe(200);
    expect((await t.signUp("grace@example.com")).response.status).toBe(200);

    const signIn = await t.request("/sign-in/email", {
      body: { email: "ada@example.com", password: "first-password-123" },
    });

    expect(signIn.status).toBe(200);
    expect(t.sent).toHaveLength(0);
    expect(
      warn.mock.calls.filter(([text]) => String(text).includes("Email is not configured")),
    ).toHaveLength(1);
  });

  it("answers reset and verification requests with 503 for every address", async () => {
    open = t = await createTestAuth({ sendEmail: undefined });
    const { cookie } = await t.signUp("ada@example.com");

    const responses = [
      await t.request("/request-password-reset", { body: { email: "ada@example.com" } }),
      await t.request("/request-password-reset", { body: { email: "nobody@example.com" } }),
      await t.request("/send-verification-email", { body: { email: "ada@example.com" }, cookie }),
    ];

    for (const response of responses) {
      expect(response.status).toBe(503);
      expect(await response.json()).toEqual({
        code: "EMAIL_NOT_AVAILABLE",
        message: "Email is not available.",
      });
    }
  });
});
