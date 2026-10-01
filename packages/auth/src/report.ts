import type { EmailError } from "@startup/email";

export type EmailFailureReporter = (error: EmailError) => void;

// Next.js bundles instrumentation separately from route handlers, so module
// state is not shared between them. The reporter lives on globalThis instead.
const REPORTER = Symbol.for("@startup/auth/email-failure-reporter");

type ReporterRegistry = typeof globalThis & {
  [REPORTER]?: EmailFailureReporter;
};

/**
 * Sets where failed authentication emails are reported, such as Sentry.
 * Reports carry only the `EmailError`: never the link, token, recipient, or
 * message body. Without a reporter, failures are logged.
 */
export function setEmailFailureReporter(reporter: EmailFailureReporter) {
  (globalThis as ReporterRegistry)[REPORTER] = reporter;
}

export function reportEmailFailure(error: EmailError) {
  const reporter = (globalThis as ReporterRegistry)[REPORTER];

  try {
    if (reporter) reporter(error);
    else console.error(`[auth] ${error.name}: ${error.message}`);
  } catch {
    // Reporting must never turn a background failure into a request failure.
  }
}
