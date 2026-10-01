import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { getSession } from "@startup/auth/next";
import { safeRedirectPath } from "@startup/auth/redirect";

import { param, withRedirect, type SearchParams } from "@/lib/auth";

import { SignUpForm } from "./sign-up-form";

export const metadata: Metadata = { title: "Create an account" };

export default async function SignUpPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const target = safeRedirectPath(param(params.redirect));

  if (await getSession()) redirect(target);

  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight">Create an account</h1>
      <SignUpForm redirectTo={target} signInHref={withRedirect("/sign-in", target)} />
      <p className="text-sm">
        Already have an account?{" "}
        <Link href={withRedirect("/sign-in", target)} className="underline underline-offset-4">
          Sign in
        </Link>
      </p>
    </>
  );
}
