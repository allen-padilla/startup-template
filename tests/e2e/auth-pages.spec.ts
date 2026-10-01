// The authentication pages in a browser. See docs/specs/auth-pages.md.
import { randomUUID } from "node:crypto";

import type { Browser, Page } from "@playwright/test";

import { expect, test } from "./support/fixtures";
import { uniqueAddress, uniqueIp } from "./support/identity";
import { linkPath, messagesTo, waitForMessage } from "./support/mailpit";
import { observabilityReceived, sampledTrace } from "./support/observability";

const PASSWORD = "first-password-123";
const NEW_PASSWORD = "second-password-456";

const INVALID_CREDENTIALS = "Invalid email or password.";
const RESET_SENT = /If an account exists for that address, we've sent a link/;
const RESET_LINK_INVALID = "This reset link is invalid or has expired.";
const VERIFIED = "Your email address has been verified.";
const VERIFICATION_LINK_INVALID = "This verification link is invalid or has expired.";

/** The page's path and query. */
function location(page: Page) {
  const url = new URL(page.url());

  return `${url.pathname}${url.search}`;
}

async function signUp(page: Page, email: string) {
  await page.goto("/sign-up");
  await page.getByLabel("Name").fill("E2E User");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Create account" }).click();
  await page.waitForURL((url) => url.pathname === "/account");
}

/** Fills and submits the sign-in form on the current page. */
async function signIn(page: Page, email: string, password = PASSWORD) {
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
}

// Next.js adds its own route announcer with role="alert", so messages are
// looked up inside the page's main element.
const resendButton = (page: Page) =>
  page.getByRole("button", { name: "Resend verification email" });

test("Get Started opens the sign-up page", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("link", { name: "Get Started" }).click();

  await expect(page).toHaveURL(/\/sign-up$/);
});

test("sign-up lands on the account page with the address unverified", async ({ page }) => {
  const email = uniqueAddress();

  await signUp(page, email);

  await expect(page.getByText(email)).toBeVisible();
  await expect(page.getByText("Not verified")).toBeVisible();
  await expect(resendButton(page)).toBeVisible();
});

test("a verification link confirms the address in the same browser", async ({ page }) => {
  const email = uniqueAddress();

  await signUp(page, email);
  await page.goto(linkPath(await waitForMessage(email, { subject: /confirm/i })));

  expect(location(page)).toBe("/account?verified=1");
  await expect(page.getByText(VERIFIED)).toBeVisible();
  await expect(page.getByText("Verified", { exact: true })).toBeVisible();
  await expect(resendButton(page)).toHaveCount(0);
});

test("a verification link opened while signed out confirms the address after sign-in", async ({
  page,
  newVisitor,
}) => {
  const email = uniqueAddress();

  await signUp(page, email);

  const visitor = await newVisitor();

  await visitor.goto(linkPath(await waitForMessage(email, { subject: /confirm/i })));
  expect(location(visitor)).toBe(`/sign-in?redirect=${encodeURIComponent("/account?verified=1")}`);

  await signIn(visitor, email);
  await visitor.waitForURL((url) => url.pathname === "/account");

  expect(location(visitor)).toBe("/account?verified=1");
  await expect(visitor.getByText(VERIFIED)).toBeVisible();
});

test("resend sends a new verification link that verifies the address", async ({ page }) => {
  const email = uniqueAddress();

  await signUp(page, email);
  await waitForMessage(email, { subject: /confirm/i });
  await resendButton(page).click();

  await expect(page.getByText("Verification email sent. Check your inbox.")).toBeVisible();

  const newest = await waitForMessage(email, { subject: /confirm/i, count: 2 });

  await page.goto(linkPath(newest));
  await expect(page.getByText(VERIFIED)).toBeVisible();
});

test("an altered verification link shows the invalid-link message", async ({ page }) => {
  const email = uniqueAddress();

  await signUp(page, email);

  const link = new URL(linkPath(await waitForMessage(email, { subject: /confirm/i })), "http://x");
  const token = link.searchParams.get("token") ?? "";

  link.searchParams.set("token", `${token.slice(0, -2)}${token.endsWith("AA") ? "BB" : "AA"}`);
  await page.goto(`${link.pathname}${link.search}`);

  await expect(page.getByText(VERIFICATION_LINK_INVALID)).toBeVisible();
  await expect(page.getByText(VERIFIED)).toHaveCount(0);
  await expect(resendButton(page)).toBeVisible();
});

