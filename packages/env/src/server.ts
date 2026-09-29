import { z } from "zod";

const serverSchema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
});

export const serverEnv = serverSchema.parse({
  NODE_ENV: process.env.NODE_ENV,
});