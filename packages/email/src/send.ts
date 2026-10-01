import { createTransport, type SendMailOptions } from "nodemailer";
import { z } from "zod";

import { serverEnv } from "@startup/env";

import {
  EmailConfigurationError,
  EmailDeliveryError,
  type EmailDeliveryFailure,
  EmailValidationError,
  type EmailVariable,
} from "./errors";

const DEFAULT_TIMEOUT_MS = 10_000;

// Line breaks and other control characters would let a value inject headers.
const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f]/;

const address = z.email();

/** One message to one recipient. Both bodies are required. */
export interface EmailMessage {
  to: string;
  subject: string;
  html: string;
  text: string;
}

/**
 * The part of a nodemailer transport the sender uses. Tests inject fakes or
 * nodemailer's network-free `streamTransport`.
 */
export interface EmailTransport {
  sendMail(mail: SendMailOptions): Promise<unknown>;
  close?(): void;
}

export interface EmailSenderOptions {
  /** SMTP connection string. Defaults to `SMTP_URL`. */
  smtpUrl?: string;
  /** Sender address. Defaults to `EMAIL_FROM`. */
  from?: string;
  /** Time limit for one send, including connecting. Default 10 seconds. */
  timeoutMs?: number;
  /** Transport to use instead of SMTP. When set, `smtpUrl` is not needed. */
  transport?: EmailTransport;
}

export interface EmailSender {
  /**
   * Sends one message. Resolves once the SMTP server accepts it. Failures are
   * not retried.
   */
  send(message: EmailMessage): Promise<void>;
}

/**
 * Creates a server-only email sender. Creating one never requires
 * configuration; sending does.
 */
export function createEmailSender(
  options: EmailSenderOptions = {},
): EmailSender {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  if (!Number.isInteger(timeoutMs) || timeoutMs <= 0) {
    throw new RangeError("timeoutMs must be a positive integer.");
  }

  return {
    async send(message) {
      const from = options.from ?? serverEnv.EMAIL_FROM;
      const smtpUrl = options.smtpUrl ?? serverEnv.SMTP_URL;
      const missing: EmailVariable[] = [];

      if (!options.transport && !smtpUrl) missing.push("SMTP_URL");
      if (!from) missing.push("EMAIL_FROM");
      if (missing.length > 0 || !from) {
        throw new EmailConfigurationError(missing);
      }

      validateMessage(message);

      const transport =
        options.transport ??
        createTransport({
          url: smtpUrl,
          connectionTimeout: timeoutMs,
          greetingTimeout: timeoutMs,
          socketTimeout: timeoutMs,
          dnsTimeout: timeoutMs,
          // Messages never reference files or URLs to embed.
          disableFileAccess: true,
          disableUrlAccess: true,
        });

      await deliver(transport, timeoutMs, {
        from,
        to: message.to,
        subject: message.subject,
        html: message.html,
        text: message.text,
        disableFileAccess: true,
        disableUrlAccess: true,
      });
    },
  };
}

let defaultSender: EmailSender | undefined;

/**
 * Sends one message with the configured `SMTP_URL` and `EMAIL_FROM`.
 * Raises `EmailConfigurationError` when email is not configured.
 */
export function sendEmail(message: EmailMessage): Promise<void> {
  defaultSender ??= createEmailSender();

  return defaultSender.send(message);
}

/** Whether `SMTP_URL` and `EMAIL_FROM` are both set. */
export function isEmailConfigured(): boolean {
  return Boolean(serverEnv.SMTP_URL && serverEnv.EMAIL_FROM);
}

function validateMessage(message: EmailMessage) {
  if (CONTROL_CHARACTERS.test(message.to) || !address.safeParse(message.to).success) {
    throw new EmailValidationError("to", "must be a single email address");
  }

  if (CONTROL_CHARACTERS.test(message.subject)) {
    throw new EmailValidationError("subject", "must not contain line breaks");
  }

  for (const field of ["subject", "html", "text"] as const) {
    if (message[field].trim() === "") {
      throw new EmailValidationError(field, "must not be empty");
    }
  }
}

async function deliver(
  transport: EmailTransport,
  timeoutMs: number,
  mail: SendMailOptions,
) {
  let timer: NodeJS.Timeout | undefined;

  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new EmailDeliveryError("timeout")),
      timeoutMs,
    );
  });

  try {
    await Promise.race([transport.sendMail(mail), timeout]);
  } catch (error) {
    if (error instanceof EmailDeliveryError) {
      transport.close?.();
      throw error;
    }

    throw toDeliveryError(error);
  } finally {
    clearTimeout(timer);
  }
}

// Keeps only the nodemailer error code and SMTP reply code. The original
// message can contain server responses, addresses, or connection details.
function toDeliveryError(error: unknown) {
  const { code, responseCode } = (error ?? {}) as {
    code?: unknown;
    responseCode?: unknown;
  };
  const smtpCode =
    typeof responseCode === "number" && Number.isInteger(responseCode)
      ? responseCode
      : undefined;

  return new EmailDeliveryError(classify(code, smtpCode), smtpCode);
}

function classify(code: unknown, smtpCode: number | undefined): EmailDeliveryFailure {
  switch (code) {
    case "ETIMEDOUT":
      return "timeout";
    case "EAUTH":
    case "ENOAUTH":
      return "authentication";
    case "EENVELOPE":
    case "EMESSAGE":
      return "rejected";
    case "ECONNECTION":
    case "ESOCKET":
    case "EDNS":
    case "ETLS":
    case "EPROXY":
    case "ECONNREFUSED":
      return "connection";
  }

  return smtpCode && smtpCode >= 500 ? "rejected" : "unknown";
}