test("password reset through the pages sets a new password and ends other sessions", async ({
  page,
  newVisitor,
}) => {
  const email = uniqueAddress();

  await signUp(page, email);

  const visitor = await newVisitor();

  await visitor.goto("/forgot-password");
  await visitor.getByLabel("Email").fill(email);
  await visitor.getByRole("button", { name: "Send reset link" }).click();
  await expect(visitor.getByText(RESET_SENT)).toBeVisible();

  const resetLink = linkPath(await waitForMessage(email, { subject: /reset/i }));

  await visitor.goto(resetLink);
  await expect(visitor).toHaveURL(/\/reset-password$/);

  // Mismatched passwords are caught before anything is sent.
  const resets: string[] = [];

  visitor.on("request", (request) => {
    if (new URL(request.url()).pathname === "/api/auth/reset-password") resets.push(request.method());
  });
  await visitor.getByLabel("New password", { exact: true }).fill(NEW_PASSWORD);
  await visitor.getByLabel("Confirm new password").fill("a-different-password");
  await visitor.getByRole("button", { name: "Set new password" }).click();
  await expect(visitor.getByText("The passwords don't match.")).toBeVisible();
  expect(resets).toHaveLength(0);

  await visitor.getByLabel("New password", { exact: true }).fill(NEW_PASSWORD);
  await visitor.getByLabel("Confirm new password").fill(NEW_PASSWORD);
  await visitor.getByRole("button", { name: "Set new password" }).click();
  await visitor.waitForURL((url) => url.pathname === "/sign-in");

  expect(location(visitor)).toBe("/sign-in?password=changed");
  await expect(visitor.getByText("Your password has been changed.", { exact: false })).toBeVisible();

  await signIn(visitor, email, PASSWORD);
  await expect(visitor.getByText(INVALID_CREDENTIALS)).toBeVisible();

  await signIn(visitor, email, NEW_PASSWORD);
  await visitor.waitForURL((url) => url.pathname === "/account");

  // The session created at sign-up, before the reset, has ended.
  await page.goto("/account");
  await expect(page).toHaveURL(/\/sign-in\?/);

  // A used link no longer works.
  await visitor.goto(resetLink);
  await expect(visitor.getByText(RESET_LINK_INVALID)).toBeVisible();
  await expect(visitor.getByRole("link", { name: "Request a new link" })).toHaveAttribute(
    "href",
    "/forgot-password",
  );
});

test("forgot-password looks the same for an unknown address and sends nothing", async ({
  page,
  newVisitor,
}) => {
  const known = uniqueAddress();
  const unknown = uniqueAddress();

  await signUp(page, known);

  const visitor = await newVisitor();
  const messages: string[] = [];

  for (const email of [unknown, known]) {
    await visitor.goto("/forgot-password");
    await visitor.getByLabel("Email").fill(email);
    await visitor.getByRole("button", { name: "Send reset link" }).click();
    await expect(visitor.getByText(RESET_SENT)).toBeVisible();
    messages.push((await visitor.getByRole("main").getByRole("status").textContent()) ?? "");
  }

  expect(messages[0]).toBe(messages[1]);

  // Once the known address has its message, the unknown one would have too.
  await waitForMessage(known, { subject: /reset/i });
  expect(await messagesTo(unknown)).toHaveLength(0);
});

test("a signed-out visit to the account page returns there after sign-in", async ({ page }) => {
  const email = uniqueAddress();

  await signUp(page, email);
  await page.getByRole("button", { name: "Sign out" }).click();
  await page.waitForURL((url) => url.pathname === "/");

  await page.goto("/account");
  expect(location(page)).toBe("/sign-in?redirect=%2Faccount");

  await signIn(page, email);
  await page.waitForURL((url) => url.pathname === "/account");
  expect(location(page)).toBe("/account");
});

test("sign-in follows only safe redirect targets", async ({ page, newVisitor }) => {
  const email = uniqueAddress();

  await signUp(page, email);

  const targets: [string, string][] = [
    ["https://example.com", "/account"],
    ["//example.com", "/account"],
    ["/\\example.com", "/account"],
    ["%2F%2Fexample.com", "/account"],
    ["/account?x=1", "/account?x=1"],
  ];

  // Each sign-in uses its own visitor and client IP, so the per-client
  // sign-in limit is never reached.
  for (const [target, expected] of targets) {
    const visitor = await newVisitor();

    await visitor.goto(`/sign-in?redirect=${encodeURIComponent(target)}`);
    await signIn(visitor, email);
    await visitor.waitForURL((url) => url.pathname === "/account");

    expect(location(visitor), `redirect=${target}`).toBe(expected);
  }
});

test("signed-in visitors skip the sign-in and sign-up pages", async ({ page }) => {
  await signUp(page, uniqueAddress());

  for (const path of ["/sign-in", "/sign-up"]) {
    await page.goto(path);
    expect(location(page), path).toBe("/account");
  }
});

test("sign-up with an address that has an account says so", async ({ page, newVisitor }) => {
  const email = uniqueAddress();

  await signUp(page, email);

  const visitor = await newVisitor();

  await visitor.goto("/sign-up");
  await visitor.getByLabel("Name").fill("Someone Else");
  await visitor.getByLabel("Email").fill(email);
  await visitor.getByLabel("Password").fill("another-password-1");
  await visitor.getByRole("button", { name: "Create account" }).click();

  const alert = visitor.getByRole("main").getByRole("alert");

  await expect(alert).toContainText("An account with this email already exists.");
  await expect(alert.getByRole("link", { name: "Sign in" })).toHaveAttribute("href", "/sign-in");
  await expect(alert.getByRole("link", { name: "reset your password" })).toHaveAttribute(
    "href",
    "/forgot-password",
  );
});

