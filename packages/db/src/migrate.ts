import path from "node:path";

import { migrate } from "drizzle-orm/node-postgres/migrator";

import { db } from "./index";

/**
 * Applies the committed migrations in `packages/db/drizzle/` to the configured
 * database, recording them in the same table as `pnpm db:migrate`. The server
 * calls it at start when `RUN_MIGRATIONS` is `true`.
 *
 * The folder is located from the working directory, which Next.js sets to
 * `apps/web` in development and in the standalone server alike, because
 * bundling rewrites `import.meta.url`. See docs/architecture/deployment.md.
 */
export async function migrateDatabase() {
  await migrate(db, {
    migrationsFolder: path.resolve(process.cwd(), "../../packages/db/drizzle"),
  });
}
