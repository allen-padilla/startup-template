// Errors never include the connection string, credentials, the recipient, the
// subject, message bodies, or the underlying transport error, so they are safe
// to log and report. They deliberately have no `cause`.

/** Base class for every error raised by `@startup/email`. */
export class EmailError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EmailError";
  }
}

export type EmailVariable = "SMTP_URL" | "EMAIL_FROM";

/**
 * Thrown when sending without the configuration email needs. Email is optional
 * until used, so this is raised when sending instead of at startup.
 */
export class EmailConfigurationError extends EmailError {
  readonly variables: readonly EmailVariable[];

  constructor(variables: readonly EmailVariable[]) {
    super(`Email is not configured: ${variables.join(" and ")} not set.`);
    this.name = "EmailConfigurationError";
    this.variables = variables;
  }
}

export type EmailMessageField = "to" | "subject" | "html" | "text";

/** The message was rejected before anything was sent. */
export class EmailValidationError extends EmailError {
  readonly field: EmailMessageField;

  constructor(field: EmailMessageField, problem: string) {
    super(`Invalid email message: ${field} ${problem}.`);
    this.name = "EmailValidationError";
    this.field = field;
  }
}

/**
 * - `timeout`: no result within the sender's time limit
 * - `connection`: the server could not be reached, or the connection failed
 * - `authentication`: the server rejected the credentials
 * - `rejected`: the server refused the sender, the recipient, or the message
 * - `unknown`: any other failure
 */
export type EmailDeliveryFailure =
  | "timeout"
  | "connection"
  | "authentication"
  | "rejected"
  | "unknown";

/** Delivery failed. The message was not retried. */
export class EmailDeliveryError extends EmailError {
  readonly reason: EmailDeliveryFailure;
  /** The SMTP reply code, when the server sent one. */
  readonly smtpCode: number | undefined;

  constructor(reason: EmailDeliveryFailure, smtpCode?: number) {
    super(
      `Email delivery failed: ${reason}${smtpCode ? ` (SMTP ${smtpCode})` : ""}.`,
    );
    this.name = "EmailDeliveryError";
    this.reason = reason;
    this.smtpCode = smtpCode;
  }
}
