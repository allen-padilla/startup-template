import { withSentryConfig } from "@sentry/nextjs/config";
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

export default withSentryConfig(nextConfig, {
  // For all available options, see:
  // https://www.npmjs.com/package/@sentry/webpack-plugin#options

  // Source-map upload is build/CI-only. It is skipped unless SENTRY_AUTH_TOKEN
  // (a secret, never NEXT_PUBLIC_) is provided by the build environment.
  org: process.env.SENTRY_ORG,

  project: process.env.SENTRY_PROJECT,

  // Only print logs for uploading source maps in CI
  silent: !process.env.CI,

  // For all available options, see:
  // https://docs.sentry.io/platforms/javascript/guides/nextjs/manual-setup/

  // Upload a larger set of source maps for prettier stack traces (increases build time)
  widenClientFileUpload: true,

  webpack: {
    // Vercel Cron Monitor instrumentation is disabled for now.
    // https://docs.sentry.io/product/crons/
    automaticVercelMonitors: false,

    // Tree-shaking options for reducing bundle size
    treeshake: {
      // Automatically tree-shake Sentry logger statements to reduce bundle size
      removeDebugLogging: true,
    },
  },
});

