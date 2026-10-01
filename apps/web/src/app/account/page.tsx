import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { getSession } from "@startup/auth/next";
import { FormMessage } from "@startup/ui";

import { MESSAGES, param, type SearchParams } from "@/lib/auth";

import { ResendVerification } from "./resend-verification";
import { SignOutButton } from "./sign-out-button";

export const metadata: Metadata = { title: "Account" };

export default async function AccountPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const session = await getSession();

  if (!session) {
    // Keep the query, so a verification outcome survives signing in.
    const query = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      for (const item of [value].flat()) if (item !== undefined) query.append(key, item);
    }
    const path = query.size > 0 ? `/account?${query}` : "/account";

    redirect(`/sign-in?redirect=${encodeURIComponent(path)}`);
  }

  const { user } = session;
  const linkFailed = param(params.error) !== undefined;
  // Only an address that is actually verified gets the confirmation.
  const justVerified = !linkFailed && param(params.verified) === "1" && user.emailVerified;

  return (
    <main className="flex flex-1 items-center justify-center px-6 py-24 font-sans">
      <div className="flex w-full max-w-sm flex-col gap-6">
        <h1 className="text-2xl font-semibold tracking-tight">Account</h1>
        {justVerified && <FormMessage tone="success">{MESSAGES.emailVerified}</FormMessage>}
        {linkFailed && <FormMessage tone="error">{MESSAGES.verificationLinkInvalid}</FormMessage>}
        <dl className="flex flex-col gap-4 text-sm">
          <div className="flex flex-col gap-1">
            <dt className="font-medium">Email</dt>
            <dd>{user.email}</dd>
          </div>
          <div className="flex flex-col gap-1">
            <dt className="font-medium">Status</dt>
            <dd>{user.emailVerified ? "Verified" : "Not verified"}</dd>
          </div>
        </dl>
        {!user.emailVerified && <ResendVerification email={user.email} />}
        <SignOutButton />
      </div>
    </main>
  );
}
