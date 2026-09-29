import { z } from "zod";

// Treat empty strings (e.g. `NEXT_PUBLIC_SENTRY_DSN=`) as unset so optional
// integrations stay disabled instead of failing validation.
const optional = <T extends z.ZodType>(schema: T) =>
  z.preprocess((value) => (value === "" ? undefined : value), schema.optional());

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
