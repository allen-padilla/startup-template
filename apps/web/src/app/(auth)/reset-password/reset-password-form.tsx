"use client";

import Link from "next/link";
import { useActionState, useEffect } from "react";

import { authClient } from "@startup/auth/client";
import { Button, FormMessage, Input, Label } from "@startup/ui";

import {
  authErrorMessage,
  MESSAGES,
  PASSWORD_CHANGED,
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
} from "@/lib/auth";

interface State {
  error?: string;
  invalid?: boolean;
  done?: boolean;
}

export function InvalidResetLink() {
  return (
    <FormMessage tone="error">
      {MESSAGES.resetLinkInvalid}{" "}
      <Link href="/forgot-password" className="underline underline-offset-4">
        Request a new link
      </Link>
      .
    </FormMessage>
  );
}

export function ResetPasswordForm({ token }: { token: string }) {
  // The token stays in memory for the submit. Removing it from the address
  // bar and the history entry keeps it out of later page views.
  useEffect(() => {
    window.history.replaceState(null, "", "/reset-password");
  }, []);

  const [state, submit, pending] = useActionState(
    async (_: State, form: FormData): Promise<State> => {
      const newPassword = String(form.get("password") ?? "");

      if (newPassword !== String(form.get("confirm") ?? "")) {
        return { error: MESSAGES.passwordsDiffer };
      }

      const { error } = await authClient.resetPassword({ newPassword, token });

      if (error?.code === "INVALID_TOKEN") return { invalid: true };
      if (error) return { error: authErrorMessage(error) };

      window.location.assign(PASSWORD_CHANGED);
      return { done: true };
    },
    {},
  );

  if (state.invalid) return <InvalidResetLink />;

  return (
    <form action={submit} className="flex flex-col gap-4">
      <FormMessage tone="error">{state.error}</FormMessage>
      <div className="flex flex-col gap-2">
        <Label htmlFor="password">New password</Label>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          required
          minLength={PASSWORD_MIN_LENGTH}
          maxLength={PASSWORD_MAX_LENGTH}
          aria-describedby="password-rule"
        />
        <p id="password-rule" className="text-sm text-zinc-600 dark:text-zinc-400">
          {PASSWORD_MIN_LENGTH} to {PASSWORD_MAX_LENGTH} characters.
        </p>
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="confirm">Confirm new password</Label>
        <Input
          id="confirm"
          name="confirm"
          type="password"
          autoComplete="new-password"
          required
          minLength={PASSWORD_MIN_LENGTH}
          maxLength={PASSWORD_MAX_LENGTH}
        />
      </div>
      <Button type="submit" disabled={pending || state.done}>
        Set new password
      </Button>
    </form>
  );
}
