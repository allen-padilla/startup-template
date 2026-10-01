"use client";

import { useActionState } from "react";

import { authClient } from "@startup/auth/client";
import { Button, FormMessage, Input, Label } from "@startup/ui";

import { authErrorMessage, MESSAGES } from "@/lib/auth";

interface State {
  email: string;
  sent?: boolean;
  error?: string;
}

export function ForgotPasswordForm() {
  const [state, submit, pending] = useActionState(
    async (_: State, form: FormData): Promise<State> => {
      const email = String(form.get("email") ?? "");
      const { error } = await authClient.requestPasswordReset({
        email,
        redirectTo: "/reset-password",
      });

      // The same message for every address, whether or not it has an account.
      return error ? { email, error: authErrorMessage(error) } : { email, sent: true };
    },
    { email: "" },
  );

  return (
    <form action={submit} className="flex flex-col gap-4">
      {state.sent ? (
        <FormMessage tone="success">{MESSAGES.resetSent}</FormMessage>
      ) : (
        <FormMessage tone="error">{state.error}</FormMessage>
      )}
      <div className="flex flex-col gap-2">
        <Label htmlFor="email">Email</Label>
        <Input id="email" name="email" type="email" autoComplete="email" required defaultValue={state.email} />
      </div>
      <Button type="submit" disabled={pending}>
        Send reset link
      </Button>
    </form>
  );
}
