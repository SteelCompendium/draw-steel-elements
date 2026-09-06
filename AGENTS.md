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
for iteration. It also seeds a small real compendium subtree (`demo-vault/DS Compendium/`,
git-ignored, regenerated every run) and captures one extra ground-truth shot
(`by-scc-kit--obsidian-recursion.png`) proving a by-SCC `ds-scc` reference card renders its
real nested `ds-feature` card through Obsidian's own markdown pipeline (D6 Task 11;
`visual-harness/obsidian-camera.mjs`'s "step 3b").

**Docs screenshots are generated too (SC-142): `npm run docs-shots`** regenerates every
image in `README.md` + `docs/**` from `visual-harness/docs-manifest.mjs` (one entry per file
in `docs/Media`) — element cards via the browser harness, settings/modals/canvas/sidebar via
`obsidian-camera.mjs --docs`. It starts its **own Xvfb** display (repo devbox `xvfb`
package), so it is fully headless and does NOT need Scott's `:1` or a closed Obsidian —
unlike `npm run obsidian-shots`. It writes only to `docs/Media`, never `shots/`, so no gate
moves. Run it before a release; details in `visual-harness/README.md`.

## Key Architecture

- **One rendering strategy: Element Framework v2** (`src/framework/` —
  `ElementRegistry` + `ElementPipeline` + `ElementView`, declared elements in
  `src/elements/`). ALL 22 registered elements live on the framework (11 migrated +
  `ds-roll` (D5) + the ONE public D6 compendium-reference element, `ds-scc` (SC-149's
  catch-all: body = an SCC code, renders whatever that code is) + 4 D8 GM-subsystem
  elements —
  `ds-encounter`/`ds-montage`/`ds-project`/`ds-party` — + 5 D7 hero-suite elements —
  `ds-hero`/`ds-conditions`/`ds-resource`/`ds-surges`/`ds-tokens`); every legacy processor
  is retired (`src/drawSteelAdmonition/` holds only `EncounterData` + negotiation
  sub-views the framework reuses). **`ds-hero` is `hidden: true` as of 7.0.0** (SC-190,
  `registry.ts`'s `ElementDefinition.hidden`): fully registered and functional, but
  withheld from every discovery surface (`insert.ts`, `suggest.ts`) and the public docs
  pending edit-modal/rendered-content QoL work; the other four D7 elements are
  unaffected. Framework v2 replaced Vue 3 (2026-04-06 revert
  decision, executed by D1) — see `.repo-docs/architecture.md` for the full picture.
- **Sidebar host (D8)**: `src/framework/sidebar/` + `src/framework/host/
  SidebarBlockHost.ts` give any element a persistent `ItemView` leaf mount
  (`mode: "sidebar"`), zero element-code changes required — a running-session tracker
  that survives note navigation. See `.repo-docs/integration.md` → "Sidebar host (D8)"
  for the `_dse_anchor`/`onUpdate`/hand-off contract.
- **Compendium reference (D6)**: `src/services/CompendiumIndex.ts` (`cx.compendium`,
  threaded into the pipeline in `main.ts` right after `sccResolver`) is the typed-model
  accessor over the synced compendium (`getEntry`/`getEntity`/`getStatblock`/`query`).
  `src/elements/shared/withReference.ts`/`RefUnwrapView.ts`/`CardLayout.ts` give
  `statblock`/`feature`/`featureblock` and the 11 display-family DEFINITIONS a shared
  "whole-block reference OR inline YAML" contract (`scc.v1:`/bare-slug/`@path`/
  `[[wikilink]]`, by-SCC hybrid mode rendering the real resolved file's body). Compendium
  search + insert: `src/authoring/CompendiumSearchModal.ts` +
  `src/authoring/compendiumInsert.ts`.
- **`ds-scc` + the internal display family (SC-149)**: the eleven display elements
  (`ds-kit`/`ds-condition`/`ds-treasure`/`ds-ancestry`/`ds-culture`/`ds-career`/`ds-class`/
  `ds-title`/`ds-perk`/`ds-complication`/`ds-rule`) are **internal machinery, not public
  elements** —
  Scott's pre-release ruling: one maintained catch-all beats ten typed commitments. They
  are not registered by `main.ts`; `src/elements/scc/definition.ts` (`ds-scc`, strict
  SCC-code body) mounts their card views by resolved SCC type via `baseForSccType` →
  each element's `withReference` `.base` (and re-stamps `data-dse-element` to the resolved
  family, or 84 element-scoped CSS rules and every statblock/featureblock pref selector
  would miss — pinned by `test/dom/elements/sccStyleParity.test.ts`), and
  `visual-harness/entry.ts`'s `registerHarnessElementDefinitions` registers them into the
  harness's own registry so their fixtures/shots survive. Insert routing lives in `referenceAliasForType` /
  `snapshotAliasForType` (`src/services/typeAdapters.ts`): reference = `ds-scc` for
  everything but statblock/feature/featureblock; snapshot = those three only.
- **Legacy processor pattern**: Each not-yet-migrated `ds-*` element has a processor in
  `src/drawSteelAdmonition/`, registered in `src/utils/RegisterElements.ts`
- **Framework v2 element pattern**: each migrated `ds-*` element has a
  `src/elements/<name>/definition.ts` (`ElementDefinition`) + `view.ts` (`ElementView`
  subclass), registered in `main.ts`'s `registerFrameworkElementDefinitions()`
- **Models**: `src/model/` with `parseYaml()` static methods and AJV schema validation —
  shared by both strategies
- **SDK**: `steel-compendium-sdk` bundled at build time for data model parsing
- **Preferences (D4)**: descriptor-driven — `src/prefs/catalog.ts` owns the `DsePrefs`
  augmentation, the `PrefDescriptor` list, and the statblock presets; storage is a SPARSE
  `prefs` slice on `DSESettings` (debounced `saveData`, `main.ts
  createSaveDataPrefsStorage`). A descriptor reflects through either or both of two
  channels: `attr` (the `data-dse-*` vocabulary CSS reflows on) and, since SC-112, `css`
  (`{ varName, toCss }` — `reflect()`/`reflectCss()` write an inline `--dse-*` custom
  property on the root; `toCss` → `null` removes it, so defaults are inert). The Typography
  prefs (6 font slots + text/card size scales) are css-bearing and attr-less. The settings
  tab (`src/views/SettingsTab.ts`) renders FROM the descriptors — adding a pref = adding a
  descriptor. Per-block `prefs:` YAML overrides: `src/framework/prefOverrides.ts`
  (attr-less keys rejected — css-bearing prefs are global-only; so are `perBlock: false`
  keys, the conditional-DOM trio `sbCharLine`/`sbCharBox`/`sbVillain`, whose value the
  statblock view reads at BUILD time — an attribute-level override there renders corrupt).
  Every default is chosen so a vault that never opens Settings renders what it rendered
  before the pref existed.
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

- **NEVER hardcode a `font-size`.** Sizes come from the nine `--dse-fs-*` role tokens
  (`:root` in `styles-source.css`, "THE TYPE-SIZE ROLE SCALE") — all `em` ratios, so the
  plugin never states an absolute size and never fights the user's theme. Obsidian's
  absolute `--font-ui-*` sizes are prohibited in element content for the same reason.
  Read [`.repo-docs/font-sizes.md`](.repo-docs/font-sizes.md) before writing CSS that sets
  a size; `test/unit/build/fontSizeContract.test.ts` gates it (allowlist of pre-scale
  sites; it only shrinks).
- **Reading mode only** -- no Live Preview support
- Output must be CJS format for Obsidian
- Target ES2018
- `obsidian`, `electron`, and CodeMirror packages are external (host-provided)
- Compendium sync is manifest-driven and non-destructive (`src/data/CompendiumSyncService.ts`):
  only manifest-tracked files are updated/trashed; user files under the compendium root are
  never touched. Never reintroduce directory-wipe semantics.
