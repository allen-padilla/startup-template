// Per-client limits that the production E2E server enforces. See
// docs/architecture/authentication.md.
import { expect, test } from "@playwright/test";

import { uniqueAddress, uniqueIp } from "./support/identity";

const SIGN_UPS_PER_HOUR = 10;

test("sign-up allows 10 requests per hour per client", async ({ playwright, baseURL }) => {
  const ip = uniqueIp();

  async function signUp(clientIp: string) {
    // A new context each time, so no session cookie from the previous
    // sign-up is sent along.
    const request = await playwright.request.newContext({
      baseURL,
      extraHTTPHeaders: { "x-forwarded-for": clientIp },
    });
    const response = await request.post("/api/auth/sign-up/email", {
      data: { name: "E2E User", email: uniqueAddress(), password: "first-password-123" },
    });
    const status = response.status();

    await request.dispose();
    return status;
  }

  const statuses = [];

  for (let attempt = 1; attempt <= SIGN_UPS_PER_HOUR + 1; attempt += 1) {
    statuses.push(await signUp(ip));
  }

  expect(statuses).toEqual([...Array(SIGN_UPS_PER_HOUR).fill(200), 429]);

  // Another client still gets through.
  expect(await signUp(uniqueIp())).toBe(200);
});
