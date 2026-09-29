import { existsSync } from "node:fs";
import { resolve } from "node:path";
import type { NextConfig } from "next";

const localEnvFile = resolve(process.cwd(), "../../.env.local");

if (existsSync(localEnvFile)) {
  process.loadEnvFile(localEnvFile);
}

const nextConfig: NextConfig = {
  /* config options here */
  reactCompiler: true,
};

export default nextConfig;
