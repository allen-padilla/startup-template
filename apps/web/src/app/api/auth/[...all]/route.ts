// apps/web/src/app/api/auth/[...all]/route.ts
import { authHandler } from "@startup/auth/next";

export const { GET, POST } = authHandler;
