// Errors never include the API key, request headers, the request state, or
// provider response bodies, so they are safe to log and report.

/** Base class for every error raised by `@startup/decision`. */
export class DecisionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DecisionError";
  }
}

/**
 * Thrown when a decision is requested without the configuration it needs.
 * Decision models are optional until used, so this is raised lazily instead of
 * failing environment validation at startup.
 */
export class DecisionConfigurationError extends DecisionError {
  readonly variable: string;

  constructor(variable: string) {
    super(`Decision model is not configured: ${variable} is not set.`);
    this.name = "DecisionConfigurationError";
    this.variable = variable;
  }
}

export interface DecisionIssue {
  /** Location of the invalid value, for example `["questions", "tone"]`. */
  readonly path: readonly (string | number)[];
  readonly message: string;
}

/**
 * The request is invalid. `status` is `422` when TypeSafe rejected it and
 * `undefined` when it was rejected locally before sending.
 */
export class DecisionValidationError extends DecisionError {
  readonly status: 422 | undefined;
  readonly issues: readonly DecisionIssue[];

  constructor(status: 422 | undefined, issues: readonly DecisionIssue[]) {
    const [first] = issues;
    const summary = first
      ? `: ${first.path.join(".") || "request"}: ${first.message}`
      : ".";
    const source = status ? "TypeSafe rejected the request" : "Invalid request";
    super(`${source}${summary}`);
    this.name = "DecisionValidationError";
    this.status = status;
    this.issues = issues;
  }
}

/** TypeSafe rejected the API key (`401`) or its permissions (`403`). */
export class DecisionAuthenticationError extends DecisionError {
  readonly status: 401 | 403;

  constructor(status: 401 | 403) {
    super(`TypeSafe rejected the request credentials (HTTP ${status}).`);
    this.name = "DecisionAuthenticationError";
    this.status = status;
  }
}

/** TypeSafe rate-limited the request (`429`). */
export class DecisionRateLimitError extends DecisionError {
  readonly status = 429;
  /** From the `Retry-After` header, when TypeSafe sends one. */
  readonly retryAfterSeconds: number | undefined;

  constructor(retryAfterSeconds: number | undefined) {
    super("TypeSafe rate-limited the request (HTTP 429).");
    this.name = "DecisionRateLimitError";
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

/** No response arrived within the client's timeout. */
export class DecisionTimeoutError extends DecisionError {
  readonly timeoutMs: number;

  constructor(timeoutMs: number) {
    super(`TypeSafe did not respond within ${timeoutMs} ms.`);
    this.name = "DecisionTimeoutError";
    this.timeoutMs = timeoutMs;
  }
}

/**
 * TypeSafe could not be reached (`network`), returned an unexpected status
 * such as a `5xx` (`status`), or returned a response that failed validation
 * (`invalid_response`).
 */
export class DecisionProviderError extends DecisionError {
  readonly reason: "network" | "status" | "invalid_response";
  readonly status: number | undefined;

  constructor(
    reason: DecisionProviderError["reason"],
    message: string,
    status?: number,
  ) {
    super(message);
    this.name = "DecisionProviderError";
    this.reason = reason;
    this.status = status;
  }
}
