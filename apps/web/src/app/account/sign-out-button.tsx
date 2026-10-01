"use client";

import posthog from "posthog-js";
import { useActionState } from "react";

import { authClient } from "@startup/auth/client";
import { Button, FormMessage } from "@startup/ui";

import { MESSAGES } from "@/lib/auth";

interface State {
  error?: string;
  done?: boolean;
}

export function SignOutButton() {
  const [state, submit, pending] = useActionState(async (): Promise<State> => {
    const { error } = await authClient.signOut();

    if (error) return { error: MESSAGES.generic };

    // Analytics identity ends with the session. See observability.md.
    if (posthog.__loaded) posthog.reset();

    // A full load, not a client navigation: it drops every piece of client
    // state, including the router cache, that belonged to the session.
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    window.location.assign("/");
    return { done: true };
  }, {});

  return (
    <form action={submit} className="flex flex-col gap-4">
      <FormMessage tone="error">{state.error}</FormMessage>
      <Button type="submit" variant="ghost" disabled={pending || state.done}>
        Sign out
      </Button>
    </form>
  );
}
