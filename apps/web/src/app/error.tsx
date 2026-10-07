"use client";

import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";

import { Button } from "@startup/ui";

export default function ErrorPage({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <main className="flex flex-1 items-center justify-center px-6 py-24 font-sans">
      <div className="flex w-full max-w-sm flex-col gap-6">
        <h1 className="text-2xl font-semibold tracking-tight">Something went wrong</h1>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          This page could not be loaded. Please try again.
        </p>
        <Button onClick={() => retry()}>Try again</Button>
      </div>
    </main>
  );
}
