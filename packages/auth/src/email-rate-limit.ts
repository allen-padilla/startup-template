import { createHmac } from "node:crypto";

import { schema, sql, type Database } from "@startup/db";

export interface EmailRateLimitRule {
  /** Requests allowed per address in one window. */
  max: number;
  /** Window length in seconds. */
  window: number;
}

const { emailRateLimit } = schema;

/**
 * Counts one request for `address` at `endpoint` and reports whether it is
 * within the limit. Unknown addresses are counted the same way as known ones,
 * so the result reveals nothing about accounts. The stored key is an HMAC,
 * never the address.
 */
export async function consumeEmailRateLimit(
  db: Database,
  secret: string,
  endpoint: string,
  address: string,
  rule: EmailRateLimitRule,
): Promise<{ allowed: boolean }> {
  const key = createHmac("sha256", secret)
    .update(`${endpoint}:${address.trim().toLowerCase()}`)
    .digest("base64url");
  const expired = sql`${emailRateLimit.windowStart} <= now() - make_interval(secs => ${rule.window})`;

  // One statement, so concurrent requests cannot both read a stale count.
  const [row] = await db
    .insert(emailRateLimit)
    .values({ key, count: 1, windowStart: sql`now()` })
    .onConflictDoUpdate({
      target: emailRateLimit.key,
      set: {
        count: sql`case when ${expired} then 1 else ${emailRateLimit.count} + 1 end`,
        windowStart: sql`case when ${expired} then now() else ${emailRateLimit.windowStart} end`,
      },
    })
    .returning({ count: emailRateLimit.count });

  return { allowed: (row?.count ?? 1) <= rule.max };
}

/** Deletes counters whose window has ended. */
export async function pruneEmailRateLimit(db: Database, window: number) {
  await db
    .delete(emailRateLimit)
    .where(
      sql`${emailRateLimit.windowStart} <= now() - make_interval(secs => ${window})`,
    );
}
