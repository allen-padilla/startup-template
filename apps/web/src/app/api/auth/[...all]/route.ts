// apps/web/src/app/api/auth/[...all]/route.ts
import { auth } from "@startup/auth";
import { toNextJsHandler } from "better-auth/next-js";

export const { GET, POST } = toNextJsHandler(auth);