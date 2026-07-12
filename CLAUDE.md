# Draw Steel Elements

Obsidian plugin that renders Draw Steel TTRPG content as interactive, styled elements.
Users write YAML in `ds-*` fenced code blocks and the plugin renders ability cards,
statblocks, initiative trackers, negotiation trackers, stamina bars, and more.

## Repository Documentation

This repo uses standardized `.repo-docs/` documentation. **Read `.repo-docs/index.md`
first** -- it contains the reading guide, role-based routing, and links to all other docs.

## Quick Start

- `npm i` -- install dependencies
- `npm run dev` -- build with watch mode
- `npm run build` -- production build (type check + minified)
- `npm test` -- run tests (Jest: `unit` node project + `dom` jsdom project; `npx jest --selectProjects unit|dom` to run one)

## Visual harness (see it rendered)

`npm run shots` renders every element through the real pipeline in Chromium and writes
PNGs to `visual-harness/shots/` (`<element>--<theme>-<bg>.png` + galleries) — agents can
read these to see the plugin. Narrow with `--element=/--theme=`. `npm run shot-url -- <url>
<out.png>` screenshots any URL. Details: `visual-harness/README.md`. Fidelity is
close-enough (vendored default-theme vars) — final QA is real Obsidian. `npm run
obsidian-shots` produces ground-truth PNGs from a real spawned Obsidian
(`<element>--obsidian-<theme>-<bg>.png`) — slower; use it for sign-off, the browser harness
for iteration.

## Key Architecture

- **One rendering strategy: Element Framework v2** (`src/framework/` —
  `ElementRegistry` + `ElementPipeline` + `ElementView`, declared elements in
  `src/elements/`). ALL 12 elements live on the framework (11 migrated + `ds-roll`, new
  in D5); every legacy processor is retired
  (`src/drawSteelAdmonition/` holds only `EncounterData` + negotiation sub-views the
  framework reuses). Framework v2 replaced Vue 3 (2026-04-06 revert decision, executed
  by D1) — see `.repo-docs/architecture.md` for the full picture.
- **Legacy processor pattern**: Each not-yet-migrated `ds-*` element has a processor in
  `src/drawSteelAdmonition/`, registered in `src/utils/RegisterElements.ts`
- **Framework v2 element pattern**: each migrated `ds-*` element has a
  `src/elements/<name>/definition.ts` (`ElementDefinition`) + `view.ts` (`ElementView`
  subclass), registered in `main.ts`'s `registerFrameworkElementDefinitions()`
- **Models**: `src/model/` with `parseYaml()` static methods and AJV schema validation —
  shared by both strategies
- **SDK**: `steel-compendium-sdk` bundled at build time for data model parsing
- **Preferences (D4)**: descriptor-driven — `src/prefs/catalog.ts` owns the `DsePrefs`
  augmentation, the `PrefDescriptor` list (attrs = the `data-dse-*` vocabulary CSS reflows
  on), and the statblock presets; storage is a SPARSE `prefs` slice on `DSESettings`
  (debounced `saveData`, `main.ts createSaveDataPrefsStorage`). The settings tab
  (`src/views/SettingsTab.ts`) renders FROM the descriptors — adding a pref = adding a
  descriptor. Per-block `prefs:` YAML overrides: `src/framework/prefOverrides.ts`.
  Defaults must always reproduce the current look (legacy-fidelity bar).
- **Rolling (D5)**: `src/framework/roll/` — pure engine (`engine.ts resolveRoll`:
  2d10/tiers/edges/banes/crit, injected `DiceSource`), lenient `parse.ts`, and the
  `RollService` seam (`service.ts`, reached as `cx.roll`; optional Dice Roller plugin
  bridge via `diceBridge.ts`, capability-detected, always falls back to native). The
  feature grammar's roller lives in `src/elements/feature/rollController.ts`, gated by
  the `rollingEnabled` pref (default OFF — defaults render zero roll UI); `ds-roll`
  (`src/elements/roll/`) is the standalone element and always rolls. Results are
  session-only (`SessionStore` `roll.*` slots) — rolling NEVER writes the note.
- **Authoring (D9)**: `src/authoring/` — four generators over the registry (no per-element
  code). `scaffold.ts` builds insert bodies (curated `authoring.example` → else a
  schema-walked stub); `insert.ts` registers one Insert command per element; `suggest.ts`
  is the `/ds` EditorSuggest scaffolder; `schemaSuggest.ts` is key/enum autocomplete inside
  a `ds-*` fence; `FormModal.ts`/`formModel.ts` are the generic schema→form editor (live
  validation via F1's `ValidationService`, live preview via `createView`, Save through
  `BlockHost.replaceSource`), reachable from a reading-mode pencil gated by the default-OFF
  `authoringControls` pref. The `ElementDefinition.authoring` slot (`registry.ts`) carries
  `example`/`sdkModel`/`fields`; each element's `example.yaml` is the SINGLE source shared
  by the palette AND the visual-harness fixture. Deferred: the SDK-reader text importer (F2)
  and the CM6 squiggle linter (§5.2).

## Important Constraints

- **Reading mode only** -- no Live Preview support
- Output must be CJS format for Obsidian
- Target ES2018
- `obsidian`, `electron`, and CodeMirror packages are external (host-provided)
- Compendium downloader deletes the destination directory before extracting -- don't store homebrew there
