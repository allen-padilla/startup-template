// Security headers from apps/web/next.config.ts. See
// docs/architecture/deployment.md.
import { expect, test } from "./support/fixtures";
import { uniqueAddress } from "./support/identity";

const SECURITY_HEADERS = {
  "x-content-type-options": "nosniff",
  "x-frame-options": "DENY",
  "content-security-policy": "frame-ancestors 'none'",
  "strict-transport-security": "max-age=63072000",
  "permissions-policy": "camera=(), microphone=(), geolocation=()",
};

function expectSecurityHeaders(headers: Record<string, string>, referrerPolicy: string) {
  expect(headers).toMatchObject({ ...SECURITY_HEADERS, "referrer-policy": referrerPolicy });
  // frame-ancestors only: a script-src policy is a separate decision.
  expect(headers["content-security-policy"]).not.toContain("script-src");
}

test("the homepage sends the security headers", async ({ page }) => {
  const response = await page.goto("/");

  expect(response?.status()).toBe(200);
  expectSecurityHeaders(response!.headers(), "strict-origin-when-cross-origin");
});

test("/account sends the security headers, signed out and signed in", async ({ page }) => {
  // Signed out, /account redirects to sign-in. The redirect has them too.
  const redirect = await page.request.get("/account", { maxRedirects: 0 });

  expect(redirect.status()).toBe(307);
  expectSecurityHeaders(redirect.headers(), "strict-origin-when-cross-origin");

  // page.request shares the page's cookies, so this signs the page in.
  const signUp = await page.request.post("/api/auth/sign-up/email", {
    data: { name: "E2E User", email: uniqueAddress(), password: "first-password-123" },
  });

  expect(signUp.status()).toBe(200);

  const response = await page.goto("/account");

  expect(response?.status()).toBe(200);
  await expect(page.getByRole("heading", { name: "Account" })).toBeVisible();
  expectSecurityHeaders(response!.headers(), "strict-origin-when-cross-origin");
});

test("/reset-password keeps Referrer-Policy: no-referrer", async ({ page }) => {
  for (const path of ["/reset-password", "/reset-password?token=not-a-real-token"]) {
    const response = await page.request.get(path);

    expect(response.status(), path).toBe(200);
    expectSecurityHeaders(response.headers(), "no-referrer");
  }
});
