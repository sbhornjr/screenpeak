import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import v1BearerOnly from "./eslint/v1-bearer-only.mjs";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    files: ["app/api/v1/**/*.ts"],
    plugins: {
      screenpeak: {
        rules: {
          "v1-bearer-only": v1BearerOnly,
        },
      },
    },
    rules: {
      "screenpeak/v1-bearer-only": "error",
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
