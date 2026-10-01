import { afterEach, describe, expect, it } from "vitest";

import { schema } from "@startup/db";

import { withMinimumDuration } from "./minimum-duration";
import { createTestAuth, SECRET } from "./testing/auth";

type TestAuth = Awaited<ReturnType<typeof createTestAuth>>;

let t: TestAuth;
let open: TestAuth | undefined;

afterEach(async () => {
  await open?.close();
  open = undefined;
});

function requestReset(email: string, ip: string) {
  return t.request("/request-password-reset", { body: { email }, ip });
}

describe("rate limits", () => {
  it("limits reset requests per address, for known and unknown addresses alike", async () => {
    open = t = await createTestAuth({ rateLimitEnabled: true });
    await t.signUp("ada@example.com");

    for (const email of ["ada@example.com", "nobody@example.com"]) {
      // A different client each time, so only the per-address limit applies.
      const statuses = [];

      for (let attempt = 1; attempt <= 4; attempt += 1) {
        statuses.push((await requestReset(email, `198.51.100.${attempt}`)).status);
      }

      expect(statuses, email).toEqual([200, 200, 200, 429]);
    }
  });

  it("counts addresses case-insensitively and stores no address", async () => {
    open = t = await createTestAuth({ rateLimitEnabled: true });

    await requestReset("Ada@Example.com", "198.51.100.1");
    await requestReset("ada@example.com", "198.51.100.2");
    await requestReset("ADA@EXAMPLE.COM", "198.51.100.3");

    expect((await requestReset("ada@example.com", "198.51.100.4")).status).toBe(429);

    const rows = await t.db.select().from(schema.emailRateLimit);

    expect(rows).toHaveLength(1);
    expect(JSON.stringify(rows)).not.toContain("example.com");
    expect(JSON.stringify(rows)).not.toContain(SECRET);
  });

  it("limits reset requests per client", async () => {
    open = t = await createTestAuth({ rateLimitEnabled: true });

    const statuses = [];

    for (let attempt = 1; attempt <= 4; attempt += 1) {
      statuses.push((await requestReset(`user${attempt}@example.com`, "203.0.113.7")).status);
    }

    expect(statuses).toEqual([200, 200, 200, 429]);
  });

  it("starts a new window once the old one has passed", async () => {
    open = t = await createTestAuth({ rateLimitEnabled: true });

    for (let attempt = 1; attempt <= 3; attempt += 1) {
      await requestReset("ada@example.com", `198.51.100.${attempt}`);
    }

    await t.db
      .update(schema.emailRateLimit)
      .set({ windowStart: new Date("2000-01-01T00:00:00Z") });

    expect((await requestReset("ada@example.com", "198.51.100.9")).status).toBe(200);
  });
});

describe("minimum response time", () => {
  it("waits until the minimum has passed, even when the task fails", async () => {
    const started = performance.now();

    expect(await withMinimumDuration(60, async () => "done")).toBe("done");
    expect(performance.now() - started).toBeGreaterThanOrEqual(55);

    const failed = performance.now();

    await expect(
      withMinimumDuration(60, async () => {
        throw new Error("failed");
      }),
    ).rejects.toThrow("failed");
    expect(performance.now() - failed).toBeGreaterThanOrEqual(55);
  });
});
