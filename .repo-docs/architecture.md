# Architecture

## System Overview

The plugin follows a processor-based architecture where each Draw Steel element type has
a dedicated processor (or, for migrated elements, an `ElementDefinition`) that parses
YAML input and renders DOM output. Two rendering strategies coexist: **Element Framework
v2** (`src/framework/`) handles migrated elements via a declarative
registry/pipeline/view model; plain TypeScript DOM manipulation (`src/drawSteelAdmonition/`)
handles the rest via hand-rolled processors. Vue 3 was adopted (2025-08-22) and later
removed (2026-04-06, see `decisions/2026-04-06-revert-vue-3-adoption.md`) — Framework v2
is what replaced it, not a return to DOM-only. See "Framework v2 (`src/framework/`)"
below for the coexistence model.

```
┌──────────────────────────────────────────────────────────────────────────┐
│                            Obsidian App                                  │
│                                                                          │
│  ┌──────────────┐    ┌──────────────────────────────────────────────┐  │
│  │  Markdown     │    │  Draw Steel Elements Plugin                    │  │
│  │  Note with    │───>│                                               │  │
│  │  ```ds-*      │    │  main.ts (Plugin entry, onload)               │  │
│  │  blocks       │    │    │                                          │  │
│  └──────────────┘    │    ├── registerElements(this)  [legacy path]   │  │
│                      │    │     │                                     │  │
│                      │    │     ├── FeatureProcessor                  │  │
│                      │    │     ├── FeatureblockProcessor             │  │
│                      │    │     ├── StatblockProcessor                │  │
│                      │    │     ├── InitiativeProcessor                │  │
│                      │    │     ├── CounterProcessor                  │  │
│                      │    │     ├── CharacteristicsProcessor           │  │
│                      │    │     └── ValuesRowProcessor                │  │
│                      │    │                                          │  │
│                      │    ├── initializeElementFrameworkV2(...)       │  │
│                      │    │     [framework/: registry + pipeline +    │  │
│                      │    │      theme/prefs/refs/validation/session] │  │
│                      │    ├── registerFrameworkElementDefinitions(..) │  │
│                      │    │     ├── horizontal-rule (elements/)       │  │
│                      │    │     ├── skills (elements/)                │  │
│                      │    │     ├── stamina-bar (elements/)           │  │
│                      │    │     └── negotiation (elements/)           │  │
│                      │    └── registerFrameworkElements(this, fw)     │  │
│                      │          [wiring loop, F1 §2.3]                │  │
│                      │                                               │  │
│                      │  Utils:                                       │  │
│                      │    ├── ReferenceResolver   (legacy)            │  │
│                      │    ├── JsonSchemaValidator (legacy, singleton) │  │
│                      │    └── CompendiumDownloader                    │  │
│                      └──────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────────────┘
```

## Components

### Plugin Entry (`main.ts`)

- **Responsibility:** Loads settings, initializes the legacy schema registry, calls
  `registerElements(this)` (legacy path), constructs the Framework v2 service bundle
  (`initializeElementFrameworkV2`), populates its registry
  (`registerFrameworkElementDefinitions`), wires framework elements into Obsidian
  (`registerFrameworkElements`), and adds the compendium download command. Drops the
  framework bundle and clears `SessionStore` in `onunload`.
- **Depends on:** `RegisterElements`, `JsonSchemaValidator`, `Settings`,
  `CompendiumDownloader`, `src/framework/*` (registry, pipeline, session, validation,
  seams), `src/elements/*` (migrated element definitions)
- **Depended on by:** Obsidian app (plugin lifecycle)

### Legacy Element Registration (`src/utils/RegisterElements.ts`)

- **Responsibility:** Maps code block language tags (e.g., `ds-ft`, `ds-feature`) to
  their legacy processors. Each element type gets multiple aliases. Owns every element
  **not yet migrated** onto Framework v2 — as an element migrates, its
  `registerMarkdownCodeBlockProcessor` call is deleted here (left as a code comment
  pointing at the framework registration) and the alias moves to
  `src/elements/<name>/definition.ts` instead.
- **Depends on:** All legacy processor classes, model classes
- **Depended on by:** `main.ts`

### Legacy Processors (`src/drawSteelAdmonition/`)

Each not-yet-migrated element type has a processor with this pattern — parse YAML,
create HTML elements via Obsidian's `createEl` API, manage any interactive state
directly in the processor/View class:

| Processor | Directory | Aliases |
|-----------|-----------|---------|
| FeatureProcessor | `Features/` | `ds-ft`, `ds-feat`, `ds-feature` |
| FeatureblockProcessor | `featureblock/` | `ds-fb`, `ds-featureblock` |
| StatblockProcessor | `statblock/` | `ds-sb`, `ds-statblock` |
| InitiativeProcessor | `initiativeProcessor.ts` | `ds-it`, `ds-init`, `ds-initiative`, `ds-initiative-tracker` |
| CounterProcessor | `Counter/` | `ds-ct`, `ds-counter` |
| CharacteristicsProcessor | `Characteristics/` | `ds-char`, `ds-characteristics` |
| ValuesRowProcessor | `ValuesRow/` | `ds-vr`, `ds-value-row`, `ds-values-row` |

These 7 element families are the "legacy" side of the coexistence model. (The
`negotiation/` directory still exists, but only its four sub-views remain — its
processor migrated onto Framework v2 in Plan 05; see Migrated Elements below.) They may
migrate onto Framework v2 in future work; nothing in this list is Framework-v2-only or
Vue-based today.

### Framework v2 (`src/framework/`)

Element Framework v2 replaces Vue's role (declarative components, structured lifecycle,
one error boundary) with a small, Obsidian-decoupled-where-possible layer purpose-built
for this plugin. Element authors declare an `ElementDefinition`; the framework handles
everything else (parsing, validation, ref resolution, mounting, error rendering,
lifecycle cleanup, persistence write-back).

| File | Responsibility |
|------|-----------------|
| `registry.ts` | `ElementRegistry` — pure in-memory `id`/alias → `ElementDefinition` lookup. No Obsidian coupling; unit-testable without a real `Plugin`. Rejects duplicate ids/aliases and `shape: "persisted"` definitions missing `serialize`. |
| `pipeline.ts` | `ElementPipeline` — the render pipeline: parse → validate (AJV) → resolve refs → `createView` → mount, behind **one** error boundary (`renderErrorCard`, four failure stages: `parse`/`schema`/`reference`/`render`). Constructed once per plugin load with the service bundle; `run()` executes once per rendered block instance. |
| `view.ts` | `ElementView<M>` — abstract view lifecycle base (extends Obsidian `Component`). Owns DOM (`rootEl`) and the current model; subclasses implement `onMount` (required) and optionally `onUpdate`. Implements the debounced (~400ms) `persist()` write-behind path for `shape: "persisted"` elements, flushed on unload. Also ships a `HeroPanel<S>` stub (unused in D1; reserved for a later effort). |
| `context.ts` | `RenderContext` — the immutable per-block-instance DTO the pipeline builds and hands to `createView`/views: `app`, `plugin`, `settings`, `host`, `mode`, and the service seams (`theme`, `prefs`, `refs`, `session`, plus the optional `roll` — a real `RollService` since D5, supplied by the pipeline; see "Rolling" below). Frozen at construction. |
| `host/BlockHost.ts` | The `BlockHost` interface — the single seam between a mounted `ElementView` and *where* it lives (`containerEl`, `canPersist`, `replaceSource()`, `addChild()`, `getBlockInfo()`, `blockKey()`). `RenderMode` is `"reading" \| "live-preview" \| "sidebar"`. |
| `host/ReadingModeBlockHost.ts` | The only implemented `BlockHost` (D1 ships reading mode only, matching the standing 2024-08-18 reading-mode-only decision). Fixes two legacy bugs on top of `src/utils/CodeBlocks.ts`'s approach: atomic read-modify-write via `Vault.process` (no lost updates from concurrent edits) and fence-language preservation on write-back (no silent alias-to-canonical rewriting). |
| `host/LivePreviewBlockHost.ts` | Deliberately unimplemented stub — every member throws. Documents the CM6 realization of each `BlockHost` member for a future Live Preview effort; not to be constructed until that effort supersedes the reading-mode-only decision. |
| `seams/theme.ts` | `ThemeService` — stamps `data-dse-theme="<active>"` on every element root, token → CSS var resolution (`cssVar()`). Minimal in D1 (effectively one constant theme); the token/theme value space is a later effort's scope. |
| `seams/prefs.ts` | `PreferenceStore` — a typed preference store (`DsePrefs`, built-in `theme` key only) backed by an injected `PrefsStorage` adapter, with `reflect()` stamping any `attr`-bearing preference as `data-dse-<attr>` on element roots. The preference catalog, settings tab, and per-block overrides are D4's scope — see "Preferences (`src/prefs/`, D4)" below. |
| `seams/refs.ts` | `ReferenceService` — generalizes `src/utils/ReferenceResolver.ts` into a provider chain (`RefProvider`). Ships `at-path` (`@Creatures/Goblin`) and `wikilink` (`[[Thorn Dragon]]`) providers ported verbatim from the legacy resolver, plus a reserved, always-failing `scc`/`scc.vN:` provider placeholder for a future effort to supersede. `resolveDeep()` walks arbitrary parsed YAML. Does **not** replace `ReferenceResolver.ts`, which stays live for legacy elements. |
| `session.ts` | `SessionStore` — plugin-scoped, in-memory, best-effort UI state (e.g. collapse open/closed) keyed by `(blockKey, slot)`. Cleared on plugin `onunload`. Pure — no Obsidian imports. Never used for document state. |
| `validation.ts` | `ValidationService` — a plugin-scoped AJV wrapper (2019 dialect, `ajv-keywords` + `ajv-errors`, ported from `src/utils/JsonSchemaValidator.ts`) that compiles and caches one validator per element id (fixing the legacy validator's recompile-on-every-call cost). One instance per plugin load, dropped on unload — no module-global singleton (unlike the legacy validator, which stays a singleton for its own unmigrated clients). |
| `registerFrameworkElements.ts` | The framework → Obsidian wiring loop: for every `ElementDefinition` currently in the registry, registers one `plugin.registerMarkdownCodeBlockProcessor` per alias, each invoking `pipeline.run(def, source, new ReadingModeBlockHost(...))`. A one-shot pass over `registry.all()` at call time — called once from `main.ts onload`, after the registry is populated. |
| `kit/collapsible.ts`, `kit/componentWrapper.ts` | Small reusable, purely presentational DOM-mounting helpers (vanilla ports of the former `CollapsibleHeading.vue`/`RightArrowToggleIndicator.vue` and `ComponentWrapper.vue`/`ComponentHideIndicator.vue`+`VerticalRule.vue`). No persistence or service coupling; the calling `ElementView` owns state and lifecycle-binds listeners via `owner.registerDomEvent`. |

**Coexistence model:** `main.ts onload` calls the legacy `registerElements(this)` and the
framework wiring (`registerFrameworkElementDefinitions` + `registerFrameworkElements`)
back to back. Obsidian's markdown code-block processor registry is owned by both paths
at once, one alias at a time — an element belongs to exactly one path (never both), and
which path owns it is a one-line decision recorded at the call site (a live
`registerMarkdownCodeBlockProcessor` call in `RegisterElements.ts`, or a
`registry.register(...)` line in `registerFrameworkElementDefinitions`). This is the
incremental migration switch F1 designed for: elements move off `RegisterElements.ts`
one at a time as they migrate, with no big-bang rewrite and no window where both paths
fight over the same alias.

### Migrated Elements (`src/elements/`)

The elements migrated onto Framework v2 so far (Horizontal Rule → Skills → Stamina Bar
in D1, simplest-to-most-complex by `ElementShape`; Negotiation Tracker in Plan 05):

| Element | Directory | `shape` | Aliases | Notes |
|---------|-----------|---------|---------|-------|
| Horizontal Rule | `horizontal-rule/` | `static` | `ds-hr`, `ds-horizontal-rule` | No model (`parse` returns `undefined`); `onMount` reuses the legacy `HorizontalRuleProcessor.build()` DOM builder verbatim (that builder also stays live for Statblock/Featureblock, which embed it directly — not yet migrated). `noClickShield: true` matches the legacy Vue element's behavior. |
| Skills | `skills/` | `interactive` | `ds-skills` | First interactive element: per-group and whole-element collapse state lives in `SessionStore`, never written back to the note (no `serialize`, matching the legacy Vue element). `model.ts` wraps `@model/Skills` verbatim. |
| Stamina Bar | `stamina-bar/` | `persisted` | `ds-stam`, `ds-stamina`, `ds-stamina-bar` | First (and only, in D1) persisted element: edits write back via `ElementView.persist()` → `serialize()` → `host.replaceSource()`. `serialize()` reuses `@model/StaminaBar`'s own field/order shape (`stringifyYaml(model).trim()`) to stay byte-compatible with the legacy write path. Was the last Vue element — its migration unblocked Vue removal (D1 Task 4). |
| Negotiation Tracker | `negotiation/` | `persisted` | `ds-nt`, `ds-negotiation`, `ds-negotiation-tracker` | Plan 05 (F1 §6 step 8): `NegotiationView` re-expresses the deleted `NegotiationTrackerProcessor`'s orchestration and REUSES the four sub-views still under `src/drawSteelAdmonition/negotiation/`, which now take an injected `persist: () => void` instead of calling `CodeBlocks.updateNegotiationTracker`. No schema (the legacy element never had one). Active tab is `SessionStore` state; rendering never writes (the legacy processor persisted during render — deliberately dropped). |

Each element directory follows the same shape: `definition.ts` (the `ElementDefinition`,
registered in `main.ts`'s `registerFrameworkElementDefinitions`), `view.ts` (the
`ElementView` subclass), and — for Skills/Stamina Bar — `model.ts` (a thin `parse`/
`serialize` wrapper around the pre-existing `@model/*` class, kept renderer-agnostic so
the same model classes still back the legacy validator/schemas).

### Preferences (`src/prefs/`, D4)

Descriptor-driven: one `PrefDescriptor` list drives storage, CSS reflection, the
settings tab, and per-block overrides — adding a pref means adding a descriptor, not
hand-wiring four call sites.

- **Catalog** (`src/prefs/catalog.ts`): owns the `DsePrefs` module-augmentation (F1's
  `seams/prefs.ts` ships only the built-in `theme` key), `DSE_PREF_DESCRIPTORS`, the
  finalized `PrefUi` shape (group/label/help/control/options — F1 left `ui` `unknown`),
  and the statblock preset bundles (`SB_PRESETS`; `deriveSbPreset` re-derives "Custom"
  the moment any one member diverges — a preset is never itself stored). Defaults
  reproduce today's look byte-for-byte (`catalog.test.ts` guards it).
- **Storage chain**: `DsePreferenceStore` (`seams/prefs.ts`) holds live values and calls
  out to an injected `PrefsStorage` adapter. Production's adapter
  (`main.ts createSaveDataPrefsStorage`) mirrors the snapshot onto `plugin.settings.prefs`
  synchronously, then debounces the `saveData` disk write 250ms (`flush()` forces it on
  unload). The snapshot is **sparse** — only values differing from their descriptor
  default are written (`DSESettings.prefs: Partial<DsePrefs>`) — so new prefs and default
  changes are migration-free. `DSESettings.settingsVersion` (currently 1) is reserved for
  future *structural* changes only, via `migrateSettings()`.
- **Reflection**: `reflect(root, owner)` stamps every `attr`-bearing descriptor as
  `data-dse-<attr>="<value>"` and keeps it live. The pipeline (`framework/pipeline.ts`)
  calls it once per block, after `def.createView()` and before `view.mount()`. `theme` is
  deliberately attr-less in the catalog: `ThemeService.apply()` is the sole writer of
  `data-dse-theme` (D3 §7.1); double-stamping here would race.
- **Settings tab** (`src/views/SettingsTab.ts`): groups descriptors by `PrefUi.group` in
  `GROUP_ORDER` and renders one `Setting` row per descriptor — no per-pref branching.
  `onChange` calls `prefs.set()` directly (no Apply button): `set()` notifies `reflect()`'s
  subscribers synchronously, so open elements reflow live behind the dialog. Per-group and
  whole-tab reset actions write descriptor defaults (sparse storage then drops them). The
  Statblock display group also renders the preset dropdown and a live preview
  (`SettingsPreview.ts`), both wholly derived, never persisted.
- **Per-block `prefs:` overrides** (`framework/prefOverrides.ts`): a reserved `prefs:`
  map, presentation keys only. `extractPrefOverrides` pops it off the parsed YAML BEFORE
  schema validation and `def.parse`; unknown or behavioral keys (no `attr` — those use the
  block's own `collapsible:`/`collapse_default:`, see `resolveCollapsePrefs`) are dropped
  with a `console.warn`, not an error card. `applyPrefOverrides` pins the override AFTER
  `reflect()` runs, so it wins on any later global change (listener-order precedence, no
  F1 signature change). For `shape: "persisted"` elements, `withPrefOverrides` wraps
  `def.serialize` to re-emit the `prefs:` map on every write-back — content-preserving but
  re-stringified (key order/values intact, formatting may normalize); blocks with no
  `prefs:` map are untouched.
- **Deliberate deferrals** (cataloged, not built): `sbChars`/`sbVillain`/`sbStickyMeta`
  (need D2-level statblock DOM changes); `cardStyle` (needs a designed compact card
  treatment); D3-aware filtering of the theme option list. Rationale + open-decisions
  table: workspace repo `docs/superpowers/dse-overhaul/D4-preferences-spec.md`.

### Rolling (`src/framework/roll/`, D5)

Interactive Draw Steel dice rolling, split pure-engine / service on purpose:

- **Engine** (`engine.ts` `resolveRoll` + `types.ts`, `parse.ts`): pure and total — no
  Obsidian, no DOM, no `Math.random` (dice come from an injected `DiceSource`). This is
  the ONE module where tier/crit/edge-bane resolution happens; D7/D8 import it rather
  than re-derive the math. Edges/banes cap each side at 2 FIRST, then cancel (rulebook
  "Rolling With Edges and Banes"); natural 19–20 is always tier 3; crits require
  power-roll mode + a main action. `parse.ts parseRollExpression` maps the ability
  YAML's free-text `roll:` strings to a partial roll shape, leniently (garbage ⇒ bare
  power roll), as a pure module export — not a service method.
- **Service** (`service.ts` `RollService`, the `cx.roll` seam): owns the RNG source and
  delegation. An optional field on `RenderContext`, supplied by the pipeline
  (`main.ts` constructs it after prefs); views null-check it and degrade to a static
  card. `roll()` uses native `Math.random` d10s, or — when the `rollerEngine` pref is
  `dice-roller` — the Dice Roller community-plugin bridge (`diceBridge.ts`):
  capability-detected over `app.plugins` per roll (never version-detected, no import,
  no dependency), per-die `1dN` formulas so the faces stay exact, and null/throw on ANY
  failure falls back to native — the bridge can never break rolling. The bridge only
  supplies faces; they replay into `resolveRoll`, so the math ownership rule holds.
- **Pref gates** (`src/prefs/catalog.ts`, "Rolling" group): `rollingEnabled` (master,
  default `false` — defaults render zero roll UI on ability cards), `rollClickToRoll`
  (default `true`, click a tier row to roll; moot until the master is on), and
  `rollerEngine` (`native` default / `dice-roller`). The `ds-roll` element ignores
  `rollingEnabled`: authoring the block is its own opt-in.
- **UI composition** (`kit/rollBar.ts`, `kit/rollResultCard.ts`,
  `kit/powerRollPanel.ts`; `src/elements/feature/rollController.ts` for the shared
  feature grammar, `src/elements/roll/` for the standalone element): the panel's
  roll-result highlight is a separate `data-dse-roll-result="active|dimmed"` attribute
  channel, deliberately disjoint from Negotiation's selectable rows (`role="radio"` +
  `aria-checked`) — roll highlighting never touches selection semantics, so it works on
  static panels.
- **State**: session-only. Callers (not the service) write `SessionStore` slots
  `roll.lastInput.<n>` / `roll.history.<n>` (`<n>` = per-block rolling-effect ordinal;
  history capped at the last 10 results), keyed by `blockKey` — best-effort, so key
  drift after note edits just means a cold bar. Rolling NEVER writes the note;
  read-only hosts roll fine.
- **Deliberate deferrals**: a history popover UI (recording already ships), note-pin
  persistence for `ds-roll`, two-sided opposed-roll compare, and D7 wiring of the live
  `CharacteristicProvider` hook (`binding.ts`) to a real hero. Spec + open-decision
  rationale: workspace repo `docs/superpowers/dse-overhaul/D5-rolling-interactivity-spec.md`.

### Authoring (`src/authoring/`, D9)

Four generators over the registry, no per-element code: register an `ElementDefinition` and
authoring support (insert command, `/ds` scaffold, in-fence autocomplete, form editor) comes
free, derived from `def.schema`/`def.authoring`.

- **`authoring` contract** (`framework/registry.ts`): the one additive touch D9 makes to F1's
  `ElementDefinition` — an optional `AuthoringHint` (`example`/`sdkModel`/`fields`). Absence
  changes nothing (every tool falls back to the schema); presence enriches (a curated starter
  body, the SDK model the deferred text importer would route to, per-field form UI overrides).
- **Insert commands** (`insert.ts`) and **`/ds`** (`suggest.ts`, an `EditorSuggest`): both build
  their scaffold via `scaffold.ts` (`buildScaffold` — curated `authoring.example` else a
  schema-walked stub, cursor at the first body character) and only ever `replaceSelection`/
  `replaceRange` over the trigger token — INSERT ONLY, never a range-replace over existing
  content. `/ds` suppresses itself inside any already-open fence (`fenceScan.ts`'s top-down
  scan, shared with the in-fence suggester below) so accepting it can never corrupt a block
  the cursor happens to be inside.
- **In-fence autocomplete** (`schemaSuggest.ts`): key/enum completion inside an open `ds-*`
  fence only, top-level keys only (an indented line suppresses suggestion, never resolves
  against the wrong scope). Schema shapes (`allOf`/`$ref` resolved against the same
  `FRAMEWORK_V2_DEPENDENCY_SCHEMAS` AJV registers) come from `schemaShape.ts`'s
  `shapeFromSchemaYaml` — the SAME resolver `formModel.ts` uses for form fields, so the two
  never drift.
- **Form editor** (`FormModal.ts`/`formModel.ts`): one modal for every element — schema fields
  render as `Setting` controls (schemaless, or a complex array/object/`$ref` field, falls back
  to a raw-YAML textarea), reachable from a reading-mode pencil the pipeline stamps only when
  `cx.host.canPersist` AND the `authoringControls` pref (default OFF) is on.
  `ValidationService` is passed to the modal explicitly as a constructor argument — NOT read
  off `cx`, which carries no validation seam. Save hard-fails closed (disabled while the
  working data is invalid, OD-6) and writes through `host.replaceSource` — the SAME path
  persisted elements use, no parallel writer. The live preview mounts through a
  `canPersist: false` host stamped `data-dse-readonly`; a reserved `prefs:` override map is
  popped before validation/preview and re-emitted on Save via the pipeline's own
  `withPrefOverrides` wrapper.
- **`example.yaml`** (`src/elements/<id>/example.yaml`): one YAML body per element is the
  SINGLE source for the curated `authoring.example` scaffold, the F4 visual-harness fixture
  (`visual-harness/entry.ts`), and the F5 Obsidian-camera notes (`visual-harness/notes-gen.mjs`
  reads it straight off disk) — no second hand-maintained fixture. Validity-gated by
  `test/dom/visual-harness/fixtures.test.ts`, which mounts every fixture through the real
  pipeline and asserts no error card.
- **Deliberate deferrals**: the SDK-reader text importer (blocked on F2 — the pinned SDK lacks
  the reader/writer types it needs; `authoring.sdkModel` is declared now so it's purely
  additive once F2 bumps the SDK) and the CM6 inline-validation squiggle linter (§5.2 — a
  bigger, riskier CM6 surface than the `EditorSuggest`-based tools above). Spec + open-decision
  rationale: workspace repo `docs/superpowers/dse-overhaul/D9-authoring-ux-spec.md`.

### Models (`src/model/`)

- **Responsibility:** Define TypeScript types and provide `parseYaml(source)` static
  methods that convert raw YAML strings into typed objects. Shared by both rendering
  strategies — Framework v2 elements' `model.ts` wrappers call into the same classes the
  legacy processors use directly.
- **Pattern:** Each model class has a static `parseYaml()` method using Obsidian's
  `parseYaml` function. Some models use the SDK (`steel-compendium-sdk`) for parsing.
- **Schemas:** `src/model/schemas/` contains YAML-format JSON Schemas. Legacy elements
  validate via the `JsonSchemaValidator.ts` singleton; Framework v2 elements validate via
  `framework/validation.ts`'s `ValidationService`. Both load the same schema files and
  both register the shared `component-wrapper` dependency schema independently (once
  each, at plugin load).

### Utilities (`src/utils/`)

| Utility | Purpose |
|---------|---------|
| `ReferenceResolver.ts` | Resolves `@path` and `[[wikilink]]` references to content in other vault notes. Legacy-only — stays live until every element that uses it migrates; Framework v2 elements use `framework/seams/refs.ts` instead. |
| `JsonSchemaValidator.ts` | AJV-based validation with YAML schema support, singleton registry pattern. Legacy-only. |
| `CompendiumDownloader.ts` | Downloads and extracts GitHub release zips into the Obsidian vault. |
| `RegisterElements.ts` | Legacy code block processor registration (see above). |
| `Conditions.ts` | Draw Steel condition definitions. |
| `SkillsData.ts` | Draw Steel skill definitions. |
| `Images.ts` | Image handling utilities. |
| `CodeBlocks.ts` | Legacy code-block read/write helpers (`Vault.read`/`Vault.modify`-based). Superseded for migrated elements by `framework/host/ReadingModeBlockHost.ts`'s atomic `Vault.process`-based `replaceSource()`; stays live for legacy elements. |
| `ModalProcessor.ts` | Modal dialog utilities. |
| `common.ts` | Shared utility functions. |

### Views (`src/views/`)

- **Responsibility:** Obsidian modal dialogs for interactive elements.
- **Key modals:** `ConditionSelectModal` (pick conditions), `CustomizeConditionModal`
  (modify condition details), `MinionStaminaPoolModal` (manage minion shared stamina),
  `StaminaEditModal` (edit stamina values), `ResetEncounterModal` (reset initiative
  tracker), `SettingsTab` (plugin settings UI).

## Data Flow

### Code Block Rendering — legacy path

```
User writes ```ds-feature YAML``` in a note
        │
        ▼
Obsidian detects registered language tag (RegisterElements.ts)
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
Optional: Schema validation (JsonSchemaValidator singleton, AJV)
        │
        ▼
DOM elements created and appended to container (el)
        │
        ▼
Rendered element visible in Reading mode
```

### Code Block Rendering — Framework v2 path

```
User writes ```ds-stam YAML``` in a note
        │
        ▼
Obsidian detects registered language tag (registerFrameworkElements wiring loop)
        │
        ▼
ElementPipeline.run(def, source, new ReadingModeBlockHost(...))
        │
        ├── Step 1: build RenderContext (services + host); stamp
        │           data-dse-element, arm click shield on root
        ├── Step 2: parse    — parseYaml(source)                    ─┐
        ├── Step 3: validate — ValidationService (AJV), if def.schema │ any throw here
        ├── Step 4/5: resolve refs (def.resolveRefs or                │ → renderErrorCard
        │            autoResolveRefs), if declared                    │   (stage-tagged)
        ├── Step 6: def.parse() → model                              ─┘
        ▼
def.createView(cx) → ElementView; theme.apply() + prefs.reflect() stamped on root
        │
        ▼
view.mount(root, model) → subclass onMount() builds DOM
        │
        ▼
Rendered element visible in Reading mode
(shape: "persisted" elements: user edits → view.persist() → serialize(model) →
 host.replaceSource() → debounced ~400ms write-behind to the note)
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
| Two rendering strategies (Framework v2 + legacy DOM) | Framework v2 replaced Vue (2026-04-06 revert) as the strategy for elements needing structured lifecycle/state/persistence; simpler/not-yet-migrated elements stay on hand-rolled DOM processors. Migration is ongoing, alias-by-alias — see "Coexistence model" above. |
| One error boundary per Framework v2 render (`renderErrorCard`) | Replaces six-plus hand-rolled try/catch error `<div>`s in the legacy processors with one visual + copy standard, stage-tagged (`parse`/`schema`/`reference`/`render`). |
| `ReferenceService`/`ValidationService` generalize rather than replace their legacy counterparts | Legacy elements keep using `ReferenceResolver.ts`/`JsonSchemaValidator.ts` untouched until they migrate; Framework v2 elements get purpose-built, plugin-scoped (non-singleton) equivalents. Avoids a risky shared-state rewrite while both strategies coexist. |
| Multiple code block aliases per element | Convenience for users: `ds-ft`, `ds-feat`, `ds-feature` all work. Short aliases for frequent use, full names for readability. |
| esbuild, no framework compilation step | Fast builds. YAML loaded as raw strings via a custom loader plugin; CSS is a single `styles-source.css` import bundled by esbuild and copied to `styles.css` (no per-component style extraction, unlike the removed Vue SFC pipeline). |
| Singleton AJV schema registry (legacy) / per-load `ValidationService` (Framework v2) | Legacy: schemas registered once at plugin load, reused across validations, fresh AJV instances per validation to avoid compiled-schema conflicts. Framework v2: one `ValidationService` per plugin load, compile-and-cache per element id, dropped on unload — no module-global singleton. |
| Reading mode only | Obsidian's Live Preview mode uses CodeMirror 6 with a different rendering pipeline. Supporting it requires significant additional work; `framework/host/LivePreviewBlockHost.ts` documents the seam for a future effort but is an unimplemented stub today. |
| SDK as devDependency | `steel-compendium-sdk` is bundled at build time by esbuild, not needed at runtime as a separate package. |

## Dependencies

| Package | Why |
|---------|-----|
| `ajv` / `ajv-errors` / `ajv-keywords` | Runtime YAML schema validation for element inputs (both the legacy `JsonSchemaValidator` singleton and Framework v2's `ValidationService`). |
| `obsidian` (dev) | Obsidian Plugin API types and runtime APIs |
| `steel-compendium-sdk` (dev) | Draw Steel data model parsing (bundled at build time) |
| `esbuild` (dev) | Fast bundler producing `main.js` |
| `jszip` / `jszip-utils` (dev) | Zip extraction for compendium downloads (bundled) |
| `jest` / `ts-jest` (dev) | Test framework: `unit` (node) and `dom` (jsdom) Jest projects, 308 tests as of D1 |

Vue (`vue`, `@vue/compiler-sfc`, `unplugin-vue`, `vue-tsc`) was removed in D1 (2026-07) —
see `decisions/2026-04-06-revert-vue-3-adoption.md`.

## Extension Points

- **Adding a new legacy (DOM) element type:**
  1. Create a processor class in `src/drawSteelAdmonition/<ElementName>/`
  2. Create a model in `src/model/` with a `parseYaml()` method
  3. Register code block languages in `src/utils/RegisterElements.ts`
  4. Add CSS in `styles-source.css`
  5. Add docs in `docs/`

- **Adding a new Framework v2 element type:**
  1. Create `src/elements/<name>/definition.ts` exporting an `ElementDefinition` (id,
     name, aliases, `shape`, optional `schema`, `parse`, optional `serialize` — required
     when `shape: "persisted"` — and `createView`)
  2. Create `src/elements/<name>/view.ts` with an `ElementView` subclass implementing
     `onMount` (and optionally `onUpdate`)
  3. If reusing an existing `@model/` class, add a thin `src/elements/<name>/model.ts`
     wrapper (`parse`/`serialize`) around it, per the Skills/Stamina Bar pattern
  4. Register the definition in `main.ts`'s `registerFrameworkElementDefinitions()`
  5. Add CSS in `styles-source.css`, scoped under `[data-dse-element="<id>"]`
  6. Add docs in `docs/`

- **Migrating an existing legacy element onto Framework v2:** follow the Framework v2
  steps above, then delete the element's `registerMarkdownCodeBlockProcessor` call(s)
  from `RegisterElements.ts` (leave a comment pointing at the framework registration, per
  the existing Horizontal Rule/Skills/Stamina Bar comments there).

- **Adding a schema:** Create a YAML schema in `src/model/schemas/`, register it in
  `main.ts` `initializeSchemas()` (legacy validator) and/or pass it as a
  `def.schema` (Framework v2 — validated by `ValidationService` automatically).

## Constraints

- Must work in Obsidian's sandboxed plugin environment (no direct filesystem access, use
  Vault API).
- Output must be CJS format (`format: "cjs"`) for Obsidian compatibility.
- Target ES2018 for broad Obsidian version support.
- `obsidian`, `electron`, and CodeMirror packages are external (provided by the host
  app).
