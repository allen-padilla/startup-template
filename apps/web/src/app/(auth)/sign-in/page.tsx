import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { getSession } from "@startup/auth/next";
import { safeRedirectPath } from "@startup/auth/redirect";
import { FormMessage } from "@startup/ui";

import { MESSAGES, param, withRedirect, type SearchParams } from "@/lib/auth";

import { SignInForm } from "./sign-in-form";

export const metadata: Metadata = { title: "Sign in" };

export default async function SignInPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const target = safeRedirectPath(param(params.redirect));

  if (await getSession()) redirect(target);

  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight">Sign in</h1>
      {param(params.password) === "changed" && (
        <FormMessage tone="success">{MESSAGES.passwordChanged}</FormMessage>
      )}
      <SignInForm redirectTo={target} />
      <div className="flex flex-col gap-2 text-sm">
        <Link href="/forgot-password" className="underline underline-offset-4">
          Forgot your password?
        </Link>
        <p>
          No account?{" "}
          <Link href={withRedirect("/sign-up", target)} className="underline underline-offset-4">
            Create one
          </Link>
        </p>
      </div>
    </>
  );
}
