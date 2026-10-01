import { randomInt, randomUUID } from "node:crypto";

// Each test gets its own address and client IP, so tests never share a
// mailbox or a rate-limit bucket. The production server enforces the limits.

export function uniqueAddress() {
  return `e2e-${randomUUID()}@example.test`;
}

export function uniqueIp() {
  return `10.${randomInt(256)}.${randomInt(256)}.${randomInt(1, 255)}`;
}
