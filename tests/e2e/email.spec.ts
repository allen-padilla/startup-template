// tests/e2e/email.spec.ts
import { randomInt, randomUUID } from "node:crypto";

import {
  expect,
  test,
  type APIRequestContext,
  type Playwright,
} from "@playwright/test";

import { linkPath, messagesTo, waitForMessage } from "./support/mailpit";

const OLD_PASSWORD = "first-password-123";
const NEW_PASSWORD = "second-password-456";

// Each test gets its own address and client IP, so tests never share a
// mailbox or a rate-limit bucket. The production server enforces the limits.
function uniqueAddress() {
  return `e2e-${randomUUID()}@example.test`;
}

function uniqueIp() {
  return `10.${randomInt(256)}.${randomInt(256)}.${randomInt(1, 255)}`;
}

// A context without cookies. Better Auth checks the Origin header of requests
// that carry cookies; these API calls send none, like a server-side caller.
async function client(playwright: Playwright, baseURL: string | undefined, ip: string) {
  return playwright.request.newContext({
    baseURL,
    extraHTTPHeaders: { "x-forwarded-for": ip },
  });
}

async function signUp(request: APIRequestContext, email: string) {
  const response = await request.post("/api/auth/sign-up/email", {
    data: { name: "E2E User", email, password: OLD_PASSWORD },
  });

  expect(response.status()).toBe(200);
}

async function signIn(request: APIRequestContext, email: string, password: string) {
  return request.post("/api/auth/sign-in/email", { data: { email, password } });
}

async function session(request: APIRequestContext) {
  const response = await request.get("/api/auth/get-session");

  return (await response.json()) as { user: { emailVerified: boolean } } | null;
}

test("password reset by email sets a new password and ends existing sessions", async ({
  playwright,
  baseURL,
}) => {
  const email = uniqueAddress();
  const ip = uniqueIp();
  const user = await client(playwright, baseURL, ip);
  const anonymous = await client(playwright, baseURL, ip);

  await signUp(user, email);
  expect(await session(user)).not.toBeNull();

  const requested = await anonymous.post("/api/auth/request-password-reset", {
    data: { email, redirectTo: "/reset-password" },
  });

  expect(requested.status()).toBe(200);

  const message = await waitForMessage(email, { subject: /reset/i });
  const followed = await anonymous.get(linkPath(message), { maxRedirects: 0 });
  const location = new URL(followed.headers().location ?? "", baseURL);

  expect(followed.status()).toBe(302);
  expect(location.pathname).toBe("/reset-password");

  const token = location.searchParams.get("token");

  expect(token).toBeTruthy();

  const reset = await anonymous.post("/api/auth/reset-password", {
    data: { token, newPassword: NEW_PASSWORD },
  });

  expect(reset.status()).toBe(200);
  expect((await signIn(anonymous, email, OLD_PASSWORD)).status()).toBe(401);
  expect((await signIn(await client(playwright, baseURL, ip), email, NEW_PASSWORD)).status()).toBe(200);

  // The session created at sign-up, before the reset, has ended.
  expect(await session(user)).toBeNull();

  const reused = await anonymous.post("/api/auth/reset-password", {
    data: { token, newPassword: "third-password-789" },
  });

  expect(reused.status()).toBe(400);
});

test("sign-up sends a verification link that marks the address as verified", async ({
  playwright,
  baseURL,
}) => {
  const email = uniqueAddress();
  const user = await client(playwright, baseURL, uniqueIp());

  await signUp(user, email);
  expect((await session(user))?.user.emailVerified).toBe(false);

  const message = await waitForMessage(email, { subject: /confirm/i });
  const followed = await user.get(linkPath(message), { maxRedirects: 0 });

  expect(followed.status()).toBe(302);
  expect((await session(user))?.user.emailVerified).toBe(true);
});

test("a reset request for an unknown address looks the same and sends nothing", async ({
  playwright,
  baseURL,
}) => {
  const known = uniqueAddress();
  const unknown = uniqueAddress();
  const anonymous = await client(playwright, baseURL, uniqueIp());

  await signUp(await client(playwright, baseURL, uniqueIp()), known);

  const forUnknown = await anonymous.post("/api/auth/request-password-reset", {
    data: { email: unknown, redirectTo: "/reset-password" },
  });
  const forKnown = await anonymous.post("/api/auth/request-password-reset", {
    data: { email: known, redirectTo: "/reset-password" },
  });

  expect(forUnknown.status()).toBe(forKnown.status());
  expect(await forUnknown.text()).toBe(await forKnown.text());

  // Once the known address has its message, the unknown one would have too.
  await waitForMessage(known, { subject: /reset/i });
  expect(await messagesTo(unknown)).toHaveLength(0);
});

test("a new verification link requires a session", async ({ playwright, baseURL }) => {
  const anonymous = await client(playwright, baseURL, uniqueIp());

  const response = await anonymous.post("/api/auth/send-verification-email", {
    data: { email: uniqueAddress() },
  });

  expect(response.status()).toBe(401);
});
