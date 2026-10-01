// Stands in for Sentry and PostHog during E2E runs. `scripts/build-e2e.sh`
// builds the application with a Sentry DSN and a PostHog host that point
// here, so E2E runs never report to real projects, and tests can read what
// the application sent through `support/observability.ts`. Playwright starts
// this server. See docs/architecture/testing.md.
import { createServer, type IncomingMessage } from "node:http";
import { gunzipSync } from "node:zlib";

const PORT = 9999;

// One entry per request: its method, path and query, then its body, such as
// a Sentry envelope or a batch of PostHog events.
const received: string[] = [];

const cors = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "*",
};

// Sentry and PostHog both gzip some bodies, not always with a header that
// says so, so gzip is recognized by its magic bytes. PostHog can also send
// base64, marked with a `compression` query parameter.
function decode(request: IncomingMessage, body: Buffer): string {
  if (body[0] === 0x1f && body[1] === 0x8b) return gunzipSync(body).toString();

  const compression = new URL(request.url ?? "/", "http://stub").searchParams.get("compression");

  if (compression === "base64") {
    const data = new URLSearchParams(body.toString()).get("data") ?? "";

    return Buffer.from(data, "base64").toString();
  }

  return body.toString();
}

createServer((request, response) => {
  if (request.method === "OPTIONS") {
    response.writeHead(204, cors).end();
    return;
  }

  if (request.method === "GET") {
    // `/received` is for tests. Anything else is a client loading
    // configuration, which an empty object satisfies.
    const body = request.url === "/received" ? JSON.stringify(received) : "{}";

    response.writeHead(200, { ...cors, "content-type": "application/json" }).end(body);
    return;
  }

  const chunks: Buffer[] = [];

  request.on("data", (chunk: Buffer) => chunks.push(chunk));
  request.on("end", () => {
    received.push(`${request.method} ${request.url}\n${decode(request, Buffer.concat(chunks))}`);
    response.writeHead(200, { ...cors, "content-type": "application/json" }).end("{}");
  });
}).listen(PORT, "127.0.0.1");
