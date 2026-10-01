import net from "node:net";

import { createTransport, type SendMailOptions } from "nodemailer";
import { describe, expect, it } from "vitest";

import {
  EmailConfigurationError,
  EmailDeliveryError,
  EmailValidationError,
} from "./errors";
import {
  createEmailSender,
  isEmailConfigured,
  sendEmail,
  type EmailMessage,
  type EmailTransport,
} from "./send";

const SMTP_URL = "smtps://mailer:sup3r-s3cret%40pw@smtp.example.com:465";
const FROM = "Startup Template <no-reply@example.com>";

const message: EmailMessage = {
  to: "ada@example.com",
  subject: "Hello",
  html: "<p>Private body</p>",
  text: "Private body",
};

function recordingTransport() {
  const sent: SendMailOptions[] = [];
  const transport: EmailTransport = {
    async sendMail(mail) {
      sent.push(mail);
    },
  };

  return { sent, transport };
}

function failingTransport(error: unknown): EmailTransport {
  return {
    sendMail: () => Promise.reject(error),
  };
}

// Everything an error could expose to a log or to Sentry.
function exposed(error: unknown) {
  const value = error as Error;

  return [
    value.message,
    String(value),
    value.stack ?? "",
    JSON.stringify(value),
    JSON.stringify(Object.getOwnPropertyNames(value).map((key) => [key, String(Reflect.get(value, key))])),
  ].join("\n");
}

async function caught(promise: Promise<unknown>) {
  try {
    await promise;
  } catch (error) {
    return error;
  }

  throw new Error("Expected the promise to reject.");
}

describe("configuration", () => {
  it("is disabled in tests", () => {
    expect(isEmailConfigured()).toBe(false);
  });

  it("raises a configuration error naming both missing variables", async () => {
    const error = await caught(sendEmail(message));

    expect(error).toBeInstanceOf(EmailConfigurationError);
    expect((error as EmailConfigurationError).variables).toEqual([
      "SMTP_URL",
      "EMAIL_FROM",
    ]);
    expect((error as Error).message).toBe(
      "Email is not configured: SMTP_URL and EMAIL_FROM not set.",
    );
  });

  it("names only the missing variable and never a value", async () => {
    const error = await caught(
      createEmailSender({ smtpUrl: SMTP_URL }).send(message),
    );

    expect(error).toBeInstanceOf(EmailConfigurationError);
    expect((error as EmailConfigurationError).variables).toEqual(["EMAIL_FROM"]);
    expect(exposed(error)).not.toContain("sup3r");
    expect(exposed(error)).not.toContain("smtp.example.com");
  });
});

describe("sending", () => {
  it("sends one message with both bodies from the configured sender", async () => {
    const { sent, transport } = recordingTransport();

    await createEmailSender({ from: FROM, transport }).send(message);

    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({
      from: FROM,
      to: "ada@example.com",
      subject: "Hello",
      html: "<p>Private body</p>",
      text: "Private body",
    });
  });

  it("builds a MIME message with plain-text and HTML parts", async () => {
    const transport = createTransport({ streamTransport: true, buffer: true });
    let raw = "";

    await createEmailSender({
      from: FROM,
      transport: {
        async sendMail(mail) {
          const info = await transport.sendMail(mail);
          raw = info.message.toString();
        },
      },
    }).send(message);

    expect(raw).toContain("From: Startup Template <no-reply@example.com>");
    expect(raw).toContain("To: ada@example.com");
    expect(raw).toContain("Content-Type: text/plain");
    expect(raw).toContain("Content-Type: text/html");
  });

  it.each([
    ["to", { to: "ada@example.com\r\nBcc: eve@example.com" }],
    ["to", { to: "ada@example.com, eve@example.com" }],
    ["to", { to: "not an address" }],
    ["subject", { subject: "Hello\r\nBcc: eve@example.com" }],
    ["subject", { subject: "Hello\nthere" }],
    ["html", { html: " " }],
    ["text", { text: "" }],
  ] as const)("rejects an invalid %s before sending", async (field, change) => {
    const { sent, transport } = recordingTransport();

    const error = await caught(
      createEmailSender({ from: FROM, transport }).send({
        ...message,
        ...change,
      }),
    );

    expect(error).toBeInstanceOf(EmailValidationError);
    expect((error as EmailValidationError).field).toBe(field);
    expect(exposed(error)).not.toContain("eve@example.com");
    expect(sent).toHaveLength(0);
  });
});

describe("delivery failures", () => {
  it.each([
    [{ code: "EAUTH", responseCode: 535 }, "authentication", 535],
    [{ code: "ECONNECTION" }, "connection", undefined],
    [{ code: "ETIMEDOUT" }, "timeout", undefined],
    [{ code: "EENVELOPE", responseCode: 550 }, "rejected", 550],
    [{ responseCode: 554 }, "rejected", 554],
    [{}, "unknown", undefined],
  ])("maps %o to %s", async (details, reason, smtpCode) => {
    const error = await caught(
      createEmailSender({
        from: FROM,
        transport: failingTransport(Object.assign(new Error("failed"), details)),
      }).send(message),
    );

    expect(error).toBeInstanceOf(EmailDeliveryError);
    expect((error as EmailDeliveryError).reason).toBe(reason);
    expect((error as EmailDeliveryError).smtpCode).toBe(smtpCode);
  });

  it("never exposes the connection string, recipient, or bodies", async () => {
    const transportError = Object.assign(
      new Error(
        `Invalid login for ${SMTP_URL}: 535 rejected ada@example.com <p>Private body</p>`,
      ),
      { code: "EAUTH", responseCode: 535, response: `535 ${SMTP_URL}` },
    );

    const error = await caught(
      createEmailSender({
        smtpUrl: SMTP_URL,
        from: FROM,
        transport: failingTransport(transportError),
      }).send(message),
    );

    expect(error).toBeInstanceOf(EmailDeliveryError);
    expect("cause" in (error as object)).toBe(false);

    const text = exposed(error);

    for (const secret of ["sup3r", "mailer", "smtp.example.com", "ada@example.com", "Private body"]) {
      expect(text).not.toContain(secret);
    }
  });

  it("stops waiting after the time limit and does not retry", async () => {
    let attempts = 0;
    let closed = false;

    const error = await caught(
      createEmailSender({
        from: FROM,
        timeoutMs: 20,
        transport: {
          sendMail() {
            attempts += 1;
            return new Promise(() => {});
          },
          close() {
            closed = true;
          },
        },
      }).send(message),
    );

    expect(error).toBeInstanceOf(EmailDeliveryError);
    expect((error as EmailDeliveryError).reason).toBe("timeout");
    expect(attempts).toBe(1);
    expect(closed).toBe(true);
  });

  it("does not retry a failed delivery", async () => {
    let attempts = 0;

    await caught(
      createEmailSender({
        from: FROM,
        transport: {
          sendMail() {
            attempts += 1;
            return Promise.reject(Object.assign(new Error("x"), { code: "ECONNECTION" }));
          },
        },
      }).send(message),
    );

    expect(attempts).toBe(1);
  });
});

describe("network guard", () => {
  it("fails any attempt to open a connection", () => {
    expect(() => net.connect(25, "127.0.0.1")).toThrow(
      "Tests must not open network connections.",
    );
  });

  it("turns a real SMTP send into a delivery error without connecting", async () => {
    const error = await caught(
      createEmailSender({
        smtpUrl: "smtp://127.0.0.1:1025",
        from: FROM,
        timeoutMs: 1_000,
      }).send(message),
    );

    expect(error).toBeInstanceOf(EmailDeliveryError);
  });
});
