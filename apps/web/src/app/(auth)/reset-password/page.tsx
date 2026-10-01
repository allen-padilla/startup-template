import type { Metadata } from "next";

import { param, type SearchParams } from "@/lib/auth";

import { InvalidResetLink, ResetPasswordForm } from "./reset-password-form";

export const metadata: Metadata = { title: "Set a new password" };

// The URL carries the reset token. The page is served with
// `Referrer-Policy: no-referrer` (next.config.ts), the form removes the token
// from the address bar, and observability scrubs it. See observability.md.
export default async function ResetPasswordPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const token = param(params.token);
  const valid = token !== undefined && token !== "" && param(params.error) === undefined;

  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight">Set a new password</h1>
      {valid ? <ResetPasswordForm token={token} /> : <InvalidResetLink />}
    </>
  );
}
