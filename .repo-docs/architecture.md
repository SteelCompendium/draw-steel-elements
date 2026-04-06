# Architecture

## System Overview

The plugin follows a processor-based architecture where each Draw Steel element type has a dedicated processor that parses YAML input and renders DOM output. Vue 3 components handle interactive elements; plain TypeScript DOM manipulation handles simpler ones.

```
┌─────────────────────────────────────────────────────────┐
│                    Obsidian App                          │
│                                                         │
│  ┌──────────────┐    ┌───────────────────────────────┐  │
│  │  Markdown     │    │  Draw Steel Elements Plugin    │  │
│  │  Note with    │───>│                               │  │
│  │  ```ds-*      │    │  main.ts (Plugin entry)       │  │
│  │  blocks       │    │    │                           │  │
│  └──────────────┘    │    ▼                           │  │
│                      │  RegisterElements.ts            │  │
│                      │    │                           │  │
│                      │    ├── FeatureProcessor         │  │
│                      │    ├── StatblockProcessor       │  │
│                      │    ├── InitiativeProcessor      │  │
│                      │    ├── NegotiationProcessor     │  │
│                      │    ├── genericComponentProcessor │  │
│                      │    │   ├── HorizontalRule.vue   │  │
│                      │    │   ├── SkillList.vue        │  │
│                      │    │   └── StaminaBar.vue       │  │
│                      │    ├── CounterProcessor         │  │
│                      │    ├── CharacteristicsProcessor │  │
│                      │    ├── FeatureblockProcessor    │  │
│                      │    └── ValuesRowProcessor       │  │
│                      │                               │  │
│                      │  Utils:                        │  │
│                      │    ├── ReferenceResolver        │  │
│                      │    ├── JsonSchemaValidator      │  │
│                      │    └── CompendiumDownloader     │  │
│                      └───────────────────────────────┘  │
└─────────────────────────────────────────────────────────┘
```

## Components

### Plugin Entry (`main.ts`)

- **Responsibility:** Loads settings, initializes schema registry, registers code block processors, adds compendium download command.
- **Depends on:** `RegisterElements`, `JsonSchemaValidator`, `Settings`, `CompendiumDownloader`
- **Depended on by:** Obsidian app (plugin lifecycle)

### Element Registration (`src/utils/RegisterElements.ts`)

- **Responsibility:** Maps code block language tags (e.g., `ds-ft`, `ds-feature`) to their processors. Each element type gets multiple aliases.
- **Depends on:** All processor classes, Vue components, model classes
- **Depended on by:** `main.ts`

### Processors (`src/drawSteelAdmonition/`)

Each element type has a processor with this pattern:

| Processor | Directory | Rendering approach |
|-----------|-----------|-------------------|
| FeatureProcessor | `Features/` | DOM manipulation via View classes |
| FeatureblockProcessor | `featureblock/` | DOM manipulation via View classes |
| StatblockProcessor | `statblock/` | DOM manipulation via View classes |
| InitiativeProcessor | `initiativeProcessor.ts` | DOM manipulation with interactive state |
| NegotiationTrackerProcessor | `negotiation/` | DOM manipulation with interactive state |
| CounterProcessor | `Counter/` | DOM manipulation |
| CharacteristicsProcessor | `Characteristics/` | DOM manipulation |
| ValuesRowProcessor | `ValuesRow/` | DOM manipulation |
| genericComponentProcessor | `(utils/)` | Vue 3 component mounting |

Two rendering strategies exist:
1. **DOM-based processors**: Parse YAML, create HTML elements via Obsidian's `createEl` API. Used for most elements.
2. **Vue-based processors**: Use `genericComponentProcessor` which mounts a Vue 3 app into the code block container. Used for SkillList, StaminaBar, HorizontalRule.

### Vue Components (`src/drawSteelComponents/`)

- **Responsibility:** Interactive UI components rendered via Vue 3 Composition API.
- **Pattern:** Receive parsed model data as props, use Obsidian plugin/app/context via Vue's `provide`/`inject`.
- **Key components:** `StaminaBar.vue` (health tracking with edit modal), `SkillList.vue` (collapsible skill groups), `HorizontalRule.vue` (styled divider).

### Models (`src/model/`)

- **Responsibility:** Define TypeScript types and provide `parseYaml(source)` static methods that convert raw YAML strings into typed objects.
- **Pattern:** Each model class has a static `parseYaml()` method using Obsidian's `parseYaml` function. Some models use the SDK (`steel-compendium-sdk`) for parsing.
- **Schemas:** `src/model/schemas/` contains YAML-format JSON Schemas validated by AJV at runtime.

### Utilities (`src/utils/`)

| Utility | Purpose |
|---------|---------|
| `ComponentProcessor.ts` | Generic Vue component mounting into Obsidian code blocks |
| `ReferenceResolver.ts` | Resolves `@path` and `[[wikilink]]` references to content in other vault notes |
| `JsonSchemaValidator.ts` | AJV-based validation with YAML schema support, singleton registry pattern |
| `CompendiumDownloader.ts` | Downloads and extracts GitHub release zips into the Obsidian vault |
| `RegisterElements.ts` | Code block processor registration |
| `Conditions.ts` | Draw Steel condition definitions |
| `SkillsData.ts` | Draw Steel skill definitions |
| `Images.ts` | Image handling utilities |
| `CodeBlocks.ts` | Code block parsing helpers |
| `ModalProcessor.ts` | Modal dialog utilities |
| `common.ts` | Shared utility functions |

### Views (`src/views/`)

- **Responsibility:** Obsidian modal dialogs for interactive elements.
- **Key modals:** `ConditionSelectModal` (pick conditions), `CustomizeConditionModal` (modify condition details), `MinionStaminaPoolModal` (manage minion shared stamina), `StaminaEditModal` (edit stamina values), `ResetEncounterModal` (reset initiative tracker), `SettingsTab` (plugin settings UI).

## Data Flow

### Code Block Rendering

```
User writes ```ds-feature YAML``` in a note
        │
        ▼
