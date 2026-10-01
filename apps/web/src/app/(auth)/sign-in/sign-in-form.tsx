"use client";

import { useActionState } from "react";

import { authClient } from "@startup/auth/client";
import { Button, FormMessage, Input, Label } from "@startup/ui";

import { authErrorMessage } from "@/lib/auth";

interface State {
  email: string;
  error?: string;
  done?: boolean;
}

export function SignInForm({ redirectTo }: { redirectTo: string }) {
  const [state, submit, pending] = useActionState(
    async (_: State, form: FormData): Promise<State> => {
      const email = String(form.get("email") ?? "");
      const { error } = await authClient.signIn.email({
        email,
        password: String(form.get("password") ?? ""),
      });

      if (error) return { email, error: authErrorMessage(error) };

      // A full navigation renders server components with the new session.
      window.location.assign(redirectTo);
      return { email, done: true };
    },
    { email: "" },
  );

  return (
    <form action={submit} className="flex flex-col gap-4">
      <FormMessage tone="error">{state.error}</FormMessage>
      <div className="flex flex-col gap-2">
        <Label htmlFor="email">Email</Label>
        <Input id="email" name="email" type="email" autoComplete="email" required defaultValue={state.email} />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="password">Password</Label>
        <Input id="password" name="password" type="password" autoComplete="current-password" required />
      </div>
      <Button type="submit" disabled={pending || state.done}>
        Sign in
      </Button>
    </form>
  );
}
