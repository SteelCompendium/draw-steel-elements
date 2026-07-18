// Community-submission compliance linting (SC-11). Additive to the existing
// legacy .eslintrc (which ESLint v9 ignores by default in flat-config mode);
// scoped to plugin source only — visual harness, demo vault, and generated
// output are excluded.
import tsparser from "@typescript-eslint/parser";
import { defineConfig } from "eslint/config";
import obsidianmd from "eslint-plugin-obsidianmd";

export default defineConfig([
  {
    ignores: [
      "main.js",
      "node_modules/**",
      "visual-harness/**",
      "demo-vault/**",
      "docs/**",
      "test/**",
      "*.config.mjs",
      "esbuild.config.mjs",
    ],
  },
  ...obsidianmd.configs.recommended,
  {
    files: ["**/*.ts"],
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
]);
