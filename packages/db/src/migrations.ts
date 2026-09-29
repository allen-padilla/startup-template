import { fileURLToPath } from "node:url";

// Absolute path to the generated Drizzle migrations, for tooling and tests that
// need to build a database from the same migrations applied in production.
export const migrationsFolder = fileURLToPath(
  new URL("../drizzle", import.meta.url),
);
