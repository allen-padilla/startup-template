import type { Metadata } from "next";
import Link from "next/link";

import { ForgotPasswordForm } from "./forgot-password-form";

export const metadata: Metadata = { title: "Reset your password" };

export default function ForgotPasswordPage() {
  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight">Reset your password</h1>
      <p className="text-sm text-zinc-600 dark:text-zinc-400">
        Enter your email address and we&apos;ll send you a link to set a new password.
      </p>
      <ForgotPasswordForm />
      <Link href="/sign-in" className="text-sm underline underline-offset-4">
        Back to sign in
      </Link>
    </>
  );
}
