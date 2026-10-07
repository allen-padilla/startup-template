import { withSentryConfig } from "@sentry/nextjs/config";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import type { NextConfig } from "next";

const localEnvFile = resolve(process.cwd(), "../../.env.local");

if (existsSync(localEnvFile)) {
  process.loadEnvFile(localEnvFile);
}

// Sent on every route. There is deliberately no script-src policy yet. See
// docs/architecture/deployment.md.
const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Strict-Transport-Security", value: "max-age=63072000" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
];

const nextConfig: NextConfig = {
  reactCompiler: true,

  // The Dockerfile copies .next/standalone, which must include the workspace
  // packages, so tracing starts at the repository root.
  output: "standalone",
  outputFileTracingRoot: resolve(process.cwd(), "../.."),

  // When two rules set the same header, the later one wins.
  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders },
      // The reset page receives a token in its URL. Never send that URL to
      // other sites as a referrer. See docs/architecture/observability.md.
      {
        source: "/reset-password",
        headers: [{ key: "Referrer-Policy", value: "no-referrer" }],
      },
    ];
  },
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

