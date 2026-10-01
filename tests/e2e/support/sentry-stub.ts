// Stands in for Sentry during E2E runs. `pnpm test:e2e` builds the
// application with a DSN that points here, so E2E runs never report to a real
// Sentry project, and tests can read what the application sent through
// `support/sentry.ts`. Playwright starts this server. See testing.md.
import { createServer } from "node:http";
import { gunzipSync } from "node:zlib";

const PORT = 9999;

// One entry per request body, such as an envelope of spans or an error event.
const received: string[] = [];

const cors = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "*",
};

createServer((request, response) => {
  if (request.method === "OPTIONS") {
    response.writeHead(204, cors).end();
    return;
  }

  if (request.method === "GET") {
    const body = request.url === "/received" ? JSON.stringify(received) : "ok";

    response.writeHead(200, { "content-type": "application/json" }).end(body);
    return;
  }

  const chunks: Buffer[] = [];

  request.on("data", (chunk: Buffer) => chunks.push(chunk));
  request.on("end", () => {
    const body = Buffer.concat(chunks);

    received.push(
      (request.headers["content-encoding"] === "gzip" ? gunzipSync(body) : body).toString(),
    );
    response.writeHead(200, { ...cors, "content-type": "application/json" }).end("{}");
  });
}).listen(PORT, "127.0.0.1");
