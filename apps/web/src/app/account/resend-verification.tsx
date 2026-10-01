"use client";

import { useActionState } from "react";

import { authClient } from "@startup/auth/client";
import { Button, FormMessage } from "@startup/ui";

import { authErrorMessage, MESSAGES, VERIFY_CALLBACK } from "@/lib/auth";

interface State {
  sent?: boolean;
  error?: string;
}

export function ResendVerification({ email }: { email: string }) {
  const [state, submit, pending] = useActionState(async (): Promise<State> => {
    const { error } = await authClient.sendVerificationEmail({
      email,
      callbackURL: VERIFY_CALLBACK,
    });

    return error ? { error: authErrorMessage(error) } : { sent: true };
  }, {});

  return (
    <form action={submit} className="flex flex-col gap-4">
      {state.sent ? (
        <FormMessage tone="success">{MESSAGES.verificationSent}</FormMessage>
      ) : (
        <FormMessage tone="error">{state.error}</FormMessage>
      )}
      <Button type="submit" variant="outline" disabled={pending}>
        Resend verification email
      </Button>
    </form>
  );
}
