import { z } from "zod";

// Treat empty strings (e.g. `NEXT_PUBLIC_SENTRY_DSN=`) as unset so optional
// integrations stay disabled instead of failing validation.
export const optional = <T extends z.ZodType>(schema: T) =>
  z.preprocess((value) => (value === "" ? undefined : value), schema.optional());
