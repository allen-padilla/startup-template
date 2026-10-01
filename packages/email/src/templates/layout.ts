import { html, type SafeHtml } from "../template";

import { productName } from "./brand";

/** Wraps a message body in a minimal HTML document that renders everywhere. */
export function layout(body: SafeHtml): string {
  return html`<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
  </head>
  <body style="margin:0;padding:24px;background:#f6f6f6;font-family:system-ui,-apple-system,'Segoe UI',sans-serif;font-size:16px;line-height:1.5;color:#111111">
    <div style="max-width:560px;margin:0 auto;padding:32px;background:#ffffff;border-radius:8px">
      ${body}
      <p style="margin:32px 0 0;font-size:13px;color:#666666">${productName}</p>
    </div>
  </body>
</html>
`.value;
}

/** Inline styles for a link that reads as a button. */
export const buttonStyle =
  "display:inline-block;padding:12px 20px;background:#111111;color:#ffffff;border-radius:6px;text-decoration:none;font-weight:600";
