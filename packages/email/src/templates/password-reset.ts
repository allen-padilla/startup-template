import { assertHttpUrl, html, type EmailTemplate } from "../template";

import { productName } from "./brand";
import { buttonStyle, layout } from "./layout";

// Sent to an address that may not belong to the person who typed it, so the
// message carries nothing a user entered. See docs/architecture/email.md.
export interface PasswordResetEmailInput {
  /** The reset link. It works once and expires after one hour. */
  url: string;
}

export const passwordResetEmail: EmailTemplate<PasswordResetEmailInput> = ({ url }) => {
  const link = assertHttpUrl(url);

  return {
    subject: `Reset your ${productName} password`,
    html: layout(html`
      <p style="margin:0 0 16px">Hi,</p>
      <p style="margin:0 0 16px">We received a request to reset your password. The link below works once and expires in one hour.</p>
      <p style="margin:0 0 24px"><a href="${link}" style="${buttonStyle}">Reset your password</a></p>
      <p style="margin:0 0 16px">If the button does not work, copy this link into your browser:<br /><a href="${link}">${link}</a></p>
      <p style="margin:0">If you did not ask for a reset, you can ignore this email. Your password does not change until you use the link.</p>
    `),
    text: [
      "Hi,",
      "",
      "We received a request to reset your password. The link below works once and expires in one hour.",
      "",
      link,
      "",
      "If you did not ask for a reset, you can ignore this email. Your password does not change until you use the link.",
      "",
      productName,
    ].join("\n"),
  };
};
