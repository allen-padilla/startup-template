// Reads messages captured by the local or CI Mailpit mail catcher.
// See docs/architecture/email.md.
import { expect } from "@playwright/test";

const MAILPIT_URL = process.env.MAILPIT_URL ?? "http://127.0.0.1:8025";

interface MailpitSummary {
  ID: string;
  Subject: string;
}

export interface MailpitMessage {
  Subject: string;
  Text: string;
  HTML: string;
}

/** Messages addressed to `address`, newest first. */
export async function messagesTo(address: string): Promise<MailpitSummary[]> {
  const query = encodeURIComponent(`to:"${address}"`);
  const response = await fetch(`${MAILPIT_URL}/api/v1/search?query=${query}`);

  expect(response.ok, "Mailpit is reachable").toBe(true);

  return ((await response.json()) as { messages: MailpitSummary[] }).messages;
}

/**
 * Waits until `count` messages addressed to `address` have arrived, and
 * returns the newest one matching `subject`. Messages are sent after the
 * response, so they can arrive a moment later.
 */
export async function waitForMessage(
  address: string,
  { subject, count = 1 }: { subject: RegExp; count?: number },
): Promise<MailpitMessage> {
  let summaries: MailpitSummary[] = [];

  await expect
    .poll(
      async () => {
        summaries = (await messagesTo(address)).filter((message) =>
          subject.test(message.Subject),
        );
        return summaries.length;
      },
      { message: `${count} message(s) to ${address}`, timeout: 15_000 },
    )
    .toBeGreaterThanOrEqual(count);

  const response = await fetch(`${MAILPIT_URL}/api/v1/message/${summaries[0]!.ID}`);

  return (await response.json()) as MailpitMessage;
}

/** The application path and query of the first link in a plain-text body. */
export function linkPath(message: MailpitMessage): string {
  const link = message.Text.match(/https?:\/\/\S+/)?.[0];

  expect(link, "the message contains a link").toBeTruthy();

  const url = new URL(link!);

  return `${url.pathname}${url.search}`;
}
