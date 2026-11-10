// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require("eslint-config-expo/flat");
const stylistic = require("@stylistic/eslint-plugin");
const { selectors } = require("./eslint/raw-color.cjs");

module.exports = defineConfig([
  expoConfig,
  {
    ignores: ["dist/*"],
  },
  {
    files: ["src/**/*.{ts,tsx}"],
    plugins: { "@stylistic": stylistic },
    rules: {
      // The repo style. Lint --fix applies it; there is no separate formatter.
      "@stylistic/semi": ["error", "never"],
    },
  },
  {
    files: ["src/**/*.{ts,tsx}"],
    ignores: ["src/**/*.test.ts", "src/**/*.test.tsx"],
    rules: {
      "no-restricted-syntax": ["error", ...selectors()],
      "no-restricted-imports": ["error", {
        patterns: [{ group: ["@screenpeak/shared/testing/*"], message: "Test fixtures stay in test files." }],
      }],
    },
  },
]);