Obsidian detects registered language tag
        │
        ▼
FeatureProcessor.handler(source, el, ctx) called
        │
        ▼
YAML source parsed (Obsidian parseYaml or model.parseYaml)
        │
        ├── If references found (@path / [[link]])
        │   └── ReferenceResolver fetches content from other notes
        │
        ▼
Optional: Schema validation (AJV)
        │
        ▼
DOM elements created and appended to container (el)
   OR Vue app mounted into container
        │
        ▼
Rendered element visible in Reading mode
```

### Compendium Download

```
User triggers "Download Compendium" command
        │
        ▼
CompendiumDownloader fetches GitHub release API
        │
        ▼
Downloads repo.zip asset
        │
        ▼
Deletes existing compendium directory
        │
        ▼
Extracts zip contents into vault (batch of 20 files)
```

## Key Design Decisions

| Decision | Rationale |
|----------|-----------|
| Two rendering strategies (DOM + Vue) | Vue was introduced gradually (v3.3.0). Simpler elements use direct DOM; interactive elements with state use Vue. Migration is ongoing. |
| Multiple code block aliases per element | Convenience for users: `ds-ft`, `ds-feat`, `ds-feature` all work. Short aliases for frequent use, full names for readability. |
| esbuild with Vue plugin | Fast builds. Vue SFC compilation via `unplugin-vue/esbuild`. YAML loaded as raw strings via custom loader plugin. |
| Singleton AJV schema registry | Schemas registered once at plugin load, reused across validations. Fresh instances created per validation to avoid compiled schema conflicts. |
| Reading mode only | Obsidian's Live Preview mode uses CodeMirror 6 with a different rendering pipeline. Supporting it requires significant additional work. |
| SDK as devDependency | `steel-compendium-sdk` is bundled at build time by esbuild, not needed at runtime as a separate package. |

## Dependencies

| Package | Why |
|---------|-----|
| `vue` (3.x) | Composition API components for interactive elements |
| `ajv` / `ajv-errors` / `ajv-keywords` | Runtime YAML schema validation for element inputs |
| `obsidian` (dev) | Obsidian Plugin API types and runtime APIs |
| `steel-compendium-sdk` (dev) | Draw Steel data model parsing (bundled at build time) |
| `esbuild` (dev) | Fast bundler producing `main.js` |
| `unplugin-vue` (dev) | Vue SFC compilation for esbuild |
| `vue-tsc` (dev) | Vue-aware TypeScript type checking |
| `jszip` / `jszip-utils` (dev) | Zip extraction for compendium downloads (bundled) |
| `jest` / `ts-jest` (dev) | Test framework (configured but no tests yet) |

## Extension Points

- **Adding a new element type:**
  1. Create a processor class in `src/drawSteelAdmonition/<ElementName>/`
  2. Create a model in `src/model/` with a `parseYaml()` method
  3. Register code block languages in `src/utils/RegisterElements.ts`
  4. Add CSS in `styles-source.css`
  5. Add docs in `docs/`

- **Adding a Vue-based element:** Use `genericComponentProcessor` with your Vue component and model class. See `SkillList` or `StaminaBar` for examples.

- **Adding a schema:** Create a YAML schema in `src/model/schemas/`, register it in `main.ts` `initializeSchemas()`.

## Constraints

- Must work in Obsidian's sandboxed plugin environment (no direct filesystem access, use Vault API).
- Output must be CJS format (`format: "cjs"`) for Obsidian compatibility.
- Target ES2018 for broad Obsidian version support.
- `obsidian`, `electron`, and CodeMirror packages are external (provided by the host app).
