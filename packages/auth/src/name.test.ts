import { afterEach, describe, expect, it } from "vitest";

import { NAME_MAX_LENGTH, normalizeName } from "./name";
import { createTestAuth, sessionCookie } from "./testing/auth";

type TestAuth = Awaited<ReturnType<typeof createTestAuth>>;

let t: TestAuth;
let open: TestAuth | undefined;

afterEach(async () => {
  await open?.close();
  open = undefined;
});

const PASSWORD = "first-password-123";
const MULTI_LINE = "Ada\n\nYour account is locked: https://evil.example/unlock";

function signUp(name: unknown) {
  return t.request("/sign-up/email", {
    body: { name, email: "ada@example.com", password: PASSWORD },
  });
}

describe("normalizeName", () => {
  it("accepts 1 to 100 characters after trimming, and trims them", () => {
    expect(normalizeName("Ada Lovelace")).toBe("Ada Lovelace");
    expect(normalizeName("  Ada  ")).toBe("Ada");
    expect(normalizeName("A")).toBe("A");
    expect(normalizeName("a".repeat(NAME_MAX_LENGTH))).toBe("a".repeat(NAME_MAX_LENGTH));
    expect(normalizeName(` ${"a".repeat(NAME_MAX_LENGTH)} `)).toBe("a".repeat(NAME_MAX_LENGTH));
    expect(normalizeName("Zoë Ō'Brien-李")).toBe("Zoë Ō'Brien-李");
  });

  it("rejects empty and over-long names", () => {
    for (const name of ["", "   ", "a".repeat(NAME_MAX_LENGTH + 1), "a".repeat(50_000)]) {
      expect(normalizeName(name), `${name.length} characters`).toBeUndefined();
    }
  });

  it("rejects line breaks and control characters", () => {
    for (const name of [
      MULTI_LINE,
      "Ada\nLovelace",
      "Ada\rLovelace",
      "Ada\tLovelace",
      "Ada\u0000",
      "Ada\u001b[31m",
      "Ada\u007f",
      "Ada\u0085Lovelace",
      "Ada Lovelace",
      "Ada Lovelace",
    ]) {
      expect(normalizeName(name), JSON.stringify(name)).toBeUndefined();
    }
  });

  it("rejects values that are not strings", () => {
    for (const name of [undefined, null, 42, ["Ada"], { name: "Ada" }]) {
      expect(normalizeName(name)).toBeUndefined();
    }
  });
});

describe("names on the server", () => {
  async function storedName(cookie: string) {
    const response = await t.request("/get-session", { cookie });

    return ((await response.json()) as { user: { name: string } }).user.name;
  }

  it("rejects an invalid name at sign-up before creating the account or sending email", async () => {
    open = t = await createTestAuth();

    for (const name of [MULTI_LINE, "a".repeat(50_000), "   ", 42, undefined]) {
      const response = await signUp(name);

      expect(response.status).toBe(400);
      expect(await response.json()).toMatchObject({ code: "INVALID_NAME" });
    }

    expect(t.sent).toHaveLength(0);

    const signIn = await t.request("/sign-in/email", {
      body: { email: "ada@example.com", password: PASSWORD },
    });

    expect(signIn.status).toBe(401);
  });

  it("stores the trimmed name at sign-up", async () => {
    open = t = await createTestAuth();

    const response = await signUp("  Ada Lovelace  ");

    expect(response.status).toBe(200);
    expect(await storedName(sessionCookie(response))).toBe("Ada Lovelace");
  });

  it("applies the same rule to profile updates", async () => {
    open = t = await createTestAuth();
    const { cookie } = await t.signUp("ada@example.com");

    for (const name of [MULTI_LINE, "a".repeat(50_000), "", 42, { first: "Ada" }]) {
      const response = await t.request("/update-user", { body: { name }, cookie });

      expect(response.status).toBe(400);
      expect(await response.json()).toMatchObject({ code: "INVALID_NAME" });
    }

    expect(await storedName(cookie)).toBe("Ada Lovelace");

    const updated = await t.request("/update-user", {
      body: { name: "  Countess of Lovelace " },
      cookie,
    });

    expect(updated.status).toBe(200);
    expect(await storedName(cookie)).toBe("Countess of Lovelace");
  });

  it("lets a profile update leave the name out", async () => {
    open = t = await createTestAuth();
    const { cookie } = await t.signUp("ada@example.com");

    const response = await t.request("/update-user", {
      body: { image: "https://example.com/ada.png" },
      cookie,
    });

    expect(response.status).toBe(200);
    expect(await storedName(cookie)).toBe("Ada Lovelace");
  });
});

describe("authentication emails", () => {
  it("never include the name", async () => {
    open = t = await createTestAuth();
    const name = "Ada https://evil.example/unlock";

    expect((await signUp(name)).status).toBe(200);
    expect(
      (await t.request("/request-password-reset", {
        body: { email: "ada@example.com", redirectTo: "/reset-password" },
      })).status,
    ).toBe(200);

    expect(t.sent).toHaveLength(2);

    for (const message of t.sent) {
      for (const body of [message.subject, message.text, message.html]) {
        expect(body).not.toContain("evil.example");
        expect(body).not.toContain("Ada");
      }
      expect(message.text.startsWith("Hi,\n")).toBe(true);
    }
  });
});
