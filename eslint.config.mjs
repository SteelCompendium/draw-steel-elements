// Community-submission compliance linting (SC-11). Additive to the existing
// legacy .eslintrc (which ESLint v9 ignores by default in flat-config mode);
// scoped to plugin source only — visual harness, demo vault, and generated
// output are excluded.
import tsparser from "@typescript-eslint/parser";
import { defineConfig } from "eslint/config";
import obsidianmd from "eslint-plugin-obsidianmd";
import tseslint from "typescript-eslint";
import js from "@eslint/js";
import globals from "globals";

// The Obsidian plugin-submission rules (obsidianmd/*) do not apply to the Node-side e2e layer.
const noObsidianRules = Object.fromEntries(
  Object.keys(obsidianmd.rules ?? {}).map((name) => [`obsidianmd/${name}`, "off"]),
);

export default defineConfig([
  {
    ignores: [
      "main.js",
      "node_modules/**",
      "visual-harness/**",
      // SC-125: maintainer-only, offline map generator (plain Node ESM, never
      // bundled into the plugin) — same class as visual-harness, and the typed
      // obsidianmd rules cannot run on a file outside tsconfig's project.
      "tools/**",
      "demo-vault/**",
      "docs/**",
      "test/**",
      "*.config.mjs",
      "esbuild.config.mjs",
      // SC-408: run output (failure bundles, copied plugin build) is never source.
      "e2e/.out/**",
    ],
  },
  ...obsidianmd.configs.recommended,
  {
    files: ["src/**/*.ts", "main.ts"],
    languageOptions: {
      parser: tsparser,
      parserOptions: { project: "./tsconfig.json" },
    },
    rules: {
      // "Draw Steel"/"Draw Steel Elements" are the game/plugin's own brand names
      // (matches the plugin name in manifest.json); "SCC" is the Steel Compendium
      // Classification acronym (see workspace docs/scc-reference.md). Without these,
      // the rule would mangle correct proper-noun casing in Notices/commands/titles.
      "obsidianmd/ui/sentence-case": [
        "error",
        {
          enforceCamelCaseLower: true,
          brands: ["Draw Steel Elements", "Draw Steel"],
          acronyms: ["SCC"],
        },
      ],
    },
  },
  // SC-408: the real-Obsidian e2e layer (e2e/) is Node test code, not plugin source: it is linted
  // against its own tsconfig with TypeScript's recommended rules, and the Obsidian-plugin-submission
  // rules (obsidianmd/*) do not apply to it.
  {
    files: ["e2e/**/*.ts", "e2e/**/*.mts"],
    languageOptions: {
      parser: tsparser,
      parserOptions: { project: "./e2e/tsconfig.json" },
    },
    plugins: { "@typescript-eslint": tseslint.plugin },
    rules: {
      ...noObsidianRules,
      "import/no-nodejs-modules": "off", // Node-side test code: fs/path/child_process are the point
      ...tseslint.configs.recommendedTypeChecked.reduce((acc, c) => ({ ...acc, ...(c.rules ?? {}) }), {}),
      // wdio chainable elements are thenables; awaiting them is the API, not a mistake.
      "@typescript-eslint/await-thenable": "off",
      // page-side evaluation returns untyped values by design (`ev<T>` is the typed seam).
      "@typescript-eslint/no-unsafe-assignment": "off",
      "@typescript-eslint/no-unsafe-member-access": "off",
      "@typescript-eslint/no-unsafe-call": "off",
      "@typescript-eslint/no-unsafe-return": "off",
      "@typescript-eslint/no-unsafe-argument": "off",
      "@typescript-eslint/require-await": "off",
    },
  },
  // e2e/run.mjs: plain Node ESM, JS recommended rules + Node globals, no type information.
  {
    files: ["e2e/**/*.mjs"],
    languageOptions: { ecmaVersion: "latest", sourceType: "module", globals: { ...globals.node } },
    rules: { ...js.configs.recommended.rules, ...noObsidianRules, "import/no-nodejs-modules": "off" },
  },
]);
