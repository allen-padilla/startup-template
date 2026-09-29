import { z } from "zod";

import { optional } from "./optional";

const clientSchema = z.object({
  NEXT_PUBLIC_SENTRY_DSN: optional(z.string().url()),
  NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN: optional(z.string().min(1)),
  NEXT_PUBLIC_POSTHOG_HOST: optional(z.string().url()),
});

export const clientEnv = clientSchema.parse({
  NEXT_PUBLIC_SENTRY_DSN: process.env.NEXT_PUBLIC_SENTRY_DSN,
  NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN:
    process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN,
  NEXT_PUBLIC_POSTHOG_HOST: process.env.NEXT_PUBLIC_POSTHOG_HOST,
});
