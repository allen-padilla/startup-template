import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import { serverEnv } from "@startup/env";

import * as schema from "./schema";

const pool = new Pool({
  connectionString: serverEnv.DATABASE_URL,
});

// An idle connection that drops, such as on a database restart, emits `error`
// on the pool. The pool discards it and connects again on the next query, so
// log it instead of letting it surface as an uncaught exception.
pool.on("error", (error) => {
  console.error("An idle database connection failed:", error.message);
});

export const db = drizzle({
  client: pool,
  schema,
});

export type Database = typeof db;

export { schema };

// Raw SQL for statements the query builder cannot express, such as atomic
// conditional upserts. Re-exported so callers share this package's drizzle-orm.
export { sql } from "drizzle-orm";
