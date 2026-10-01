import { integer, pgTable, text, timestamp } from "drizzle-orm/pg-core";

// Per-address limits for requests that send email. `key` is an HMAC of the
// endpoint and the address, so the table never stores an address.
export const emailRateLimit = pgTable("email_rate_limit", {
  key: text("key").primaryKey(),
  count: integer("count").notNull(),
  windowStart: timestamp("window_start").notNull(),
});
