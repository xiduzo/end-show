import js from "@eslint/js";
import boundaries from "eslint-plugin-boundaries";
import globals from "globals";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: [
      "dist/**",
      "dev-dist/**",
      "node_modules/**",
      ".turbo/**",
      ".tanstack/**",
      "src/routeTree.gen.ts",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["src/**/*.{ts,tsx}"],
    languageOptions: {
      globals: { ...globals.browser, ...globals.es2024 },
      parserOptions: { project: false },
    },
    plugins: { boundaries },
    settings: {
      "boundaries/elements": [
        { type: "route", pattern: "src/routes/**/*", mode: "file" },
        { type: "shell", pattern: "src/shell/**/*", mode: "file" },
        { type: "lib", pattern: "src/lib/**/*", mode: "file" },
        {
          type: "feature",
          pattern: "src/features/*",
          capture: ["name"],
        },
        { type: "entry", pattern: "src/main.tsx", mode: "file" },
      ],
      "boundaries/include": ["src/**/*"],
      "import/resolver": {
        typescript: { alwaysTryTypes: true },
      },
    },
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      "@typescript-eslint/no-explicit-any": "off",

      // Vertical boundary policy:
      // - Routes may compose anything via its public index.
      // - Shell + lib are foundation: features/routes may use them, they
      //   should not depend on features (we allow it for now via top-bar →
      //   auth; tighten later).
      // - Cross-feature imports must go through the feature's public index.
      "boundaries/element-types": [
        "warn",
        {
          default: "disallow",
          rules: [
            {
              from: "route",
              allow: ["route", "shell", "lib", "feature", "entry"],
            },
            { from: "entry", allow: ["shell", "lib", "feature", "route"] },
            { from: "feature", allow: ["shell", "lib", "feature"] },
            { from: "shell", allow: ["shell", "lib", "feature"] },
            { from: "lib", allow: ["lib"] },
          ],
        },
      ],

      // Note: cross-vertical via index.ts is enforced by convention (already
      // applied in the codebase). The plugin's entry-point rule conflicts
      // with vertical index.ts re-exporting its own siblings — keep it off.
    },
  },
  {
    files: [
      "src/features/*/**/*.{ts,tsx}",
      "src/shell/**/*.{ts,tsx}",
      "src/lib/**/*.{ts,tsx}",
    ],
    // Inside a vertical, siblings may import each other via relative paths.
    // The entry-point rule above only checks @/features/<x>/<deep> style.
    rules: {},
  },
);
