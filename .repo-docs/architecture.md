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
| `experimental.ts` | SC-406 — the 7.0.0 release gate: `"experimental": true` in `data.json` (absent = off), undocumented, not in the Settings UI or `DEFAULT_SETTINGS`. Read ONCE in `main.ts onload` (`setExperimental(readExperimentalSetting(settings))`, right after `loadSettings`); every other module asks `isExperimental()`. **Default is OFF** — so tooling that never loads a `data.json` (the docs/harness build) sees the shipped state; tests (`test/setup/experimental-on.ts`, `test/mocks` `Plugin.loadData`), the visual harness (`visual-harness/entry.ts`) and the lifecycle/camera scratch vaults (`data.json`) opt IN so no fixture or gate moves — except `npm run docs-shots`: its Obsidian half (`obsidian-camera.mjs --docs`) forces the switch OFF (`seedExperimental(file, false)`) so docs images depict the shipping product, and its browser half (harness, ON) is guarded by `visual-harness/docs-deferred-guard.cjs`, which rejects a manifest entry for a `deferred` element. OFF: the nine `ElementDefinition.deferred` elements (`ds-encounter`/`project`/`party`/`conditions`/`resource`/`surges`/`tokens`/`roll`/`hero`) are effectively `hidden` (`isDefinitionHidden`: `/ds`, Insert commands) and `ElementPipeline.run` renders `renderDeferredCard` for them before touching the block's source (no parse, view, write or anchor); the sidebar (`registerDseSidebar`, ribbon, the three commands, the encounter hand-off, the Pin/Unpin menu items) is not registered; `activePrefDescriptors()` omits `authoringControls` and `printPreview`. The legacy `download-data-md-dse` alias is removed outright (not gated). |
| `registry.ts` | `ElementRegistry` — pure in-memory `id`/alias → `ElementDefinition` lookup. No Obsidian coupling; unit-testable without a real `Plugin`. Rejects duplicate ids/aliases and `shape: "persisted"` definitions missing `serialize`. |
| `pipeline.ts` | `ElementPipeline` — the render pipeline: parse → validate (AJV) → resolve refs → `createView` → mount, behind **one** error boundary (`renderErrorCard`, four failure stages: `parse`/`schema`/`reference`/`render`). Constructed once per plugin load with the service bundle; `run()` executes once per rendered block instance. |
| `view.ts` | `ElementView<M>` — abstract view lifecycle base (extends Obsidian `Component`). Owns DOM (`rootEl`) and the current model; subclasses implement `onMount` (required) and optionally `onUpdate`. Implements the debounced (~400ms) `persist()` write-behind path for `shape: "persisted"` elements, flushed on unload. Also ships a `HeroPanel<S>` stub (unused in D1; reserved for a later effort). |
| `context.ts` | `RenderContext` — the immutable per-block-instance DTO the pipeline builds and hands to `createView`/views: `app`, `plugin`, `settings`, `host`, `mode`, and the service seams (`theme`, `prefs`, `refs`, `session`, plus the optional `roll` — a real `RollService` since D5, supplied by the pipeline; see "Rolling" below). Frozen at construction. |
| `host/BlockHost.ts` | The `BlockHost` interface — the single seam between a mounted `ElementView` and *where* it lives (`containerEl`, `canPersist`, `replaceSource()`, `addChild()`, `getBlockInfo()`, `blockKey()`). `RenderMode` is `"reading" \| "live-preview" \| "sidebar"`. |
| `host/ReadingModeBlockHost.ts` | The only implemented `BlockHost` (D1 ships reading mode only, matching the standing 2024-08-18 reading-mode-only decision). Fixes two legacy bugs of the former `src/utils/CodeBlocks.ts`'s approach (that file was deleted in SC-454): atomic read-modify-write via `Vault.process` (no lost updates from concurrent edits) and fence-language preservation on write-back (no silent alias-to-canonical rewriting). SC-343: keeps a durable identity (last known body/line/language), splices at the section range only when the live content there still holds that body, otherwise re-locates the block by body (nearest line; identical twins by distance), and drops an unplaceable write via `droppedWriteNotice.ts`. SC-340: registry-owned — `rebind(el, ctx)` re-points the host at the section that just adopted its view; `notePersistIntent()` only refreshes the host's durable position (`readSection()`), called at `persist()` time, ~400ms before the write — the claim ticket itself is recorded by `ViewRegistry.noteWrite` inside `replaceSource`, immediately before the `Vault.process` call, so the echo rebuild it causes can claim its own view back. SC-544: `replaceSource` first writes every other pending view of the note (`ViewRegistry.flushPendingWrites`, synchronous, before its own `readSection()`), so a second click inside the first block's debounce is placed through an element still on its own block. |
| `host/droppedWriteNotice.ts` | SC-343: the dropped-write Obsidian Notice ("…was not saved — the block changed on disk first."), at most one per note per 5 s, plus a `console.warn` on every drop. |
| `host/viewRegistry.ts` | SC-340 — `ViewRegistry`: a plugin-scoped `Component` that OWNS every reading-mode `ElementView`, so a view can outlive the section it was drawn in. `own()` takes a freshly mounted view; `noteWrite()` records a claim ticket (body + timestamp) before a write; `claim(docId, sourcePath, body)` hands back the one live, unclaimed view whose recent own write produced exactly that body (newest matching ticket wins — a multiple-candidate match is recorded in `stats.ambiguous` but still resolved, never refused on that alone), refusing only on a same-docId+position collision (§6.2); `release()` unloads a view for real (its registered flush-on-unload runs after callbacks registered later, e.g. a modal's close — Components unload children LIFO). `stats` (`claims`/`misses`/`releases`/`ambiguous`/`collisions`) is what the gate and `liveEntries()` (`app.plugins.plugins['draw-steel-elements'].viewRegistry`) inspect. Kill switch: `enabled` (`viewAdoption !== false` in `data.json`, default ON, not in Settings UI). |
| `host/adoptView.ts` | SC-340 — `adoptView(registry, entry, el, ctx)`: re-points the host at the new section and moves the view's root into the new (still-detached) `el` SYNCHRONOUSLY, so Obsidian measures/inserts the section with its real content. The root carries `data-dse-moving` (`MOVING_ATTR`) for the exact duration of the move — Chromium fires a focused input's `blur`/`change` DURING `appendChild` itself, while the node is still connected, so `!el.isConnected` alone can't catch it; a control (the kit stepper) that must not commit a half-typed draft on that blur checks the marker via `closest()` instead. `captureFocus`/`restoreFocusWhenConnected` save and restore focus + caret across the move (5000 ms backstop; never steals focus back if the user has already clicked elsewhere). |
| `host/remountReused.ts` | SC-481 — `ReusedElementRemounter`: when a block with identical twins is written, Obsidian hands the written block's OLD rendered element to the next identical block below it and calls no processor for it, so the element keeps the writer's live view (wrong value at the twin, a click writes the writer's block, and the element is emptied once the writer is adopted). Every processor call now (a) `remountVacated`: draws a fresh view into the element the adoption left, if Obsidian still resolves a section for it, and (b) `reconcile(sourcePath)`: releases and redraws any live view of the note whose element now sits on a plain, closed fence whose body is not the view's `knownBody` (`ReadingModeBlockHost.reusedBlockBody`, read-only; an element still on the line the view's last write landed at is its own block waiting for its rebuild, and a quote/callout window is read for the fence inside it by the one shared test `fenceOnElement`, which `remountVacated` uses too; Live Preview callout widgets get no section and no processor call after a write, so they are judged from the editor instead: see `host/livePreviewReconcile.ts`). `reconcile(sourcePath, within?)` takes the editor view of an editor update (SC-537): then only the views drawn inside that editor are judged, a callout widget by the section that editor reports for it. Scoped by path, not docId: Live Preview gives every widget its own random docId. The claim collision guard (`viewRegistry.ts`) compares the line the winner's write LANDED at (`lastWriteLineStart`), not a live read of an element Obsidian may have reused. Gate: lifecycle G-S53. |
| `host/livePreviewReconcile.ts` | SC-537 — `livePreviewReconcileExtension(remounter)`: one CodeMirror `EditorView.updateListener` (registered with `plugin.registerEditorExtension` in `registerFrameworkElements.ts`). With two identical callouts in Live Preview, after a write to the upper one Obsidian hands its OLD widget (and the writer's live view) to the lower slot without calling a processor, and a callout widget's `getSectionInfo` is null, so SC-481's processor-time `reconcile` never sees it. On every doc-changing, scroll (`viewportChanged`) and selection (`selectionSet`) update (a twin whose widget was off screen, or raw source, when the write landed is handed the writer's widget too, and CodeMirror attaches it later in such an update) the listener takes the note path from `editorInfoField` and runs `reconcile(path, update.view)`: the views inside that editor whose widget is a Live Preview callout are judged by `ReadingModeBlockHost.reusedBlockBody(linesOf, scope)`, with the callout section CodeMirror reports (`posAtDOM`) over the update's own document text, and a view whose widget now sits on another block is released (`reused-by-twin`) and redrawn from that block, before the user can click it. Plain Live Preview widgets, Reading views and other panes are not judged here (the `lastWriteLine` skip and the SC-455 ordinal rule are unchanged; each pass reads a callout's block list once, `quoteOrdinal`'s `cache`, because the pass now runs on every scroll). Gate: lifecycle G-S57 (2 callouts, form Save, 3 callouts, two blocks per callout, nested, far apart, a title click right after the write). |
| `host/replugRemount.ts` | SC-545 — a plugin off/on with a note open in Live Preview. Obsidian answers the processors' (un)registration (`post-processor-change`) by re-rendering Reading views and rebuilding Live Preview CODE-BLOCK widgets, but a Live Preview callout (`.cm-embed-block.cm-callout`) or embed (`.internal-embed`) widget is reused while its text is unchanged and keeps its cached DOM, so no processor runs for it: the card in it is the OLD instance's (its view unloaded, its `registerDomEvent` listeners gone, owned by no live `ViewRegistry`) and a click did nothing. **A (normal path):** `ViewRegistry.onunload` calls `stashForReplug(entries)` (after every view has unloaded and flushed), which leaves on each live card's element in such a widget `{ v: 1, ctx, alias, body }` under the key `__dseReplugV1` plus `data-dse-replug`; the new instance's `ReplugRemounter.run()` (from `workspace.onLayoutReady`, registered in `registerFrameworkElements.ts`) empties each marked element (`replaceChildren` removes the old root and with it the click shield's listeners) and draws a fresh card with `ReusedElementRemounter.mount`, using the widget's own `ctx` so the new render child is bound to the widget. **The stash is a cross-version contract** (an update: the old build writes, the new one reads): the key carries the version, it holds only Obsidian-owned objects and plain data (never a reference into the instance that wrote it), and `readReplugStash` validates the shape — a stash it cannot read is dropped and the note is left to B. **B (fallback, rare):** after A settles, a view that still has a raw DSE fence or a DSE card no live view owns inside a callout/embed widget (a write that was pending at disable, a note opened while the plugin was off, the first update from a build without the stash, and an embed whose card Obsidian replaced with the raw fence while the plugin was off: seen on some toggles at SC-545 r4, not reproduced in the r5 re-review's 18 toggles, trigger not identified, and the embed's renderer does not listen to `post-processor-change`; nothing redraws it after enable) is rebuilt with `setViewData(getViewData(), true)` + its ephemeral state, then the pixel `scrollTop` is put back (measured 0 px shift in a tall note, 476 px without it); this costs the note's undo history and redraws every widget, so a normal off/on must never reach it (asserted). **Off-page cards (SC-545 r4):** a card CodeMirror had taken out of the page at the toggle (about a screen or more from the visible part of the note; its widget keeps its DOM, detached) is stashed too (a detached root is judged by the widget classes alone) and is drawn when the editor puts that DOM back: `livePreviewReconcileExtension(remounter, replug)` calls `ReplugRemounter.remountReattached(update.view.dom)` on every doc/viewport/selection update, which is one `querySelector` when nothing is marked (about 4-7 µs; no measurable change in a 300-keystroke or scroll loop). **Not covered:** cards on a canvas and in hover popovers (not markdown leaves); during the one-time update from a build that never stashed, a card that is off the page stays dead until the note is reopened (B sees only what is in the page, and no rebuild is run at scroll time). `dispose()` (plugin unload) makes a run that is still in flight harmless: the emptied elements are marked again for the next instance. Gate: lifecycle G-S63 (phases a-h), jest `test/dom/framework/replugRemount.test.ts`. |
| `host/livePreviewFocusCarry.ts` | SC-602 — keyboard focus across an element's OWN save in Live Preview. `carryOwnSaveFocus(entry)` (called from `ViewRegistry.beforeRelease`, plus a CodeMirror `ViewPlugin` for the identical-twin hand-off) remembers the focused control (`captureControlFocus`) and arms a one-shot successor request (`armSuccessorFocus`, SC-518's machinery in `chrome/focusHandoff.ts`) keyed by the block the write landed in; the new mount's `claimChromeFocus` focuses the control's successor. See "Keyboard focus across an own save in Live Preview" below. |
| `host/livePreviewStateCarry.ts` | SC-605 — a view's opt-in session state across its OWN save in Live Preview. `carryOwnSaveState(entry)` (same capture points as the focus carry above: `ViewRegistry.beforeRelease` + a CodeMirror update limited to Obsidian's `setViewData` transaction) calls the old view's `carryState()` and stores it, keyed by the block the write landed in and scoped to the pane/embed; `pipeline.ts` calls `takeCarriedState` before `view.mount` and hands it to the new view's `receiveCarriedState()`. Only the initiative tracker implements the seam today (its Malice quick-add draft). See "View state across an own save in Live Preview" below. |
| `chrome/windowHandoff.ts` | SC-608 — a window (modal) an element opened is still closed when its view unloads (F1 §4.5), and that is what an outside edit that redraws the block does (Reading view, Live Preview; the pinned sidebar refreshes the view in place instead, see `InitiativeView.update`). The unloading view calls `handOffAfterOutsideClose` once the window has closed. It finds the NEW root at the slot the window opened in (same `sourcePath`, same pane / embed, same position among that pane's roots of the element, plus the root count then; not the block key, whose fence line an edit above moves; roots publish a record with `publishWindowRoot`, and roots of unloading views are ignored), looking at once and then watching the document for 3 s (Reading view draws the new section first, Live Preview closes first), and waits one task for the pipeline's chrome panel. The Notice "The note changed outside, so this window closed without saving" shows once, only when the successor's disk content differs from the closing view's (`InitiativeView.diskContent()`: the note's own text of the block when the host knows it, `lastKnownBody`, so a YAML comment counts; else the model's serialization; updated at every flush through the `setSerializer` override). Focus does NOT depend on that check: it goes to `controlSuccessor` of the token taken when the window opened (`controlFocus.ts`, SC-588), only while focus is free in the root's own document or sits on the dying view's own control, never after the user moved focus elsewhere, and not when the pane's root count changed since the window opened (an edit inserted or removed a tracker, so the position no longer says which is ours; an unpublished error card at a changed slot counts as found, so the Notice is not held up). After the first success the watch stays armed for `HANDOFF_SETTLE_MS` (1500 ms, extended by each success) and re-claims each later redraw of a Sync burst while focus is on `<body>`. The watch belongs to the plugin (`owner`: a child Component, so unloading the plugin cancels it; none starts when the plugin is not loaded). A window opened with the mouse (no token) gets the Notice only; no successor (note closed, block deleted) gets nothing. The initiative tracker's sidebar path: a refresh while a window is open keeps the window and the model when the incoming block equals what the view last loaded or wrote (`disk.ser`, not the live model, which can be ahead of the disk by an unwritten edit), and otherwise closes it (same Notice and focus) before the rebuild, because the window's callbacks hold the old model's objects (before SC-608 the Apply was written into a model nobody serialized). Gate: `test/dom/elements/initiative-outside-edit.test.ts` (O01..O26), `sidebarInitiative.test.ts` (SC-608, S01..S08), e2e `INIT-W01..W13`. |
| `host/LivePreviewBlockHost.ts` | Deliberately unimplemented stub — every member throws. Documents the CM6 realization of each `BlockHost` member for a future Live Preview effort; not to be constructed until that effort supersedes the reading-mode-only decision. |
| `seams/theme.ts` | `ThemeService` — stamps `data-dse-theme="<active>"` on every element root, token → CSS var resolution (`cssVar()`). Minimal in D1 (effectively one constant theme); the token/theme value space is a later effort's scope. |
| `seams/prefs.ts` | `PreferenceStore` — a typed preference store (`DsePrefs`, built-in `theme` key only) backed by an injected `PrefsStorage` adapter, with `reflect()` stamping any `attr`-bearing preference as `data-dse-<attr>` on element roots and writing any `css`-bearing preference (SC-112) as an inline `--dse-*` custom property (`reflectCss()` is the css-only twin for roots outside the pipeline, e.g. managed modals). The preference catalog, settings tab, and per-block overrides are D4's scope — see "Preferences (`src/prefs/`, D4)" below. |
| `seams/refs.ts` | `ReferenceService` — generalizes `src/utils/ReferenceResolver.ts` into a provider chain (`RefProvider`). Ships `at-path` (`@Creatures/Goblin`) and `wikilink` (`[[Thorn Dragon]]`) providers ported verbatim from the legacy resolver, plus a reserved, always-failing `scc`/`scc.vN:` provider placeholder for a future effort to supersede. `resolveDeep()` walks arbitrary parsed YAML. Does **not** replace `ReferenceResolver.ts`, which stays live for legacy elements. |
| `session.ts` | `SessionStore` — plugin-scoped, in-memory, best-effort UI state (e.g. collapse open/closed) keyed by `(blockKey, slot)`. Cleared on plugin `onunload`. Pure — no Obsidian imports. Never used for document state. |
| `validation.ts` | `ValidationService` — a plugin-scoped AJV wrapper (2019 dialect, `ajv-keywords` + `ajv-errors`, ported from `src/utils/JsonSchemaValidator.ts`) that compiles and caches one validator per element id (fixing the legacy validator's recompile-on-every-call cost). One instance per plugin load, dropped on unload — no module-global singleton (unlike the legacy validator, which stays a singleton for its own unmigrated clients). |
| `registerFrameworkElements.ts` | The framework → Obsidian wiring loop: for every `ElementDefinition` currently in the registry, registers one `plugin.registerMarkdownCodeBlockProcessor` per alias, each invoking `pipeline.run(def, source, new ReadingModeBlockHost(...))`. A one-shot pass over `registry.all()` at call time — called once from `main.ts onload`, after the registry is populated. SC-340: constructs and returns the plugin's one `ViewRegistry` (`{ viewAdoption }` option); each processor call first asks it to CLAIM the write behind the incoming render before falling back to a fresh `pipeline.run` — a claim ADOPTS the live view (`adoptView.ts`) instead of building a new one. `main.ts` holds the returned registry on `plugin.viewRegistry`. |
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
| Stamina Bar | `stamina-bar/` | `persisted` | `ds-stam`, `ds-stamina`, `ds-stamina-bar` | First (and only, in D1) persisted element: edits write back via `ElementView.persist()` → `serialize()` → `host.replaceSource()`. `serialize()` reuses `@model/StaminaBar`'s own field/order shape (`stringifyYaml(model).trim()`) to stay byte-compatible with the legacy write path for every key the block declared; since SC-466 it omits a default key (collapsible, collapse_default, current/temp_stamina, height, style) the source never declared and that is still at its parsed default (SC-482 moved this onto the shared `shared/undeclaredDefaults.ts`, below). Was the last Vue element — its migration unblocked Vue removal (D1 Task 4). |
| Negotiation Tracker | `negotiation/` | `persisted` | `ds-nt`, `ds-negotiation`, `ds-negotiation-tracker` | Plan 05 (F1 §6 step 8): `NegotiationView` re-expresses the deleted `NegotiationTrackerProcessor`'s orchestration and REUSES the four sub-views still under `src/drawSteelAdmonition/negotiation/`, which now take an injected `persist: () => void` instead of calling the former `CodeBlocks.updateNegotiationTracker` (deleted in SC-454). No schema (the legacy element never had one). Active tab is `SessionStore` state; rendering never writes (the legacy processor persisted during render — deliberately dropped). Since SC-482 `serialize()` omits every key the source never declared and that is still at its parsed default (current_patience / current_interest while unchanged, motivations / pitfalls `[]`, currentArgument, i5..i0, and each Motivation's / Pitfall's own absent name / reason / hasBeenAppealedTo); a block that declares every key serializes byte-identically to the legacy writer. |

**Writes add no default keys the user never wrote (SC-466 / SC-482).** Several parsers fill
defaults into the model (counter `min_value` / `value_height` / `name_height` / `current_value`;
project `accrued` / `rolls` / `current_respite`; montage `rounds` / limits / `successes` /
`failures` / `current_round`; party `members: []`; encounter `party: {}` / `monsters: []`;
negotiation, above; stamina bar, above). `src/elements/shared/undeclaredDefaults.ts` is the one
mechanism: `recordingDefaults(parse, keys)` reads which of `keys` the source left absent
(a key present with value `undefined`, or a null/blank body, counts as absent) BEFORE the inner
parse runs — party and encounter fill the incoming `data` in place — and snapshots the value the
parse filled in; `omitUntouchedDefaults(model, dto?)` drops each recorded key whose value still
JSON-equals its snapshot (so a derived default, or an array/object default mutated in place, is
compared by value). The record is a module-private `WeakMap` keyed by the parsed instance (never
an own property, so `stringifyYaml` cannot write it), and a model the plugin built itself has no
record and serializes whole. When filtering leaves no keys at all, `stringifyOmittingUntouched` writes an empty body only if
the source body was null/blank (montage, project); a mapping source is written as `{}` because
counter, negotiation, party and encounter cannot re-parse an empty body. Every key the source declared is written (even at its default),
key order is unchanged, and a re-parse records afresh. Initiative (SC-485) applies the same
rule per nested object (top, hero, group, creature, authored instance): its `parse` reads which
keys each object left absent before filling them, snapshots at the end of `parse` AND of
`resolveRefs` (statblock-merged `name` / `max_stamina` / `image` / `with_captain` and the stamina
derived from them are fills too), and `serialize` walks a nested DTO. A squad's pool and its
captain-bonus trio (`minion_stamina_pool_max`, `captain_bonus_active`, `captain_bonus_n`) are
written all-or-nothing, because a written pool stops re-parse from re-deriving the trio. An absent
`instances` list is written whole once it changes. Hero still writes its parser defaults
(deliberate). The encounter view's render-time `_computed` write is a separate question (SC-486).

Each element directory follows the same shape: `definition.ts` (the `ElementDefinition`,
registered in `main.ts`'s `registerFrameworkElementDefinitions`), `view.ts` (the
`ElementView` subclass), and — for Skills/Stamina Bar — `model.ts` (a thin `parse`/
`serialize` wrapper around the pre-existing `@model/*` class, kept renderer-agnostic so
the same model classes still back the legacy validator/schemas).

### Steel card compositions (`CardLayout.steel`, plan 24 / SC-100; de-branched by SC-144)

The display-card family (the eleven D6 reference cards — kit, condition, treasure,
ancestry, culture, career, class, title, perk, complication, rule — all rendered by the
shared `DisplayCardView` driven by a declarative `CardLayout<M>`,
`src/elements/shared/CardLayout.ts`) builds its DOM from a declarative layout. Most
families build one shape; a family may opt into a richer, composed shape instead.

**History worth knowing, because the shape of the code still reflects it.** SC-100 added
this as a THEME-aware seam: the composition rendered only under the Steel theme, the other
theme got the base DOM, and a mounted view subscribed to `cx.theme.onChange` so flipping
the picker swapped branches live. SC-144 dropped the legacy theme, which collapsed all of
that — with one theme, the branch is a static property of the layout. It is now a plain
"does this layout have a composition" check, and the subscription, its re-entrancy guard
and the tear-down/re-render path are gone.

- **The slot.** `CardLayout<M>` has an optional `steel?: SteelCardComposition<M>`
  (eyebrow + crest for the shared `cardHead`, an optional `crestSize`, and ordered
  `SteelBand`s — each band an optional small-caps head plus its own `render()` into a
  positioned container). Absent (every layout except kit today) ⇒ zero behavior change:
  the view never takes the composition branch.
- **Branch condition.** `DisplayCardView.computeBranch()` is `layout.steel ? 'steel' :
  'base'`, evaluated once at mount. The base branch is the pre-seam `onMount` body **moved
  verbatim** (same statements, same order) — it is the old code relocated, not a copy, so
  the base DOM cannot drift.
- **The branch cannot change at runtime.** Nothing re-renders a mounted card on a theme
  event, and the view registers no theme subscription at all. If you ever need one back,
  note what it cost the first time: a re-enterable `onMount` stacks one leaked closure per
  `update()` call unless it is guarded.
- **`cardEl` still matters.** `renderBranch()` tracks the `.dse-card` node it created,
  because SC-145's authoring pencil anchors to it (`authoringAnchor()`) rather than to the
  element root — the pencil would otherwise render outside the card's border.
- **The two invariants** (contract-tested in
  `test/dom/elements/displayCardBranch.test.ts`):
  1. Branch selection follows the layout, not the theme: a layout with `steel` renders the
     composition, one without renders the base DOM, and neither changes with the active
     theme id (including a hand-set snippet id).
  2. No theme subscription is ever registered, for either kind of layout, across mount and
     repeated `update()` calls.
- **Print never branches the render** — `data-dse-print` stays a pure CSS attribute over
  whatever DOM was built. Corollary, and the one that costs money: a composition for a
  family necessarily changes that family's frozen `*--steel-print.png`, which needs its own
  sanctioned single-line rebaseline sign-off (see the workspace `dse-verify` skill's freeze
  section; SC-100's `kit--steel-print.png` was the first). Since SC-144, `steel-print` is
  the ONLY frozen class, so this is the whole freeze exposure of a composition.
- **First consumer: kit** (`kitLayout.steel`, `src/elements/display/layouts.ts`): crest +
  kind-eyebrow head via `cardHead`, a boxed Equipment band, "Kit Bonuses" as two rows of
  four **fixed-slot** stat tiles via the generic `statTiles()` primitive
  (`src/framework/kit/statTiles.ts`, its own `.dse-tiles*` class grammar — an absent bonus
  renders its slot as an em dash, never an omitted cell), then the signature ability
  through the existing `renderFeatureList` sub-render (deliberately richer than the site's
  tile). Remaining display families are sequenced as SC-120 — the seam + primitive make
  each one layout-data + CSS + one sanctioned rebaseline. (SC-149 did not change any of
  this: the display families' LAYOUTS are all still live — they are what `ds-scc` renders
  once it resolves a code — only their ten typed code-block languages were retired.)
- **Dark-mode material rule** (SC-100 visual-gate finding — read before styling any sunken
  surface inside a Steel card): the site's "rich" dark tiles carry **no gradient of their
  own**; the richness is the parent card's diagonal gradient bleeding through
  **translucent-black** fills (`.sc-card__stat` `rgba(0,0,0,.25)` dark / `.04` light;
  `.sc-kit__equip` `rgba(0,0,0,.22)` dark / `.04` light). Two selectors
  (`.dse-tiles__cell`, `.dse-kit__equip`) carry the site's literal translucent-black
  values with light-mode twins. **SC-117 closed the general case:** the shared
  `--dse-surface-sunken` token used to resolve under Steel dark to a **6%-white wash** (and
  under Steel light to opaque `#eaeeef`) — the opposite direction, occluding the card
  gradient on all 13 of its declaration sites — and now resolves to the site's own
  `rgba(0,0,0,.18)` dark / `rgba(0,0,0,.02)` light. The four surfaces whose site value
  differs from `.18` carry their own literal, SC-100-style: `--distance`/`--target` cells
  `.2/.03`, `.dse-sb__item` `.22/.03`, `.dse-sb__kv` `.16/.024`. The rule for any NEW sunken
  surface inside a Steel card: reach for the token, and only hardcode a literal when the
  site measurably uses a different step of its ladder.

### The action-type accent: crest glyph + usage text, no spine; the nested-card frame stays (SC-558; was plan 25 / SC-101–103)

The plugin used to draw a coloured 3px left bar on every ability/feature card, keyed off
`[data-dse-act]`. **SC-558 (Scott's pick A, 2026-11-10) removed it everywhere, screen and print**,
together with its padding lane, its rounded-end rules, the standalone suppression, the flat-mode
hides and the print `print-color-adjust` arms (the same ticket removed the tier-row, montage-strip,
featureblock-advancement, error-card and dead statblock-role stripes; DESIGN.md rule 7). The action
type is now carried by the crest glyph's silhouette (`crestIconFor`) and the usage text. **Kept:**
`data-dse-act` and the `--dse-act` alias (the crest glyph tints from them), and the nested-card
**frame** the bar used to be the left edge of. Read this before touching `.dse-feature[data-dse-act]`,
`renderFeature.ts`'s `actionTypeOf`, or the statblock/featureblock head band. The frame the site
draws, and the plugin's mirror of it:

| context | selector (site) | selector (plugin, Steel) | frame? |
|---|---|---|---|
| standalone ability/feature card | `.sc-ability` (no `border-left` anywhere; `--act` only tints the crest + eyebrow) | `[data-dse-theme='steel'][data-dse-element='feature']` (top-level card; its NESTED cards get a screen-only arm, SC-168) | top-level card: no frame |
| nested in a statblock or featureblock list | `[data-sb-featstyle="card"] .sb__feat` / `[data-fb-featstyle="card"] .fb__feat` (byte-identical recipe in both sheets; the site still draws its `border-left` there, SC-564) | `[data-dse-theme='steel'] :is(.dse-sb, .dse-fb) .dse-feature__nested > .dse-feature` (ONE shared rule, not a per-family fork) | a full per-option card (fill, `9px` radius, real list `gap`, `.85rem` left padding) |
| kit / display-card family (`CardLayout`'s `.dse-card`) | — | untouched by the rules above (anchored on `.dse-sb`/`.dse-fb`/`[data-dse-element='feature']`, none of which `.dse-card` carries) | no frame — the frame rules cannot match `.dse-card` (pinned structurally in `steelMaterial.test.ts`). The kit's print shots did move in SC-558, but only because its unframed signature ability lost the old spine and its padding lane, not because a frame reached it |

The frame is **structure tier** (`[data-dse-theme='steel']`, no print exclusion — "print follows
structure"; only the nested card's *fill* is `:not([data-dse-print="on"])`, matching the site's own
`@media print` which keeps the radius/padding and drops only the background). The fail-safe: the
frame keys on `.dse-feature`, never on `[data-dse-act]`, so an option whose action type doesn't map
still gets its card. Full selectors, fixture-shaped fill values and the flat-mode interaction:
`styles-source.css` (inline comments there are the authoritative reference, this section is the map).

**A future contributor's most likely mistake:** styling only the featureblock (or only the
statblock) when a new nested-card concern comes up. Don't — it's one mechanism for both
families (`:is(.dse-sb, .dse-fb)`), and `test/dom/theme/steelMaterial.test.ts` pins the shape
so a per-family fork fails loudly.

**The `villain` action type (SC-102).** `ActionType` (`src/elements/feature/renderFeature.ts`)
is `'main' | 'maneuver' | 'triggered' | 'move' | 'none' | 'trait' | 'villain'` — the 7th and
newest member. `actionTypeOf` resolves it in this order: `isTrait()` → `trait`; a real
(non-blank, non-dash) `usage` line wins outright; otherwise a `cost` field starting with
"villain action" (`isVillainCost`, links stripped, case-insensitive) → `villain`; otherwise the
`ability_type` string ladder (villain matched **before** the generic "action" catch-all, since
"Villain Action 1" contains "action"). `crestIconFor` maps it to Lucide's `skull`. Token:
`--dse-act-villain` — `none` in the unscoped base, `#e0584b` in Steel dark (the site's literal, scheme-
invariant — it is **not** re-listed in the Steel-light block on purpose, matching the site
having no light variant), `#b03a2e` in both print blocks (a deliberate ink-economy darkening
with no site value behind it). Full token-block-by-block reasoning and the guard-test
arithmetic: workspace `docs/superpowers/dse-overhaul/D3-token-map.md`.

**Why the classifier reads `cost`, not `ability_type` (the compendium-format archaeology).**
steel-etl emits every villain action as `cost: "Villain Action N"` + the lone-dash
`usage: "-"` and **no `ability_type` field at all** — `ability_type: Villain…` occurs zero
times anywhere in `data-unified`. `isVillainCost` mirrors steel-etl's own classifier verbatim
(`HasPrefix(lower(trim(linkText(cost))), "villain action")`, `statblock_page.go`/
`featureblock_page.go`), including the markdown-link strip. Exactly **two** compendium shapes
have ever existed for villain actions (verified against `data-unified` history):

- **Legacy (vaults synced before the 2026-07-16 regen):** villain actions ship as **body
  markdown only** — a `> ☠️ **Name ([Villain Action](scc…) N)**` blockquote callout, no
  structured YAML feature at all. There is nothing to classify; these notes render as plain
  prose, unchanged, until the user re-syncs (which 7.0.0 already prompts for).
- **Current (2026-07-16 regen onward):** `cost: "Villain Action N"` + `usage: '-'`, no
  `ability_type` — the shape `isVillainCost` classifies.

No intermediate shape ever existed (`usage: Villain` / `ability_type: Villain` both have zero
hits in the whole history), so `cost` + the `ability_type` fallback (for hand-authored notes,
e.g. this element's own `example.yaml`) cover the entire structured universe — no compatibility
branch was needed. `renderFeature.ts`'s `isVillainCost` doc comment carries this same note.

**The statblock/featureblock diamond notch (SC-103).** The ◆ divider
(`kit/divider.ts`) mounts as a real, theme-agnostic DOM node — `statblock/view.ts` inserts it
unconditionally after the characteristics strip, and three test files assert it. Until SC-144
it **could not move or disappear in TS** without breaking the legacy theme; that constraint is
now lifted (with legacy gone, the node's only job is to be hidden under Steel), but **nothing
here has acted on it** — moving or deleting the node is a DOM change with its own freeze
exposure and belongs to its own ticket. Steel currently
hides it (`[data-dse-theme='steel'] .dse-sb > .dse-hr { display: none }` / the `.dse-fb`
twin) and paints the site's real notch — `.sb__head::after` / `.fb__head::after`, a 9px
role-hued diamond straddling the head band's bottom edge — as a Steel-scoped `::after` on
`.dse-sb[data-dse-role] > .dse-head` / `.dse-fb > .dse-head` instead (`position: relative` +
the `::after`, both structure tier so the notch's *placement* reaches print; the band's own
background/border stay `:not([data-dse-print="on"])`). This is the general pattern for any
future "the site draws X where the plugin's DOM node lives at Y" fix: hide the old node under
Steel, paint the site's version as new Steel-scoped CSS on an existing anchor — never relocate
or delete the shared DOM node itself.

Deliberately **not** built here (scope boundary, not an oversight): villain-action **banding**
(the site's default `<details>` grouping of villain actions into their own collapsible
section, `.sb__band--villain`) — the plugin has no band concept at all today, it is a named
setting in SC-123's inventory, and shipping only the inline presentation of an attribute whose
site-default value is "banded" would make the attribute a lie. Tracked as **SC-265**
(the original follow-up handle was lost in the 2026-08-27 Linear migration); related
context in SC-102 and SC-123.

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
  **`css`-bearing descriptors (SC-112)** are the second, independent reflection channel —
  same principle, different sink: a descriptor may carry
  `css: { varName: '--dse-…', toCss(value) }`, and the same `reflect()` subscription writes
  `toCss(value)` as an **inline custom property on the element root**
  (`style.setProperty(varName, …)`); a `toCss` return of `null` calls `removeProperty`
  instead, so **defaults are inert** — a root at defaults carries no inline style and the
  stylesheet's `:root` values win (the freeze bar). A descriptor may carry `attr`, `css`,
  both, or neither. The Typography prefs (six `font<Slot>` keys whose `''` sentinel means
  "Default (Obsidian vault fonts)" → `null`, plus `textScale`/`cardScale` whose site-mirrored
  `snap()` maps the 1.0 default → `null`) are all css-bearing and attr-less. Adding a
  font/scale pref is still just adding a descriptor — no new wiring. Managed modals
  (`framework/kit/managedModal.ts`) call `reflectCss()`, the css-only twin — deliberately
  not `reflect()`, since modals must not receive the element-root attr stamps; per-block
  `prefs:` overrides reject attr-less keys (`prefOverrides.ts`), so css-bearing prefs are
  global-only by design.
- **Settings tab** (`src/views/SettingsTab.ts`): groups descriptors by `PrefUi.group` in
  `GROUP_ORDER` and renders one `Setting` row per descriptor — no per-pref branching.
  SC-112 additions: `ui.advanced` rows collapse behind a per-group `<details>` ("Advanced";
  the group reset still resets them), and the `'font'` control renders a curated dropdown
  led by the uniform "Default (Obsidian vault fonts)" option, a "Custom…" free-text entry
  (sanitized via `prefs/fontStacks.ts`), and a user-activation "List installed fonts"
  affordance (`queryLocalFonts`, feature-detected — curated+Custom is the unconditional
  fallback). Sliders (`textScale`/`cardScale`) use `prefs/scale.ts`'s site-mirrored
  ranges/step/snap.
  `onChange` calls `prefs.set()` directly (no Apply button): `set()` notifies `reflect()`'s
  subscribers synchronously, so open elements reflow live behind the dialog. Per-group and
  whole-tab reset actions write descriptor defaults (sparse storage then drops them). The
  Statblock display group also renders the preset dropdown and a live preview
  (`SettingsPreview.ts`), both wholly derived, never persisted. SC-123 added a
  **Featureblock display** section (`fbFeatureStyle`/`fbStats`) and five secondary
  Statblock-display rows (`kwUsage`/`distTarget`/`sbCharLine`/`sbCharBox`/`sbVillain`,
  all `ui.advanced`); the preview's SUBJECT now follows the section — a featureblock
  under the featureblock page, the canned statblock everywhere else.
- **Conditional-DOM preferences (SC-123)** — the one class of pref that is NOT a pure CSS
  reflow, and the reason it exists. Three keys change what the statblock view BUILDS:
  `sbCharLine`/`sbCharBox` (the merged `"Might +2"` text node vs the site's
  `.dse-sb__char-box`/`-v`/`-l` split) and `sbVillain` (villain actions inline vs lifted
  into one kit `collapsible()` band). Their DEFAULT values emit exactly the DOM the element
  emitted before, which is what kept the then-frozen legacy shots byte-identical (SC-144
  retired those; the reason for the defaults is now history, and revisiting them is a live
  design question filed as its own ticket) — a
  plain always-on split was tried in SC-10 Task 4 and reverted because two inline spans
  moved Chromium's sub-pixel text shaping. Consequences: the view subscribes those three
  keys to a remount (the D5 rolling-pref mechanism, `src/elements/statblock/view.ts`), and
  all three descriptors carry **`perBlock: false`** — a per-block `prefs:` map warns and
  ignores them (SC-123 fix round, review M-1). The rejection is structural, not stylistic:
  `applyPrefOverrides` runs after the view mounted and re-stamps the ATTRIBUTE only, so an
  honoured override would dress the global DOM shape in a local attribute — measured as a
  characteristics cell reading `"+2Might"` (global `two`, block `one`) and, for
  `sbVillain`, a silent no-op with the band still built. Adding another conditional-DOM
  pref means repeating exactly that trio of moves: build the old DOM at the default value,
  subscribe the key to a remount, mark it `perBlock: false`.
- **Per-block `prefs:` overrides** (`framework/prefOverrides.ts`): a reserved `prefs:`
  map, presentation keys only. `extractPrefOverrides` pops it off the parsed YAML BEFORE
  schema validation and `def.parse`; three classes are dropped with a `console.warn`, not
  an error card — unknown keys, attr-less keys (behavioral, or SC-112's css-bearing
  typography; those use the block's own `collapsible:`/`collapse_default:`, which the
  chrome reads from the raw keys — `chrome/collapsedKey.ts` `extractCollapseKeys`), and
  `perBlock: false` keys (the conditional-DOM trio above). `applyPrefOverrides` pins the override AFTER
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
| `ModalProcessor.ts` | Modal dialog utilities. |
| `common.ts` | Shared utility functions. |

### Views (`src/views/`)

- **Responsibility:** Obsidian modal dialogs for interactive elements.
- **Key modals:** `ConditionsModal` (SC-186 — manage an actor's active conditions: add
  via autocomplete, delete, and an inline Duration/Color/Effect editor per row; replaced
  the older two-modal `ConditionSelectModal`/`CustomizeConditionModal` pair),
  `MinionStaminaPoolModal` (manage minion shared stamina), `StaminaEditModal` (edit
  stamina values), `ResetEncounterModal` (reset initiative tracker), `SettingsTab`
  (plugin settings UI).

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

**Write → adopt → release (SC-340):** a write records a claim ticket
(`ViewRegistry.noteWrite`, called from inside `host.replaceSource`) immediately BEFORE the
`Vault.process` call that causes it, because Obsidian reruns the code-block processor for
the new section during/just after that call (`notePersistIntent()` is a separate, earlier
step — it only refreshes the host's durable position at `persist()` time, ~400ms before the
write). The new section's processor asks `registry.claim(docId,
sourcePath, body)`: if the newest matching, unclaimed, live-at-that-position ticket is
found, `adoptView()` re-points the host at the new section and moves the view's DOM root
into the new (still-detached) `el` synchronously — the root carries `data-dse-moving` for
the exact duration of that move, so a control that must ignore the resulting blur (e.g. the
kit stepper, mid a half-typed draft) can tell it apart from a real one. The OLD render
child's unload is then a no-op (the view has moved on); the CURRENT render child's unload
is what actually releases the view — it flushes any pending write, then unloads. A write
that misses (no matching ticket, or a same-docId+position collision) falls back to a fresh
`pipeline.run`, exactly as before SC-340. `viewAdoption: false` in `data.json` (the hidden
kill switch, default ON) makes every claim miss, restoring the pre-SC-340 behavior.

**Identical twin blocks (SC-481):** Obsidian matches the new sections to the old ones by their text, so with two or three blocks of the same text a write to the upper one leaves its old element at the twin's place, with no processor call. `host/remountReused.ts` redraws that element from the block it now sits on (adoption path and every other path, Reading view and Live Preview plain widgets; Live Preview callout widgets, which get no processor call, by an editor update listener, `host/livePreviewReconcile.ts`, SC-537), and the claim guard reads the winner's line from where its write landed, so the writer is adopted on the first click (`registerFrameworkElements.ts` runs both steps after the claim). Lifecycle G-S53 (Reading view, plain Live Preview) and G-S57 (Live Preview callouts) pin it.

**Two quick clicks on identical blocks (SC-544):** the SC-481 / SC-537 redraws fix the card a twin is HANDED, but a click on the middle of three identical blocks within the upper's 400 ms debounce has an edit of its own still waiting when the upper's write lands. The rebuild after that write hands the waiting view's element to the next twin, and the debounced flush then resolved its block through that element at flush time (`readSection` -> `posAtDOM` / `getSectionInfo`), so the +1 was written into the twin below ([6,5,6] instead of [6,6,5]); SC-537's check cannot see it (the waiting view still holds the twins' common text). `ReadingModeBlockHost.replaceSource` therefore calls `ViewRegistry.flushPendingWrites(sourcePath, entry)` synchronously, before its own section read: every OTHER live view of the note with an edit still in its debounce (`ElementView.flushPendingWrite()`, a no-op when nothing is scheduled) writes now. Each of them reads its section before any `Vault.process` of that round runs, so every pending edit is placed while its element still sits on its own block; the `Vault.process` calls then chain. It covers the view's own debounced flush and the block edit form's Save (same method), Reading view, Live Preview plain fences and Live Preview callouts, one pane or two. The siblings are written in the order their views were mounted (the registry's order), once each, and the writer's own write comes last: a sibling's own `replaceSource` calls `flushPendingWrites` again, and the registry's re-entrancy guard (reset in a `finally`) makes that nested call return at once, so it never flushes the writer's own waiting view and the writes are not reversed (the `Vault.process` calls then chain). In Live Preview the two writes land about 2 ms apart and Obsidian brings them into the editor as one change, so one Ctrl+Z after two quick clicks reverts both (base: one step per write). Not covered: a non-DSE edit (typing in a twin, an outside edit) inside the 400 ms window, and a click in the ~10 ms between a write and its rebuild (SC-549); a block form opened while another twin's write is still pending (its Save lands in the twin below; exists on base, SC-552). The sidebar host (`SidebarBlockHost.replaceSource`) does not flush: its card pins one block, whose `_dse_anchor` line makes it differ from every twin, so its write cannot shift a twin's element (measured, SC-544 r2). Lifecycle G-S61 pins it.

**Plugin off/on with a note open in Live Preview (SC-545):** see the `host/replugRemount.ts` row of the host table. Reading views and Live Preview code-block widgets are redrawn by Obsidian itself; callout and embed widgets are not, so the unloading instance stashes each card's widget context and the next instance redraws it at layout-ready (A), and rebuilds a note only if a block is still undrawn (B).

**Keyboard focus across an own save in Live Preview (SC-602):** in Reading view a view's own write is ADOPTED (`viewRegistry.claim` + `adoptView`): the same root moves into the new section and `adoptView` puts focus back. Live Preview never adopts — every CodeMirror code-block widget gets its own random docId, so `claim` misses and the redraw is a fresh mount (new root, new view). The old root, with the pressed control in it, is removed by CodeMirror's DOM update and focus falls to `<body>`. Funky timing: Obsidian releases the old widget's render child INSIDE its Live Preview StateField, while the new editor state is computed, before any ViewPlugin runs and before the DOM update (measured on 1.14.4 and 1.15.1); that is the only moment the old root still holds focus, so `ViewRegistry.release` announces itself through `beforeRelease` first. The capture arms only when focus is inside a root in `.cm-content`, that root's view has an unconsumed own-write claim ticket (an outside edit has none), and the ticket has not armed before. The request is keyed by `lastWriteLineStart` (the block the write landed in; an identical twin's live `blockKey()` can already report the twin's line), is scoped to the pane, and is one-shot (claimed once, it is spent). A mouse press never focused the control, so nothing is armed. Reading view and the sidebar are never armed. If a future Obsidian unloads the widget after the DOM removal, nothing is armed and focus falls to `<body>` as before; the e2e INIT-L / CTR-L / CALL-L04 tests go red. `writtenBlockKey` rewrites the trailing `::<line>` of `ReadingModeBlockHost.blockKey()` (pinned in `livePreviewFocusCarry.test.ts`).

**View state across an own save in Live Preview (SC-605):** the same redraw also drops state a view holds that is not note content. `ElementView` has an opt-in seam for it: `carryState?(): unknown` (read while the old root is still in the document, `undefined` = nothing to carry) and `receiveCarriedState?(state: unknown): void` (called on the NEW view before `mount()`, so `onMount` builds with it; validate the shape, it is `unknown`). Only the initiative tracker opts in today: it carries its Malice quick-add draft (`QuickAddDraft`: amount, label, caret), which SC-589 already keeps on the view across Reading-view rebuilds, so every derived thing (hint, Add enabled, validation styling) is recomputed by `buildMaliceQuickAdd` exactly as there. `livePreviewStateCarry.ts` does the hand-off: capture at SC-602's capture points (the `beforeRelease` hook, plus the editor-update path for an identical twin), but armed by the own-write claim ticket ALONE, not by focus, because the press that saves is usually a mouse click and nothing holds focus then; an outside edit has no ticket, so it carries nothing. The carry is keyed by `writtenBlockKey`, scoped to the pane/embed of the old root, one-shot, and expires after `CARRY_TTL_MS` (1500 ms); a capture with nothing to carry drops an older unclaimed one. The claim sits in `pipeline.ts` BEFORE `view.mount` (the redraw's root is already connected there, measured 16/16, so there is no empty first frame); if a future Obsidian changes that ordering, nothing is carried and behaviour is as before SC-605 (e2e INIT-L09..L13/L15/L17 go red). Known, not observed: a hidden `display:none` copy of the written block mounted first would take the carry. Not carried: another copy's own draft (an identical twin, the same note in a second pane) when a sibling copy saves (SC-620). Reading view and the sidebar are never armed (no `.cm-content`; Reading view adopts the view, so its draft never leaves it, and SC-589 covers the sidebar).

**A pinned position: the block edit form on one of several identical blocks (SC-552, SC-549):** SC-544 flushes writes that are WAITING; an open form (or a click whose write is still in its debounce) is a different kind of waiting, and a write that lands above it - another block's click, an outside edit, Sync - makes Obsidian hand the form's rendered element to the identical block below it, or throw it away (two identical blocks, or the last of them). Save used to read its block through that element (`readSection`), so the edit landed one block down, and with the element thrown away the view unloaded and the form closed by itself with nothing saved. Opening the form "after the other writes" (flush, then open) was measured wrong: the clicked view itself sits on the block below once the write settles. So the form pins its block instead: `FormModal`'s constructor (it runs in the pencil's click handler, before any rebuild) asks the host for `BlockHost.pinPosition()` - the note text its section was read from and its own fence line (`BlockPin`) - and Save passes it as `replaceSource(body, { pin })`. Inside `Vault.process`, `ReadingModeBlockHost.pinnedTarget` maps the pinned line through whatever the note has become (`host/lineMap.ts`: common head and tail lines, then a Myers line diff, giving up past `LINE_MAP_MAX_EDITS` = 400) and accepts it only when a fence of the host's language opens there (a closed fence, or the trailing fence that never closes - the same rule as `locateUnterminatedTrailingFence`) with the body the host knows. No search by body (twins cannot be told apart that way, SC-480): a position, with today's placement as the fallback, so a pin that cannot be placed is no new refusal. It covers outside edits and Sync (in-app or on disk) of other blocks and text inserted above, but not an outside edit of the form's OWN block (the pin is refused and the fallback may write a twin; a global "pin or nowhere" rule was left to SC-556). **A form can outlive its view (narrows F1 §4.5, "the form closes when its view unloads"):** `openFormEditor` no longer uses `openManagedModal`: when the owner view unloads, a form that holds a pin and whose host offers `keepFormOpenOn()` (Reading view: the `ViewRegistry`, once the section's render child is gone, the note is still shown in some pane and the registry is still loaded) stays open, hung on a child `Component` of that registry which is removed again when the form closes (nothing builds up across forms); unloading the plugin still closes it, and so does the note leaving the screen (its pane closed or navigated away: the form closes with its view as F1 §4.5 says). That form saves strictly (`pinOnly`): a pin that cannot be placed writes nothing, shows the dropped-write Notice ("the block changed on disk first") and leaves the form open, because the block may be gone and the fallback would write the twin that is left. Forms that were not kept open, and the sidebar's (no `pinPosition`), keep today's behaviour; SC-523's own Live Preview self-close (the form's OWN click still pending) is unchanged. **SC-549 (wide):** the first `notePersistIntent` of a pending round also pins the card's block (`pendingPin`, not re-pinned by later clicks of the round), and the view's own `fromView` write uses and clears it, so a + followed within 400 ms by typing in the note or an outside edit above lands in the block clicked. Gate: lifecycle G-S64 (the plugin's 400 ms timer held and fired by hand; phases (a)-(q)), `test/dom/framework/twin-reuse.test.ts` (SC-552 block), `reading-mode-host-pin.test.ts`, `lineMap.test.ts`.

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
| `fflate` (dev) | Zip extraction for compendium downloads (bundled; SC-328 — JSZip's legacy-browser polyfills injected a dynamic `<script>` element, rejected by Obsidian's community-plugin review) |
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
