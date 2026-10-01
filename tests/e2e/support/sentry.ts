// Reads what the application sent to the Sentry stub (`sentry-stub.ts`).
// See docs/architecture/testing.md.
import { randomBytes } from "node:crypto";

import { expect } from "@playwright/test";

const SENTRY_STUB_URL = "http://127.0.0.1:9999";

/** Every request body the application has sent to Sentry during this run. */
export async function sentryReceived(): Promise<string[]> {
  const response = await fetch(`${SENTRY_STUB_URL}/received`);

  expect(response.ok, "the Sentry stub is reachable").toBe(true);

  return (await response.json()) as string[];
}

/**
 * Headers that continue a sampled trace, so the server records the request's
 * spans whatever its sample rate. `traceId` identifies them in what Sentry
 * receives.
 */
export function sampledTrace() {
  const traceId = randomBytes(16).toString("hex");
  const spanId = randomBytes(8).toString("hex");

  return { traceId, headers: { "sentry-trace": `${traceId}-${spanId}-1` } };
}
