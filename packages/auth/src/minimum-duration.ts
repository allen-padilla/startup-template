/**
 * Runs `task` and resolves no sooner than `milliseconds` after it started, so
 * the response time does not depend on what the task did.
 */
export async function withMinimumDuration<T>(
  milliseconds: number,
  task: () => Promise<T>,
): Promise<T> {
  const started = performance.now();

  try {
    return await task();
  } finally {
    const remaining = milliseconds - (performance.now() - started);

    if (remaining > 0) {
      await new Promise((resolve) => setTimeout(resolve, remaining));
    }
  }
}
