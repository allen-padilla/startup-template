import js from "@eslint/js";
import { defineConfig, globalIgnores } from "eslint/config";
import tseslint from "typescript-eslint";

// Shared configuration for every workspace package. ESLint finds it by walking
// up from the package directory that `pnpm lint` runs in. `apps/web` has its own
// configuration, built on eslint-config-next, so it is ignored here.
export default defineConfig([
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      // The packages reject control characters in untrusted strings, such as
      // SMTP headers and user names, so matching them in a regex is the point.
      "no-control-regex": "off",
    },
  },
  globalIgnores(["apps/**", "**/node_modules/**", "**/.turbo/**", "**/dist/**"]),
]);
