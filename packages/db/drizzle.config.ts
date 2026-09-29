import * as path from "node:path";

import { config } from "dotenv";
import { defineConfig } from "drizzle-kit";

config({
  path: path.resolve(process.cwd(), "../../.env.local"),
});

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is required");
}

export default defineConfig({
  schema: "./src/schema/index.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL,
  },
});