test("a wrong password and an unknown address get the same message", async ({ page, newVisitor }) => {
  const email = uniqueAddress();

  await signUp(page, email);

  const visitor = await newVisitor();
  const messages: string[] = [];

  await visitor.goto("/sign-in");
  for (const [address, password] of [
    [email, "wrong-password-000"],
    [uniqueAddress(), PASSWORD],
  ] as const) {
    await signIn(visitor, address, password);
    await expect(visitor.getByRole("main").getByRole("alert")).toBeVisible();
    messages.push((await visitor.getByRole("main").getByRole("alert").textContent()) ?? "");
  }

  expect(messages).toEqual([INVALID_CREDENTIALS, INVALID_CREDENTIALS]);
});

test("sign-out returns to the landing page and ends the session", async ({ page }) => {
  await signUp(page, uniqueAddress());
  await page.getByRole("button", { name: "Sign out" }).click();
  await page.waitForURL((url) => url.pathname === "/");

  await page.goto("/account");
  await expect(page).toHaveURL(/\/sign-in\?/);
});

test("the reset page shows a message and sends nothing when email is unavailable or limited", async ({
  page,
}) => {
  await page.route("**/api/auth/request-password-reset", (route) =>
    route.fulfill({
      status: 503,
      json: { code: "EMAIL_NOT_AVAILABLE", message: "Email is not available." },
    }),
  );
  await page.goto("/forgot-password");
  await page.getByLabel("Email").fill(uniqueAddress());
  await page.getByRole("button", { name: "Send reset link" }).click();
  await expect(page.getByRole("main").getByRole("alert")).toHaveText("Email isn't available right now.");

  await page.unroute("**/api/auth/request-password-reset");
  await page.route("**/api/auth/request-password-reset", (route) =>
    route.fulfill({ status: 429, json: { message: "Too many requests. Please try again later." } }),
  );
  await page.getByRole("button", { name: "Send reset link" }).click();
  await expect(page.getByRole("main").getByRole("alert")).toHaveText("Too many requests. Please try again later.");
});

test("resend shows a message when email is unavailable", async ({ page }) => {
  await signUp(page, uniqueAddress());
  await page.route("**/api/auth/send-verification-email", (route) =>
    route.fulfill({
      status: 503,
      json: { code: "EMAIL_NOT_AVAILABLE", message: "Email is not available." },
    }),
  );
  await resendButton(page).click();

  await expect(page.getByRole("main").getByRole("alert")).toHaveText("Email isn't available right now.");
});

// PostHog drops events from browsers it considers bots, which includes every
// automated browser. This page presents as a regular one, so the test sees
// what PostHog would send.
async function regularBrowserPage(browser: Browser, baseURL: string | undefined) {
  const probe = await browser.newPage();
  const userAgent = (await probe.evaluate(() => navigator.userAgent)).replace("HeadlessChrome", "Chrome");

  await probe.close();

  const context = await browser.newContext({
    baseURL,
    userAgent,
    extraHTTPHeaders: { "x-forwarded-for": uniqueIp() },
  });

  await context.addInitScript(() => {
    Object.defineProperty(Navigator.prototype, "webdriver", { get: () => false });
    Object.defineProperty(Navigator.prototype, "userAgentData", { get: () => undefined });
  });

  return { context, page: await context.newPage() };
}

test("the reset page's token never reaches PostHog or Sentry, and the page sends no referrer", async ({
  browser,
  baseURL,
}) => {
  const { context, page } = await regularBrowserPage(browser, baseURL);
  const token = `t${randomUUID().replaceAll("-", "")}`;
  // Not a token, so it stays visible in what PostHog and Sentry receive and
  // identifies this page's events.
  const marker = `m${randomUUID().replaceAll("-", "")}`;
  const trace = sampledTrace();

  // A sampled trace on the page request makes the browser's Sentry pageload
  // sampled too, whatever the sample rate.
  await page.route(/\/reset-password\?/, (route) =>
    route.continue({ headers: { ...route.request().headers(), ...trace.headers } }),
  );

  const response = await page.goto(`/reset-password?token=${token}&e2e=${marker}`);

  expect(response?.headers()["referrer-policy"]).toBe("no-referrer");
  await expect(page).toHaveURL(/\/reset-password$/);

  await expect
    .poll(
      async () => {
        const received = await observabilityReceived();

        return {
          posthog: received.some((body) => body.includes('"$pageview"') && body.includes(marker)),
          sentry: received.some((body) => body.includes(trace.traceId) && body.includes(marker)),
        };
      },
      { message: "PostHog and Sentry receive this page's events", timeout: 30_000 },
    )
    .toEqual({ posthog: true, sentry: true });

  // A boolean, so a failure does not print the token or the payload.
  expect((await observabilityReceived()).join("\n").includes(token), "the token is redacted").toBe(
    false,
  );

  await context.close();
});
