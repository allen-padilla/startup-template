// Liveness check for the host's health check. It never touches the database
// or the session, so it only says that the server process answers.
export function GET() {
  return new Response("ok", {
    headers: { "cache-control": "no-store" },
  });
}
