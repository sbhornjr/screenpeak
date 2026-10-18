// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require("eslint-config-expo/flat");

module.exports = defineConfig([
  expoConfig,
  {
    ignores: ["dist/*"],
  },
  {
    files: ["src/**/*.{ts,tsx}"],
    ignores: ["src/theme/**", "src/**/*.test.ts", "src/**/*.test.tsx"],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector: "Literal[value=/#[0-9A-Fa-f]{3,8}\\b/]",
          message: "Use @/theme. Raw hex belongs in packages/shared/tokens.ts.",
        },
        {
          selector: "TemplateElement[value.raw=/#[0-9A-Fa-f]{3,8}\\b/]",
          message: "Use @/theme. Raw hex belongs in packages/shared/tokens.ts.",
        },
      ],
    },
  },
]);
