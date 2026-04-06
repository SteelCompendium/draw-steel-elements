# Conventions

## File and Directory Naming

- **Directories:** PascalCase for feature modules (`Features/`, `StaminaBar/`, `Counter/`), camelCase for some (`featureblock/`, `negotiation/`, `statblock/`)
- **TypeScript files:** PascalCase for classes and components (`FeatureProcessor.ts`, `StaminaBarView.ts`), camelCase for non-class modules (`common.ts`, `initiativeProcessor.ts`)
- **Vue files:** PascalCase (`HorizontalRule.vue`, `StaminaBar.vue`, `CollapsibleHeading.vue`)
- **Schema files:** PascalCase with `Schema` suffix (`ComponentWrapperSchema.yaml`, `SkillsSchema.yaml`)

## Code Style

- **Formatter:** None configured (no Prettier)
- **Linter:** ESLint with `@typescript-eslint`
- **Config:** `.eslintrc` (JSON format)
- **Key rules:**
  - No unused variables (error, but unused function args allowed)
  - `@ts-comment` directives allowed
  - Empty functions allowed
  - No prototype builtins check disabled

- **EditorConfig:** `.editorconfig`
  - Indent: 4 spaces
  - Line endings: CRLF
  - Charset: UTF-8
  - Final newline: yes

## TypeScript Configuration

- **Path aliases:** `@/*` -> `src/*`, `@model/*` -> `src/model/*`, `@utils/*` -> `src/utils/*`, `@views/*` -> `src/views/*`, `@drawSteelAdmonition/*`, `@drawSteelComponents/*`
- **Strict null checks:** enabled
- **No implicit any:** enabled
- **Module:** ESNext, target ES6
- **Vue:** `vue-tsc` used for type checking Vue SFCs

## Vue Conventions

- **API:** Composition API only (`__VUE_OPTIONS_API__` set to `false`)
- **Dependency injection:** Obsidian plugin, app, and context provided via Vue's `provide`/`inject`
- **Component props:** Model data passed as props from `genericComponentProcessor`

## Naming Conventions

- **Classes:** PascalCase (`FeatureProcessor`, `ReferenceResolver`, `DrawSteelAdmonitionPlugin`)
- **Interfaces:** PascalCase, descriptive (`DSESettings`, `ValidationResult`, `ValidationError`)
- **Methods:** camelCase (`postProcess`, `resolveReferences`, `downloadAndExtractRelease`)
- **Constants:** UPPER_SNAKE_CASE (`DEFAULT_SETTINGS`)
- **Code block tags:** lowercase with hyphens, `ds-` prefix (`ds-feature`, `ds-stamina-bar`)
- **CSS classes:** lowercase with hyphens, `ds-` prefix (`ds-container`, `ds-multiline`, `ds-vue-wrapper`)

## Commit Messages

Based on observed patterns, commits use short descriptive sentences without conventional commit prefixes:

```
Removes legacy link
Initial pass on splitting up css
Corrects issue where double-clicking on an Element in reading mode will open edit mode
Checkpoint: basic functionality for initiative tracker
Featureblocks are feature complete
```

Release commits follow the pattern: `Prepares for release '<version>'`
