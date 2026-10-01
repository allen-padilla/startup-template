import { after } from "next/server";

/**
 * Runs work that the response must not wait for, such as sending email. The
 * task must handle its own errors. A future jobs package can enqueue here
 * instead.
 */
export type RunInBackground = (task: () => Promise<void>) => Promise<void>;

/**
 * Starts the task now and lets the response finish without it. Next.js
 * `after()` keeps the request alive until the task settles: `waitUntil` on
 * Vercel, the same process on `next start`. Outside a request scope, such as
 * a script, `after()` is unavailable and the task is awaited instead.
 */
export const runAfterResponse: RunInBackground = async (task) => {
  const promise = task();

  try {
    after(promise);
  } catch {
    await promise;
  }
};

/** Runs the task before returning. For tests and server-side callers. */
export const runInline: RunInBackground = (task) => task();
