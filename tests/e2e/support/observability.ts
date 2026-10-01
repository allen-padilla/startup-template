// Reads what the application sent to Sentry and PostHog, through the
// observability stub (`observability-stub.ts`). See docs/architecture/testing.md.
import { randomBytes } from "node:crypto";

import { expect } from "@playwright/test";

const STUB_URL = "http://127.0.0.1:9999";

/** Every request the application has sent to Sentry or PostHog during this run. */
export async function observabilityReceived(): Promise<string[]> {
  const response = await fetch(`${STUB_URL}/received`);

  expect(response.ok, "the observability stub is reachable").toBe(true);

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
