import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import { serverEnv } from "@startup/env";

import * as schema from "./schema";

const pool = new Pool({
  connectionString: serverEnv.DATABASE_URL,
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
