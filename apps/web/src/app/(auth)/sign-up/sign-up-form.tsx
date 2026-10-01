"use client";

import Link from "next/link";
import { useActionState } from "react";

import { authClient } from "@startup/auth/client";
import { Button, FormMessage, Input, Label } from "@startup/ui";

import {
  authErrorMessage,
  MESSAGES,
  NAME_MAX_LENGTH,
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  VERIFY_CALLBACK,
} from "@/lib/auth";

interface State {
  name: string;
  email: string;
  error?: string;
  exists?: boolean;
  done?: boolean;
}

export function SignUpForm({
  redirectTo,
  signInHref,
}: {
  redirectTo: string;
  signInHref: string;
}) {
  const [state, submit, pending] = useActionState(
    async (_: State, form: FormData): Promise<State> => {
      const name = String(form.get("name") ?? "").trim();
      const email = String(form.get("email") ?? "");
      const { error } = await authClient.signUp.email({
        name,
        email,
        password: String(form.get("password") ?? ""),
        callbackURL: VERIFY_CALLBACK,
      });

      if (error?.code === "USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL") {
        return { name, email, exists: true };
      }
      if (error) return { name, email, error: authErrorMessage(error) };

      // Sign-up signs the user in. A full navigation renders server
      // components with the new session.
      window.location.assign(redirectTo);
      return { name, email, done: true };
    },
    { name: "", email: "" },
  );

  return (
    <form action={submit} className="flex flex-col gap-4">
      <FormMessage tone="error">
        {state.exists ? (
          <>
            {MESSAGES.accountExists}{" "}
            <Link href={signInHref} className="underline underline-offset-4">
              Sign in
            </Link>{" "}
            or{" "}
            <Link href="/forgot-password" className="underline underline-offset-4">
              reset your password
            </Link>
            .
          </>
        ) : (
          state.error
        )}
      </FormMessage>
      <div className="flex flex-col gap-2">
        <Label htmlFor="name">Name</Label>
        <Input
          id="name"
          name="name"
          autoComplete="name"
          required
          maxLength={NAME_MAX_LENGTH}
          defaultValue={state.name}
        />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="email">Email</Label>
        <Input id="email" name="email" type="email" autoComplete="email" required defaultValue={state.email} />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="password">Password</Label>
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
      <Button type="submit" disabled={pending || state.done}>
        Create account
      </Button>
    </form>
  );
}
