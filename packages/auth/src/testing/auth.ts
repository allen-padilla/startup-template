import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";

import { schema, type Database } from "@startup/db";
import { migrationsFolder } from "@startup/db/migrations";
import type { EmailError, EmailMessage } from "@startup/email";

import { createAuth, type CreateAuthOptions } from "../auth";
import { runInline } from "../background";

export const BASE_URL = "http://localhost:3000";
export const SECRET = "test-only-secret-that-is-at-least-32-chars";

/**
 * Better Auth on in-memory Postgres with the repository migrations applied, a
 * recording email sender, and background work run inline.
 */
export async function createTestAuth(overrides: Partial<CreateAuthOptions> = {}) {
  const client = new PGlite();
  const db = drizzle({ client, schema }) as unknown as Database;

  await migrate(db as never, { migrationsFolder });

  const sent: EmailMessage[] = [];
  const failures: EmailError[] = [];

  const auth = createAuth({
    db,
    secret: SECRET,
    baseURL: BASE_URL,
    sendEmail: async (message) => {
      sent.push(message);
    },
    runInBackground: runInline,
    reportEmailFailure: (error) => failures.push(error),
    rateLimitEnabled: false,
    // Better Auth skips origin checks when NODE_ENV is "test".
    advanced: { disableOriginCheck: false },
    ...overrides,
  });

  async function request(
    path: string,
    init: { method?: string; body?: unknown; cookie?: string; ip?: string } = {},
  ) {
    const headers = new Headers({ origin: BASE_URL });

    if (init.body !== undefined) headers.set("content-type", "application/json");
    if (init.cookie) headers.set("cookie", init.cookie);
    if (init.ip) headers.set("x-forwarded-for", init.ip);

    return auth.handler(
      new Request(`${BASE_URL}/api/auth${path}`, {
        method: init.method ?? (init.body === undefined ? "GET" : "POST"),
        headers,
        body: init.body === undefined ? undefined : JSON.stringify(init.body),
        redirect: "manual",
      }),
    );
  }

  async function signUp(email: string, password = "first-password-123") {
    const response = await request("/sign-up/email", {
      body: { name: "Ada Lovelace", email, password },
    });

    return { response, cookie: sessionCookie(response) };
  }

  async function getSession(cookie: string) {
    const response = await request("/get-session", { cookie });

    return (await response.json()) as {
      user: { email: string; emailVerified: boolean };
    } | null;
  }

  return {
    auth,
    db,
    sent,
    failures,
    request,
    signUp,
    getSession,
    close: () => client.close(),
  };
}

export function sessionCookie(response: Response) {
  return response.headers
    .getSetCookie()
    .map((cookie) => cookie.split(";")[0])
    .join("; ");
}

/** The first absolute link in a plain-text body. */
export function linkIn(message: EmailMessage | undefined) {
  const link = message?.text.match(/https?:\/\/\S+/)?.[0];

  if (!link) throw new Error("No link in the message.");

  return link;
}
