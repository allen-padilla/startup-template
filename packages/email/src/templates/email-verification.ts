import { assertHttpUrl, html, type EmailTemplate } from "../template";

import { productName } from "./brand";
import { buttonStyle, layout } from "./layout";

export interface EmailVerificationEmailInput {
  /** The account holder's name, as entered at sign-up. */
  name: string;
  /** The verification link. It expires after one hour. */
  url: string;
}

export const emailVerificationEmail: EmailTemplate<
  EmailVerificationEmailInput
> = ({ name, url }) => {
  const link = assertHttpUrl(url);

  return {
    subject: `Confirm your email address for ${productName}`,
    html: layout(html`
      <p style="margin:0 0 16px">Hi ${name},</p>
      <p style="margin:0 0 16px">Confirm that this email address belongs to you. The link below expires in one hour.</p>
      <p style="margin:0 0 24px"><a href="${link}" style="${buttonStyle}">Confirm email address</a></p>
      <p style="margin:0 0 16px">If the button does not work, copy this link into your browser:<br /><a href="${link}">${link}</a></p>
      <p style="margin:0">If you did not create an account, you can ignore this email.</p>
    `),
    text: [
      `Hi ${name},`,
      "",
      "Confirm that this email address belongs to you. The link below expires in one hour.",
      "",
      link,
      "",
      "If you did not create an account, you can ignore this email.",
      "",
      productName,
    ].join("\n"),
  };
};
