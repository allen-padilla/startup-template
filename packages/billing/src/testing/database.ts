import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";

import { schema, type Database } from "@startup/db";
import { migrationsFolder } from "@startup/db/migrations";

/**
 * In-memory Postgres with the repository migrations applied. Billing code only
 * uses the shared Drizzle Postgres API, so the PGlite driver stands in for the
 * node-postgres `Database`.
 */
export async function createTestDatabase() {
  const client = new PGlite();
  const db = drizzle({ client, schema });

  await migrate(db, { migrationsFolder });

  return {
    db: db as unknown as Database,
    close: () => client.close(),
  };
}

export async function insertTestUser(db: Database, id = "user_1") {
  await db.insert(schema.user).values({
    id,
    name: "Test User",
    email: `${id}@example.com`,
  });

  return { id, email: `${id}@example.com`, name: "Test User" };
}

export async function insertTestSubscription(
  db: Database,
  userId: string,
  { id = "sub_test_1", status = "active" }: { id?: string; status?: string } = {},
) {
  await db.insert(schema.subscriptions).values({
    userId,
    stripeSubscriptionId: id,
    stripePriceId: "price_test_pro_monthly",
    status,
    currentPeriodEnd: new Date("2027-01-01T00:00:00Z"),
  });
}
